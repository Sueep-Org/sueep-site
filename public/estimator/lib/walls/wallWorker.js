// Wall extraction worker: fast, downsampled, produces polyline segments
// Message: { type:'build', width, height, data: ArrayBuffer, maxDim?: number }
// Reply: { type:'walls', segments: [{ id, points: [{x,y}...] }] }
//
// Pipeline: threshold to a binary ink mask, clean it up with morphology,
// then SKELETONIZE it down to a 1px-wide centerline and walk that skeleton
// as a graph, cutting it at corners/T-junctions. That last step is the
// piece that matters: a blob/bounding-box approach can only ever see "one
// connected shape" where a room's four walls touch at their corners — it
// has no way to tell that apart from "one big non-wall-shaped blob," and
// gets the wrong answer on literally every closed room. Walking the
// skeleton's graph structure is what lets individual wall segments come
// out the other side instead.

// Raised from the original 1400: the caller now renders PDF pages at a
// fixed ~2200px long side specifically for detection (see
// WALL_DETECT_TARGET_LONG_SIDE in simple-app.js), so downsampling straight
// back down to 1400 here would throw most of that resolution away again.
const MAX_DIM = 2200;

self.onmessage = (e)=>{
  const m = e.data || {};
  if (m.type !== 'build') return;
  try{
    const { width, height, data } = m;
    const src = new Uint8ClampedArray(data);
    const { ds, dsW, dsH, scale } = downsampleRGBA(src, width, height, m.maxDim || MAX_DIM);
    const gray = toGray(ds, dsW, dsH);
    const otsuThreshold = otsu(gray);
    const binThreshold = Math.max(38, Math.min(180, otsuThreshold + 25));
    const rawBin = threshold(gray, dsW, dsH, binThreshold);

    // A solid gray-filled room is dark enough to pass the same darkness
    // test as a wall line, but across its *entire* interior, not just an
    // outline — handing the skeletonizer one big filled blob instead of a
    // line. The skeleton of a filled 2D shape is a branching medial axis
    // through the middle of it, not a clean outline, which is exactly the
    // "random diagonal lines inside gray areas, no wall found at their
    // actual edge" failure mode. Fix: peel off any "deep interior" ink —
    // pixels that are still ink even after eroding HOLLOW_RADIUS px in from
    // every edge — leaving only a fill's boundary. An ordinary wall line is
    // thin enough that this erosion wipes it out completely, so normal
    // linework survives untouched; only fat/filled shapes lose their center.
    const HOLLOW_RADIUS = 3;
    const deepInterior = erode(rawBin, dsW, dsH, HOLLOW_RADIUS);

    // Peeling to just the boundary is right for an *empty* fill, but a real
    // interior wall drawn on top of (or bordering) that same gray shading
    // is just as "deep interior" to the eroder as the fill around it —
    // once both are collapsed to one binary ink value, erosion has no way
    // to tell "thin stroke surrounded by more ink" apart from "more fill,"
    // since it only measures distance to the mask's own edge. Recover it
    // from the original grayscale instead of the binary mask: re-run Otsu,
    // but only over the pixels belonging to each individual fill blob
    // (found by flood-filling rawBin, keeping only blobs that actually
    // have deep-interior pixels — an ordinary wall/text stroke never does,
    // see above). A stroke that's locally darker than the fill around it
    // clears that blob's own threshold even when it wouldn't have stood
    // out against the whole page.
    const recoveredStrokes = recoverStrokesInFills(rawBin, deepInterior, gray, dsW, dsH);

    const bin = new Uint8ClampedArray(rawBin.length);
    for (let i = 0; i < rawBin.length; i++) {
      bin[i] = (rawBin[i] && !deepInterior[i]) || recoveredStrokes[i] ? 1 : 0;
    }

    let foregroundPixels = 0;
    for (let i = 0; i < bin.length; i++) foregroundPixels += bin[i];
    const opened = dilate(erode(bin, dsW, dsH, 1), dsW, dsH, 1);
    const closed = erode(dilate(opened, dsW, dsH, 1), dsW, dsH, 1);

    // Reduce every inked shape (walls, text, hatching, everything) down to
    // a 1px centerline. maxIters=60 is a generous cap — the function stops
    // on its own once nothing more can be thinned, typically well under 20
    // passes for the line thicknesses this pipeline produces.
    const skeleton = thinZhangSuen(closed, dsW, dsH, 60);
    let skeletonPixelCount = 0;
    for (let i = 0; i < skeleton.length; i++) skeletonPixelCount += skeleton[i];

    const degree = computeDegrees(skeleton, dsW, dsH);
    const rawRuns = traceSkeletonRuns(skeleton, degree, dsW, dsH);

    // How short a *kept* wall is allowed to be. Deliberately not the basis
    // for the door-bridging tolerance below anymore (it used to be) — those
    // are different questions. This one only needs to be long enough to not
    // be text/noise; real interior walls, closet returns, and short jogs
    // are legitimately much shorter than "6% of the sheet," and the old
    // floor was dropping them outright. Straightness + angle-bucketing
    // still do the real work of rejecting non-wall clutter, so this can
    // afford to run low.
    const minLen = Math.max(24, Math.ceil(Math.min(dsW, dsH) * 0.03));
    // A door interrupts an otherwise-continuous wall, breaking its skeleton
    // into two runs each too short to individually clear minLen — bridging
    // that gap is what mergeCollinearRuns' maxGap is for. Kept independent
    // of minLen (rather than derived from it, as before) specifically so
    // lowering minLen to catch smaller walls above doesn't also shrink how
    // generously doors get bridged; this is sized off a typical door's
    // width relative to the sheet instead, using the same ds-space
    // conversion minLen used to use for itself.
    const doorGapBasisDs = Math.max(45, Math.ceil(Math.min(dsW, dsH) * 0.06)) / scale;
    const crossTol = Math.max(2, Math.round(doorGapBasisDs * 0.25));
    const maxGap = Math.max(6, Math.round(doorGapBasisDs * 1.2));
    const angleTolDeg = 4;

    const excludeFromX = detectTitleBlockExclusionX(closed, dsW, dsH);
    const filterStats = { stub: 0, notStraight: 0, excludedTitleBlock: 0, tooShort: 0, kept: 0 };

    // A plain 90° corner has degree 2 in the skeleton graph — it touches
    // exactly two neighbors, same as any straight mid-wall pixel — so
    // traceSkeletonRuns() alone doesn't know to stop there; it only splits
    // at true junctions/endpoints. Without this, a room with no doors and
    // no T-walls comes back as one long bent path tracing most of the way
    // around the room, which correctly fails the straightness check and
    // gets thrown out whole instead of split into 4 real wall segments.
    // This explicitly looks for sharp direction changes along each raw run
    // and cuts there before straightness gets evaluated.
    const cornerSplitRuns = [];
    for (const path of rawRuns) cornerSplitRuns.push(...splitPathAtBends(path, 6, 30));

    const straightRuns = [];
    for (const path of cornerSplitRuns) {
      if (path.length < 2) { filterStats.stub++; continue; }
      const info = analyzeRun(path);
      if (info.chordLen < 3) { filterStats.stub++; continue; } // thinning "hairs" near junctions
      if (info.straightness < 0.9) { filterStats.notStraight++; continue; } // curved — out of scope, same as before
      const midX = (info.start.x + info.end.x) / 2;
      if (excludeFromX != null && midX >= excludeFromX) { filterStats.excludedTitleBlock++; continue; }
      const rad = info.angleDeg * Math.PI / 180;
      const ux = Math.cos(rad), uy = Math.sin(rad);
      const offset = info.start.x * (-uy) + info.start.y * ux; // perpendicular distance from origin to this run's infinite line
      straightRuns.push({ ...info, offset });
    }

    const mergedRuns = mergeCollinearRuns(straightRuns, angleTolDeg, crossTol, maxGap);

    // minLen is checked against the *whole* merged span (r.tMin/r.tMax),
    // door gap included — a stub too short to count on its own still
    // clears the bar as part of one long wall, same as before this change.
    // What's actually drawn is one line per piece (see mergeCollinearRuns),
    // so the door opening itself is left blank instead of getting a line
    // drawn straight through it.
    const segments = [];
    let sid = 1;
    for (const r of mergedRuns) {
      const length = (r.tMax - r.tMin) * scale;
      if (length < minLen) { filterStats.tooShort++; continue; }
      filterStats.kept++;
      for (const piece of r.pieces) {
        segments.push({
          id: String(sid++),
          points: [
            { x: piece.startPt.x * scale, y: piece.startPt.y * scale },
            { x: piece.endPt.x * scale, y: piece.endPt.y * scale },
          ],
        });
      }
    }

    // A wall's angle comes from just its raw two endpoints (see analyzeRun),
    // so the same few px of pixel-level jitter at either end produces a
    // much bigger apparent angle on a short wall than a long one — a 3px
    // wobble over 20px reads as ~8.5°, the same wobble over 500px reads as
    // ~0.3°. A single fixed tolerance can't serve both: loose enough to
    // straighten short walls lets it falsely flatten a real long diagonal,
    // tight enough to leave long diagonals alone misses short walls' noise
    // entirely — which is exactly the "still comes out at an angle"
    // complaint after minLen was lowered to admit shorter walls. Scale the
    // tolerance with each wall's own length instead (see snapAxisAligned).
    const AXIS_SNAP_JITTER_PX = 4;
    const AXIS_SNAP_MIN_TOL_DEG = 15;
    const AXIS_SNAP_MAX_TOL_DEG = 25;
    snapAxisAligned(segments, AXIS_SNAP_JITTER_PX, AXIS_SNAP_MIN_TOL_DEG, AXIS_SNAP_MAX_TOL_DEG);

    // Two walls that actually meet at a corner rarely come out of
    // skeletonization meeting exactly — Zhang–Suen thinning tends to clip
    // the outer pixel or two right at an L-shaped junction (its medial axis
    // cuts the corner slightly), so each wall's endpoint lands a couple px
    // short. Left alone that reads as a visible notch/gap at every corner.
    // Snap it: endpoints from *different* walls that land within
    // cornerSnapTol of each other get pulled to where their two infinite
    // lines actually cross, rather than left at their raw skeleton ends.
    // Runs after axis-snapping so two walls that just got squared up also
    // meet at a clean right angle, not just a corrected-but-still-off one.
    const cornerSnapTol = Math.max(6, minLen * 0.3);
    snapCornerEndpoints(segments, cornerSnapTol);

    self.postMessage({
      type:'walls',
      segments,
      debug: {
        srcDim: `${width}x${height}`,
        dsDim: `${dsW}x${dsH}`,
        downsampleScale: scale,
        otsuThreshold,
        binThreshold,
        foregroundPixels,
        foregroundFraction: Number((foregroundPixels / (dsW * dsH)).toFixed(4)),
        skeletonPixelCount,
        rawRunCount: rawRuns.length,
        cornerSplitRunCount: cornerSplitRuns.length,
        straightRunCount: straightRuns.length,
        mergedRunCount: mergedRuns.length,
        minLenPx: minLen,
        titleBlockExcludeFromX: excludeFromX,
        filterStats,
      },
    });
  }catch(err){ self.postMessage({ type:'walls', segments: [], error: String(err&&err.message||err) }); }
};

function downsampleRGBA(rgba, w, h, maxDim){
  const scale = Math.max(1, Math.ceil(Math.max(w,h)/maxDim));
  const dsW = Math.max(1, Math.floor(w/scale)), dsH = Math.max(1, Math.floor(h/scale));
  const out = new Uint8ClampedArray(dsW*dsH*4);
  const sx=w/dsW, sy=h/dsH;
  for(let y=0;y<dsH;y++){
    for(let x=0;x<dsW;x++){
      const x0=Math.floor(x*sx), x1=Math.min(w, Math.floor((x+1)*sx));
      const y0=Math.floor(y*sy), y1=Math.min(h, Math.floor((y+1)*sy));
      let r=0,g=0,b=0,a=0,n=0;
      for(let yy=y0;yy<y1;yy++){
        for(let xx=x0;xx<x1;xx++){
          const i=(yy*w+xx)*4; r+=rgba[i]; g+=rgba[i+1]; b+=rgba[i+2]; a+=rgba[i+3]; n++;
        }
      }
      const j=(y*dsW+x)*4; out[j]=r/n|0; out[j+1]=g/n|0; out[j+2]=b/n|0; out[j+3]=a/n|0;
    }
  }
  return { ds: out, dsW, dsH, scale };
}

function toGray(rgba,w,h){ const out=new Uint8ClampedArray(w*h); for(let i=0,j=0;i<rgba.length;i+=4,j++){ out[j]=(0.299*rgba[i]+0.587*rgba[i+1]+0.114*rgba[i+2])|0; } return out; }
function otsu(gray){ const hist=new Uint32Array(256); for(let i=0;i<gray.length;i++) hist[gray[i]]++; return otsuFromHistogram(hist, gray.length); }
// Shared with recoverStrokesInFills, which needs Otsu run per-blob against
// just that blob's own pixels rather than the whole page.
function otsuFromHistogram(hist, total){ let sum=0; for(let i=0;i<256;i++) sum+=i*hist[i]; let sumB=0,wB=0,maxVar=0,th=0; for(let t=0;t<256;t++){ wB+=hist[t]; if(!wB) continue; const wF=total-wB; if(!wF) break; sumB+=t*hist[t]; const mB=sumB/wB, mF=(sum-sumB)/wF; const diff=mB-mF; const v=wB*wF*diff*diff; if(v>maxVar){ maxVar=v; th=t; } } return th; }
// Foreground (ink) is DARK pixels, not bright ones: a drawing is mostly
// white/light paper with dark wall lines and text on top. This was
// previously ">=", which marked the white background as "foreground" and
// the actual linework as "background" — on a real floor plan that
// misclassifies ~90% of the page as one giant connected blob instead of
// separating individual wall segments.
function threshold(gray,w,h,t){ const out=new Uint8ClampedArray(w*h); for(let i=0;i<gray.length;i++) out[i]=gray[i]<=t?1:0; return out; }
function erode(mask,w,h,r){ const out=new Uint8ClampedArray(mask.length); for(let y=0;y<h;y++){ for(let x=0;x<w;x++){ let all=1; for(let dy=-r;dy<=r&&all;dy++){ for(let dx=-r;dx<=r&&all;dx++){ const xx=x+dx, yy=y+dy; if(!(xx>=0&&xx<w&&yy>=0&&yy<h&&mask[yy*w+xx])) all=0; } } out[y*w+x]=all; } } return out; }
function dilate(mask,w,h,r){ const out=new Uint8ClampedArray(mask.length); for(let y=0;y<h;y++){ for(let x=0;x<w;x++){ let on=0; for(let dy=-r;dy<=r&&!on;dy++){ for(let dx=-r;dx<=r&&!on;dx++){ const xx=x+dx, yy=y+dy; if(xx>=0&&xx<w&&yy>=0&&yy<h&&mask[yy*w+xx]) on=1; } } out[y*w+x]=on; } } return out; }

// 8-connected flood-fill labeling of a binary mask. labels[i] is -1 for
// background, otherwise the 0-based id of the blob that pixel belongs to.
// Iterative (own stack, not recursion) since a large fill can easily cover
// tens of thousands of pixels — deep enough to blow a real call stack.
function labelComponents(mask, w, h){
  const labels = new Int32Array(w * h).fill(-1);
  const stackX = new Int32Array(w * h);
  const stackY = new Int32Array(w * h);
  let count = 0;
  for (let y0 = 0; y0 < h; y0++) {
    for (let x0 = 0; x0 < w; x0++) {
      const idx0 = y0 * w + x0;
      if (!mask[idx0] || labels[idx0] !== -1) continue;
      const label = count++;
      let sp = 0;
      stackX[sp] = x0; stackY[sp] = y0; sp++;
      labels[idx0] = label;
      while (sp > 0) {
        sp--;
        const cx = stackX[sp], cy = stackY[sp];
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
            const nidx = ny * w + nx;
            if (!mask[nidx] || labels[nidx] !== -1) continue;
            labels[nidx] = label;
            stackX[sp] = nx; stackY[sp] = ny; sp++;
          }
        }
      }
    }
  }
  return { labels, count };
}

// See the call site's comment for why this exists: a wall stroke embedded
// in (or bordering) a solid fill is indistinguishable from more fill once
// everything's collapsed to one binary ink value, so erosion-based
// hollowing can only ever throw it away along with the fill. This recovers
// it by re-thresholding, blob by blob, against each blob's *own* grayscale
// values rather than the whole page's — a stroke that's locally darker
// than the fill immediately around it clears its own blob's Otsu cut even
// when the page-wide cut couldn't tell them apart. Only bothers with blobs
// that have deep-interior pixels at all (ordinary linework/text never
// does, per the HOLLOW_RADIUS comment above), so this is a no-op for the
// common case of a page with no fills on it.
function recoverStrokesInFills(rawBin, deepInterior, gray, w, h){
  const { labels, count } = labelComponents(rawBin, w, h);
  if (!count) return new Uint8ClampedArray(rawBin.length);

  const isFillBlob = new Uint8Array(count);
  for (let i = 0; i < deepInterior.length; i++) if (deepInterior[i]) isFillBlob[labels[i]] = 1;

  const hist = new Array(count);
  for (let i = 0; i < rawBin.length; i++) {
    if (!rawBin[i]) continue;
    const lbl = labels[i];
    if (!isFillBlob[lbl]) continue;
    if (!hist[lbl]) hist[lbl] = new Uint32Array(256);
    hist[lbl][gray[i]]++;
  }

  const thresholds = new Array(count);
  for (let lbl = 0; lbl < count; lbl++) {
    if (!hist[lbl]) continue;
    let total = 0;
    for (let v = 0; v < 256; v++) total += hist[lbl][v];
    thresholds[lbl] = otsuFromHistogram(hist[lbl], total);
  }

  const recovered = new Uint8ClampedArray(rawBin.length);
  for (let i = 0; i < rawBin.length; i++) {
    if (!rawBin[i]) continue;
    const lbl = labels[i];
    if (!isFillBlob[lbl]) continue;
    const t = thresholds[lbl];
    if (t != null && gray[i] <= t) recovered[i] = 1;
  }
  return recovered;
}

// Standard Zhang–Suen thinning: reduces a filled binary shape to a 1px
// medial-axis skeleton. Runs until convergence (or maxIters, whichever
// first) — this was written a while back but never actually called until
// the skeleton-graph rewrite needed it.
function thinZhangSuen(bin,w,h,maxIters){ const a=new Uint8ClampedArray(bin); const N=(x,y)=>a[y*w+x]; let changed=true, iter=0; while(changed && iter<maxIters){ changed=false; // step 1
  const rem=[]; for(let y=1;y<h-1;y++){ for(let x=1;x<w-1;x++){ if(!N(x,y)) continue; const p2=N(x,y-1), p3=N(x+1,y-1), p4=N(x+1,y), p5=N(x+1,y+1), p6=N(x,y+1), p7=N(x-1,y+1), p8=N(x-1,y), p9=N(x-1,y-1); const nb=p2+p3+p4+p5+p6+p7+p8+p9; if(nb<2||nb>6) continue; const trans = (!p2&&p3)+(!p3&&p4)+(!p4&&p5)+(!p5&&p6)+(!p6&&p7)+(!p7&&p8)+(!p8&&p9)+(!p9&&p2); if(trans!==1) continue; if(p2&&p4&&p6) continue; if(p4&&p6&&p8) continue; rem.push(y*w+x); } } if(rem.length){ changed=true; for(const i of rem) a[i]=0; }
  const rem2=[]; for(let y=1;y<h-1;y++){ for(let x=1;x<w-1;x++){ if(!N(x,y)) continue; const p2=N(x,y-1), p3=N(x+1,y-1), p4=N(x+1,y), p5=N(x+1,y+1), p6=N(x,y+1), p7=N(x-1,y+1), p8=N(x-1,y), p9=N(x-1,y-1); const nb=p2+p3+p4+p5+p6+p7+p8+p9; if(nb<2||nb>6) continue; const trans = (!p2&&p3)+(!p3&&p4)+(!p4&&p5)+(!p5&&p6)+(!p6&&p7)+(!p7&&p8)+(!p8&&p9)+(!p9&&p2); if(trans!==1) continue; if(p2&&p4&&p8) continue; if(p2&&p6&&p8) continue; rem2.push(y*w+x); } } if(rem2.length){ changed=true; for(const i of rem2) a[i]=0; }
  iter++; }
  return a;
}

const NBR8 = [[-1,-1],[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0]];

function skeletonNeighborCoords(skel, w, h, x, y){
  const out = [];
  for (const [dx, dy] of NBR8) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && nx < w && ny >= 0 && ny < h && skel[ny * w + nx]) out.push([nx, ny]);
  }
  return out;
}

// Degree of each skeleton pixel: how many other skeleton pixels touch it.
// 0 = isolated speck (noise). 1 = endpoint (a wall's real end, or a break
// at a door/gap). 2 = mid-run pixel, part of a straight or curving line.
// 3+ = junction (a corner or T/X intersection) — exactly the case a
// blob/bounding-box approach couldn't distinguish from "one big shape."
function computeDegrees(skel, w, h){
  const degree = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (!skel[idx]) continue;
      degree[idx] = skeletonNeighborCoords(skel, w, h, x, y).length;
    }
  }
  return degree;
}

// Walks the skeleton as a graph: starting from every endpoint/junction,
// follows each unvisited direction through the chain of degree-2 pixels
// until hitting the next endpoint/junction, and records that chain as one
// "run" (one edge of the graph). A run between two junctions is a wall
// segment interrupted by nothing; a run ending in an endpoint may be a
// real wall end, or one side of a door gap waiting to be merged back
// together with the run on the door's other side.
//
// Known limitation: a closed loop with literally zero junctions anywhere
// on it (every pixel degree 2, e.g. a fully solid ring shape with no
// corner sharp enough to register and no branch touching it) never gets
// visited, since walks only start from non-degree-2 pixels. Real floor
// plans essentially always have doors, T-walls, or corners sharp enough to
// avoid this, so it's left unhandled rather than adding real complexity
// for a case that isn't expected to come up.
function traceSkeletonRuns(skel, degree, w, h){
  const visited = new Set();
  const edgeKey = (ax, ay, bx, by) => `${ax},${ay}>${bx},${by}`;
  const runs = [];
  const maxSteps = w * h;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (!skel[idx] || degree[idx] === 2) continue;
      const neighbors = skeletonNeighborCoords(skel, w, h, x, y);
      for (const [nx, ny] of neighbors) {
        const key = edgeKey(x, y, nx, ny);
        if (visited.has(key)) continue;
        visited.add(key);
        visited.add(edgeKey(nx, ny, x, y));

        const path = [{ x, y }, { x: nx, y: ny }];
        let prevX = x, prevY = y, curX = nx, curY = ny;
        let guard = 0;
        while (degree[curY * w + curX] === 2 && guard < maxSteps) {
          guard++;
          const curNbrs = skeletonNeighborCoords(skel, w, h, curX, curY);
          let next = null;
          for (const [ax, ay] of curNbrs) {
            if (ax === prevX && ay === prevY) continue;
            next = [ax, ay];
            break;
          }
          if (!next) break;
          const [nx2, ny2] = next;
          const stepKey = edgeKey(curX, curY, nx2, ny2);
          if (visited.has(stepKey)) break; // would re-enter an already-walked loop
          visited.add(stepKey);
          visited.add(edgeKey(nx2, ny2, curX, curY));
          path.push({ x: nx2, y: ny2 });
          prevX = curX; prevY = curY; curX = nx2; curY = ny2;
        }
        runs.push(path);
      }
    }
  }
  return runs;
}

// Cuts a traced skeleton path wherever its local direction changes
// sharply — a corner — rather than relying only on topological degree to
// find split points (a plain 90° bend has degree 2, same as a straight
// mid-wall pixel, so traceSkeletonRuns() alone doesn't stop there). Local
// direction is measured with a lookback/lookahead window rather than
// adjacent pixels, so ordinary single-pixel jitter along a real straight
// run doesn't get mistaken for a corner.
function splitPathAtBends(path, windowSize, angleThresholdDeg){
  if (path.length < windowSize * 2 + 1) return [path];

  const bendIndices = [];
  for (let i = windowSize; i < path.length - windowSize; i++) {
    const a = path[i], before = path[i - windowSize], after = path[i + windowSize];
    const v1x = a.x - before.x, v1y = a.y - before.y;
    const v2x = after.x - a.x, v2y = after.y - a.y;
    const len1 = Math.hypot(v1x, v1y), len2 = Math.hypot(v2x, v2y);
    if (len1 < 1e-6 || len2 < 1e-6) continue;
    const cos = (v1x * v2x + v1y * v2y) / (len1 * len2);
    const angle = Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
    if (angle > angleThresholdDeg) bendIndices.push(i);
  }
  if (!bendIndices.length) return [path];

  // A single real corner tends to trip the threshold at several adjacent
  // indices in a row; collapse those into one cut point.
  const cuts = [];
  for (const idx of bendIndices) {
    if (cuts.length && idx - cuts[cuts.length - 1] <= windowSize) continue;
    cuts.push(idx);
  }

  const pieces = [];
  let start = 0;
  for (const idx of cuts) {
    pieces.push(path.slice(start, idx + 1));
    start = idx;
  }
  pieces.push(path.slice(start));
  return pieces.filter((p) => p.length >= 2);
}

// Straightness = chord length / arc length: 1.0 for a perfectly straight
// run, noticeably lower for anything curved or zigzagging. angleDeg is
// folded into [0,180) since a line has no inherent direction.
function analyzeRun(path){
  const start = path[0];
  const end = path[path.length - 1];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const chordLen = Math.hypot(dx, dy);
  let arcLen = 0;
  for (let i = 1; i < path.length; i++) {
    arcLen += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
  }
  const straightness = arcLen > 0 ? chordLen / arcLen : 0;
  let angleDeg = chordLen > 0 ? (Math.atan2(dy, dx) * 180 / Math.PI) : 0;
  angleDeg = ((angleDeg % 180) + 180) % 180;
  return { start, end, chordLen, arcLen, straightness, angleDeg };
}

// Architectural sheets commonly carry a dense table/legend strip along one
// edge (a title block — project info, sheet index, revision table, all
// small dense text and box borders). That strip is pure noise for wall
// detection: its box borders are exactly as long and thin as a real wall.
// Rather than hardcoding a position (title blocks aren't always in the
// same spot across vendors), scan column-by-column ink density from the
// right edge inward; a run of unusually dense columns is very likely a
// title block, an ordinary drawing area is not. Bails out to "exclude
// nothing" if the right edge isn't unusually dense, so it won't blindly
// crop a sheet that doesn't have one there.
function detectTitleBlockExclusionX(mask, w, h){
  const colDensity = new Float64Array(w);
  for (let x = 0; x < w; x++) {
    let count = 0;
    for (let y = 0; y < h; y++) count += mask[y * w + x];
    colDensity[x] = count / h;
  }
  const sorted = Float64Array.from(colDensity).sort();
  const median = sorted[Math.floor(sorted.length / 2)] || 0;
  const denseThreshold = Math.max(0.02, median * 1.8);
  const maxExcludeWidth = Math.floor(w * 0.35);

  let excludeFromX = null;
  let x = w - 1;
  while (x >= 0 && x >= w - maxExcludeWidth && colDensity[x] >= denseThreshold) {
    excludeFromX = x;
    x--;
  }
  return excludeFromX;
}

// Gaps at or under this (ds-space px) are treated as tracing noise — a
// skeleton run occasionally comes up a pixel or two short of where it
// "should" end near a junction/corner-split, with nothing actually missing
// in the ink. Drawn straight through, same as always. Anything wider than
// this is presumed a real opening (see mergeCollinearRuns below) and is
// deliberately left as a visible break instead.
const SEAMLESS_JOIN_TOL = 2;

// Merges straight runs that sit on (nearly) the same infinite line and are
// close enough end-to-end that the gap between them is more likely a door
// opening than two unrelated walls. Bucketing by rounded (angle, offset)
// keeps this cheap (no all-pairs comparison) at the cost of occasionally
// splitting a group that should've merged right at a bucket boundary — an
// acceptable trade for a heuristic like this. Unlike the old axis-aligned
// version, this works at any angle, so a diagonal wall now merges across a
// door too, not just horizontal/vertical ones.
//
// A merged group's overall [tMin,tMax] span still covers the door gap —
// that's what lets a stub too short to clear minLen on its own count as
// part of one long wall — but the group also keeps `pieces`, the sub-runs
// actually worth drawing. A gap over SEAMLESS_JOIN_TOL starts a new piece
// instead of stretching the previous one across it, so the rendered line
// stops at the door opening on each side instead of being drawn straight
// through it (see the segment-emission loop in self.onmessage, which draws
// one line per piece rather than one line per group).
function mergeCollinearRuns(runs, angleTolDeg, crossTol, maxGap){
  const buckets = new Map();
  for (const r of runs) {
    const key = `${Math.round(r.angleDeg / angleTolDeg)}|${Math.round(r.offset / crossTol)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(r);
  }

  const merged = [];
  for (const group of buckets.values()) {
    const ref = group[0];
    const rad = ref.angleDeg * Math.PI / 180;
    const ux = Math.cos(rad), uy = Math.sin(rad);

    const withT = group.map((r) => {
      const t0 = (r.start.x - ref.start.x) * ux + (r.start.y - ref.start.y) * uy;
      const t1 = (r.end.x - ref.start.x) * ux + (r.end.y - ref.start.y) * uy;
      const forward = t0 <= t1;
      return {
        tMin: forward ? t0 : t1,
        tMax: forward ? t1 : t0,
        startPt: forward ? r.start : r.end,
        endPt: forward ? r.end : r.start,
      };
    }).sort((a, b) => a.tMin - b.tMin);

    let current = null;
    for (const r of withT) {
      if (!current) {
        current = { tMin: r.tMin, tMax: r.tMax, startPt: r.startPt, endPt: r.endPt, pieces: [{ tMin: r.tMin, tMax: r.tMax, startPt: r.startPt, endPt: r.endPt }] };
      } else if (r.tMin <= current.tMax + maxGap) {
        const lastPiece = current.pieces[current.pieces.length - 1];
        // Measured against the last *drawn piece's* end, not the group's
        // farthest reach so far — those normally match, but keeping them
        // separate avoids a stale/too-generous gap reading if a run ever
        // arrives that doesn't extend past what's already covered.
        const gap = r.tMin - lastPiece.tMax;
        if (r.tMax > current.tMax) { current.tMax = r.tMax; current.endPt = r.endPt; }
        if (gap <= SEAMLESS_JOIN_TOL) {
          if (r.tMax > lastPiece.tMax) { lastPiece.tMax = r.tMax; lastPiece.endPt = r.endPt; }
        } else {
          current.pieces.push({ tMin: r.tMin, tMax: r.tMax, startPt: r.startPt, endPt: r.endPt });
        }
      } else {
        merged.push(current);
        current = { tMin: r.tMin, tMax: r.tMax, startPt: r.startPt, endPt: r.endPt, pieces: [{ tMin: r.tMin, tMax: r.tMax, startPt: r.startPt, endPt: r.endPt }] };
      }
    }
    if (current) merged.push(current);
  }
  return merged;
}

// Where two segments' own infinite lines cross, or null if they're too
// close to parallel to trust (near-parallel means a tiny angle error blows
// up into a huge position error, so it's safer to leave those alone than
// snap them somewhere wrong).
function lineIntersection(p1, p2, p3, p4){
  const d1x = p2.x - p1.x, d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x, d2y = p4.y - p3.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-6) return null;
  const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / denom;
  return { x: p1.x + t * d1x, y: p1.y + t * d1y };
}

// Squares up any wall whose measured angle is within its own (length-
// dependent — see the call site's comment) tolerance of horizontal or
// vertical, by moving both endpoints to share a common y (horizontal) or
// x (vertical) — their midpoint, so the correction doesn't favor whichever
// end happened to be measured more precisely. A wall further off-axis than
// its tolerance is left exactly as detected, since it's more likely a real
// angle than jitter. Mutates `segments` in place; each segment is handled
// independently of the others.
function snapAxisAligned(segments, jitterPx, minToleranceDeg, maxToleranceDeg){
  for (const seg of segments) {
    const [p0, p1] = seg.points;
    const dx = p1.x - p0.x, dy = p1.y - p0.y;
    const length = Math.hypot(dx, dy);
    if (!length) continue; // degenerate (zero-length) — nothing to snap
    // The angle jitterPx of endpoint noise would produce at this specific
    // wall's length, clamped to a sane range — see the call site.
    const toleranceDeg = Math.min(maxToleranceDeg, Math.max(minToleranceDeg, Math.atan2(jitterPx, length) * 180 / Math.PI));
    // atan2 of the absolute deltas folds the angle into [0,90]: 0 = perfectly
    // horizontal, 90 = perfectly vertical, regardless of which direction the
    // wall runs in.
    const angle = Math.atan2(Math.abs(dy), Math.abs(dx)) * 180 / Math.PI;
    if (angle <= toleranceDeg) {
      const midY = (p0.y + p1.y) / 2;
      p0.y = midY; p1.y = midY;
    } else if (angle >= 90 - toleranceDeg) {
      const midX = (p0.x + p1.x) / 2;
      p0.x = midX; p1.x = midX;
    }
  }
}

// Pulls corners together: for every pair of endpoints from *different*
// walls that land within `tolerance` of each other, moves both to where
// the two walls' infinite lines actually intersect, instead of leaving
// them at their raw (slightly short, per the call site's comment) skeleton
// ends. Mutates `segments` in place. O(n^2) over endpoints, which is fine
// here — a floor plan realistically has dozens of walls, not thousands.
function snapCornerEndpoints(segments, tolerance){
  const endpoints = [];
  segments.forEach((seg, segIdx) => {
    endpoints.push({ segIdx, which: 0, x: seg.points[0].x, y: seg.points[0].y });
    endpoints.push({ segIdx, which: 1, x: seg.points[1].x, y: seg.points[1].y });
  });

  // Extending a near-parallel or barely-off-axis pair all the way to their
  // true intersection can fling a corner far away from where either wall
  // actually ends. Cap how far a snap is allowed to move a point, relative
  // to the gap it's bridging, so a bad pairing gets skipped instead of
  // producing a worse result than leaving the raw endpoint alone.
  const maxSnapExtend = tolerance * 3;

  for (let i = 0; i < endpoints.length; i++) {
    for (let j = i + 1; j < endpoints.length; j++) {
      const a = endpoints[i], b = endpoints[j];
      if (a.segIdx === b.segIdx) continue; // a wall's own two ends never snap to each other
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (dist > tolerance) continue;

      const segA = segments[a.segIdx], segB = segments[b.segIdx];
      const ix = lineIntersection(segA.points[0], segA.points[1], segB.points[0], segB.points[1]);
      if (!ix) continue;
      if (Math.hypot(ix.x - a.x, ix.y - a.y) > maxSnapExtend) continue;
      if (Math.hypot(ix.x - b.x, ix.y - b.y) > maxSnapExtend) continue;

      segA.points[a.which] = { x: ix.x, y: ix.y };
      segB.points[b.which] = { x: ix.x, y: ix.y };
      a.x = ix.x; a.y = ix.y;
      b.x = ix.x; b.y = ix.y;
    }
  }
}
