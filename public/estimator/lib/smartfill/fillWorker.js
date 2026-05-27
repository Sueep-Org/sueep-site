self.MAX_REGION_RATIO = undefined;
// Tuning
const MAX_REGION_RATIO = 0.60;           // flood area budget relative to viewport
const MAX_REGION_PX    = 2_000_000;      // absolute hard cap
const SIMPLIFY_EPS     = 1.2;            // px at downsample scale (tighter corners)
const START_SEARCH_RADIUS = 6;           // px in downsample space to find nearest free seed
const BORDER_TOUCH_ALLOW = 0.02;         // allow small border contact ≤ 2% of perimeter
// Fill worker: constrained flood fill using edgeMask, extract contour via marching squares,
// simplify with Douglas-Peucker, compute geometry metrics.
// API:
// { type: 'preview'|'commit', x, y, dsWidth, dsHeight, scale, edgeMask:ArrayBuffer, gradMag:ArrayBuffer }
// → { type: 'preview', polygon } or { type: 'commit', polygon, areaPx, perimeterPx, internalEdgeDensity, selfIntersect }

self.onmessage = (e) => {
  const m = e.data || {};
  try {
    if (m.type === 'preview' || m.type === 'commit') {
      const res = runFill(m);
      self.postMessage({ type: m.type, ...res });
    } else if (m.type === 'scan') {
      const res = runScan(m);
      self.postMessage({ type: 'scan', ...res });
    }
  } catch (err) {
    self.postMessage({ type: 'error', error: String(err && err.message || err) });
  }
};

function runFill({ type, seedX, seedY, x, y, dsWidth, dsHeight, scale, barrierMask, edgeMask, gradMag, roiRadius }) {
  const w = dsWidth, h = dsHeight;
  const mask = barrierMask ? new Uint8Array(barrierMask) : new Uint8Array(edgeMask);
  const sx = Math.floor((seedX ?? x) / scale), sy = Math.floor((seedY ?? y) / scale);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return { ok:false, reason:'noRegion' };
  // Conservative free space: NOT(dilate(barrier,1)) to avoid leaking through narrow gaps
  const free = new Uint8Array(w*h);
  const grow = dilate1(mask, w, h);
  for(let i=0;i<mask.length;i++) free[i] = grow[i] ? 0 : 1;
  // If starting on barrier, search nearby for free pixel
  let seed = sx + sy * w;
  if (!free[seed]) {
    const nf = findNearestFree(free, w, h, sx, sy, START_SEARCH_RADIUS);
    if (nf < 0) return { ok:false, reason:'noRegion' };
    seed = nf;
  }
  const rr = Math.max(64, roiRadius|0 || 256);
  const filled = floodFillFreeROI(free, w, h, seed % w, (seed / w) | 0, Math.floor((w*h)*MAX_REGION_RATIO), rr);
  if (!filled || filled.count === 0) return { ok:false, reason:'noRegion' };
  if (filled.oversize || filled.count > MAX_REGION_PX) return { ok:false, reason:'oversize' };
  // Only reject if border contact exceeds small fraction of perimeter
  const perim = (w + h) * 2;
  if (filled.borderCount > Math.max(20, BORDER_TOUCH_ALLOW * perim)) return { ok:false, reason:'leaky' };
  const raw = marchingSquares(filled.bitmap, w, h);
  // Snap polygon vertices to nearest strong barrier pixels along normals (1-2 px) for tighter fit
  const snapped = snapToBarriers(raw, new Uint8Array(barrierMask||[]), w, h, 3);
  const eps = Math.max(1.5, SIMPLIFY_EPS);
  const simp = simplifyDP(snapped, eps).map(p => ({ x: p.x * scale, y: p.y * scale }));
  if (type === 'preview') return { ok:true, polygon: simp };
  const areaPx = Math.abs(polygonArea(simp));
  const perimeterPx = polygonPerimeter(simp);
  return { ok:true, polygon: simp, areaPx, perimeterPx };
}

function runScan({ dsWidth, dsHeight, scale, edgeMask, gradMag, stride = 16, maxCount = 300, canvasW, canvasH }) {
  const w = dsWidth, h = dsHeight;
  const mask = new Uint8Array(edgeMask);
  const mag = new Float32Array(gradMag);
  const candidates = [];
  const seen = new Uint8Array(w * h);
  for (let y = 0; y < h; y += stride) {
    for (let x = 0; x < w; x += stride) {
      const p = y * w + x;
      if (seen[p] || mask[p]) continue;
      const filled = floodFillConstrained(mask, w, h, x, y);
      if (!filled || filled.count < 20) continue;
      for (let i = 0; i < filled.bitmap.length; i++) if (filled.bitmap[i]) seen[i] = 1;
      const raw = marchingSquares(filled.bitmap, w, h);
      if (raw.length < 3) continue;
      const simp = simplifyDP(raw, 1.0).map(pt => ({ x: pt.x * scale, y: pt.y * scale }));
      const areaPx = Math.abs(polygonArea(simp));
      const perimeterPx = polygonPerimeter(simp);
      const density = internalEdgeDensity(filled.bitmap, w, h, mag);
      const selfIntersect = !isSimplePolygon(simp);
      const bbox = bboxOf(simp);
      candidates.push({ polygon: simp, areaPx, perimeterPx, density, selfIntersect, bbox });
      if (candidates.length >= maxCount) break;
    }
    if (candidates.length >= maxCount) break;
  }
  // Deduplicate by IoU threshold on bboxes
  const iouThr = 0.6;
  const filtered = [];
  candidates.sort((a,b)=>b.areaPx - a.areaPx);
  for (const c of candidates) {
    let dup = false;
    for (const f of filtered) { if (iou(c.bbox, f.bbox) > iouThr) { dup = true; break; } }
    if (!dup) filtered.push(c);
  }
  return { candidates: filtered };
}

// Edge tracing: follow along edge pixels from nearest seed
function runTrace({ x, y, dsWidth, dsHeight, scale, edgeMask, gradMag }){
  const w = dsWidth, h = dsHeight; const mask = new Uint8Array(edgeMask); const mag = new Float32Array(gradMag);
  const sx = Math.floor(x / scale), sy = Math.floor(y / scale);
  const start = findNearestEdge(mask, w, h, sx, sy, 6);
  if (start < 0) return { path: [] };
  const pathIdx = traceFrom(mask, mag, w, h, start, 4000);
  const pts = pathIdx.map(i=>({ x: (i%w)*scale, y: ((i/w)|0)*scale }));
  return { path: pts };
}

function findNearestEdge(mask, w, h, sx, sy, r){
  let best=-1, bestD=1e9;
  for (let dy=-r; dy<=r; dy++){
    for (let dx=-r; dx<=r; dx++){
      const x=sx+dx, y=sy+dy; if(x<0||y<0||x>=w||y>=h) continue; const i=y*w+x; if(mask[i]){ const d=dx*dx+dy*dy; if(d<bestD){ bestD=d; best=i; } }
    }
  }
  return best;
}

function traceFrom(mask, mag, w, h, startIdx, maxLen){
  const visited = new Uint8Array(w*h);
  function step(idx, dirX, dirY, out){
    let cur=idx, lastDx=dirX, lastDy=dirY; let steps=0;
    while(steps<maxLen){ out.push(cur); visited[cur]=1; const cx=cur%w, cy=(cur/w)|0; let best=-1, bestM=-1, bx=0, by=0;
      for(let dy=-1; dy<=1; dy++){
        for(let dx=-1; dx<=1; dx++){
          if(dx===0 && dy===0) continue; const nx=cx+dx, ny=cy+dy; if(nx<0||ny<0||nx>=w||ny>=h) continue; const ni=ny*w+nx; if(!mask[ni]||visited[ni]) continue; const m=mag[ni];
          // prefer continuing direction
          const align = dx*lastDx + dy*lastDy; const score = m + (align>0?5:0);
          if(score>bestM){ bestM=score; best=ni; bx=dx; by=dy; }
        }
      }
      if(best<0) break; cur=best; lastDx=bx; lastDy=by; steps++;
    }
    return { last: cur, dx: lastDx, dy: lastDy };
  }
  const out1=[]; const a=step(startIdx, 0,0, out1);
  const out2=[]; // go backwards from start by reversing visited and walking neighbors not in out1 yet
  // mark visited only for forward; backward should also avoid out1
  const vis2 = new Uint8Array(visited.length); for(const i of out1) vis2[i]=1;
  function stepBack(idx,out){ let cur=idx, steps=0; let lastDx=0,lastDy=0; while(steps<maxLen){ const cx=cur%w, cy=(cur/w)|0; let best=-1, bestM=-1, bx=0,by=0; for(let dy=-1;dy<=1;dy++){ for(let dx=-1;dx<=1;dx++){ if(dx===0&&dy===0) continue; const nx=cx+dx, ny=cy+dy; if(nx<0||ny<0||nx>=w||ny>=h) continue; const ni=ny*w+nx; if(!mask[ni]||vis2[ni]) continue; const m=mag[ni]; const align=dx*lastDx+dy*lastDy; const score=m+(align>0?5:0); if(score>bestM){ bestM=score; best=ni; bx=dx; by=dy; } } } if(best<0) break; cur=best; vis2[cur]=1; out.push(cur); lastDx=bx; lastDy=by; steps++; } }
  stepBack(startIdx, out2);
  out2.reverse();
  const merged = out2.concat(out1);
  return merged;
}

function floodFillFreeROI(freeMask, w, h, x, y, maxCount, roiRadius){
  if (!freeMask[y*w+x]) return { bitmap:new Uint8Array(w*h), count:0 };
  const stack=[y*w+x]; const seen=new Uint8Array(w*h); const bmp=new Uint8Array(w*h);
  let count=0, borderCount=0;
  const rx0=Math.max(0, x-roiRadius), rx1=Math.min(w-1, x+roiRadius);
  const ry0=Math.max(0, y-roiRadius), ry1=Math.min(h-1, y+roiRadius);
  while(stack.length){ const p=stack.pop(); if(seen[p]) continue; seen[p]=1; if(!freeMask[p]) continue; const px=p%w, py=(p/w)|0; if(px<rx0||px>rx1||py<ry0||py>ry1) continue; bmp[p]=1; count++; if(maxCount&&count>maxCount) return { bitmap:bmp,count,oversize:true };
    if(px===0||py===0||px===w-1||py===h-1) borderCount++;
    if (px>rx0) stack.push(p-1); if(px<rx1) stack.push(p+1); if(py>ry0) stack.push(p-w); if(py<ry1) stack.push(p+w);
  }
  return { bitmap:bmp, count, borderCount };
}

function dilate1(mask,w,h){ const out=new Uint8Array(mask.length); for(let y=0;y<h;y++){ for(let x=0;x<w;x++){ let on=0; for(let dy=-1;dy<=1&&!on;dy++){ for(let dx=-1;dx<=1&&!on;dx++){ const xx=x+dx, yy=y+dy; if(xx>=0&&yy>=0&&xx<w&&yy<h && mask[yy*w+xx]) on=1; } } out[y*w+x]=on; } } return out; }
function findNearestFree(free,w,h,sx,sy,r){ let best=-1,bestD=1e9; for(let dy=-r;dy<=r;dy++){ for(let dx=-r;dx<=r;dx++){ const x=sx+dx,y=sy+dy; if(x<0||y<0||x>=w||y>=h) continue; const i=y*w+x; if(free[i]){ const d=dx*dx+dy*dy; if(d<bestD){ bestD=d; best=i; } } } } return best; }

function marchingSquares(bitmap, w, h) {
  // Simple outer contour by scanning border and tracing where value transitions 0->1
  const visited = new Uint8Array(w * h);
  let start = -1;
  for (let y = 0; y < h && start < 0; y++) for (let x = 0; x < w; x++) { if (bitmap[y * w + x]) { start = y * w + x; break; } }
  if (start < 0) return [];
  let x = start % w, y = (start / w) | 0;
  // Moore-neighbor tracing
  const dirs = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
  const contour = [];
  let dir = 0, guard = 0;
  do {
    contour.push({ x, y });
    visited[y * w + x] = 1;
    let found = false;
    for (let i = 0; i < 8; i++) {
      const k = (dir + i) % 8;
      const nx = x + dirs[k][0];
      const ny = y + dirs[k][1];
      if (nx >= 0 && ny >= 0 && nx < w && ny < h && bitmap[ny * w + nx]) {
        x = nx; y = ny; dir = (k + 6) % 8; found = true; break;
      }
    }
    if (!found) break;
    guard++;
  } while ((x !== (start % w) || y !== ((start / w) | 0)) && guard < w * h * 4);
  return contour;
}

function snapToBarriers(pts, barrier, w, h, r){ if(!pts||pts.length<3||!barrier||barrier.length!==w*h) return pts||[]; const out=[]; for(let i=0;i<pts.length;i++){ const p=pts[i]; let best=p; const rr=r|0||3; let sumX=0,sumY=0,n=0; let cxx=0, cxy=0, cyy=0; for(let dy=-rr;dy<=rr;dy++){ for(let dx=-rr;dx<=rr;dx++){ const x=Math.round(p.x+dx), y=Math.round(p.y+dy); if(x<0||y<0||x>=w||y>=h) continue; if(barrier[y*w+x]){ sumX+=x; sumY+=y; n++; } } } if(n>=5){ const mx=sumX/n, my=sumY/n; // covariance around mean
    for(let dy=-rr;dy<=rr;dy++){
      for(let dx=-rr;dx<=rr;dx++){
        const x=Math.round(p.x+dx), y=Math.round(p.y+dy); if(x<0||y<0||x>=w||y>=h) continue; if(barrier[y*w+x]){ const ux=x-mx, uy=y-my; cxx+=ux*ux; cxy+=ux*uy; cyy+=uy*uy; }
      }
    }
    // eigenvector with largest eigenvalue for 2x2 covariance
    const trace=cxx+cyy, det=cxx*cyy - cxy*cxy; const disc=Math.max(0, trace*trace/4 - det); const l1=trace/2 + Math.sqrt(disc); let vx=1, vy=0; if(cxy!==0 || cxx!==cyy){ if(Math.abs(cxy)>1e-6){ vx = l1 - cyy; vy = cxy; } else { vx = 1; vy = 0; } const norm=Math.hypot(vx,vy)||1; vx/=norm; vy/=norm; }
    // project p onto line through (mx,my) along v
    const px=p.x-mx, py=p.y-my; const t=px*vx + py*vy; const projX=mx + t*vx, projY=my + t*vy; best={ x: Math.max(0, Math.min(w-1, projX)), y: Math.max(0, Math.min(h-1, projY)) };
  } else {
    // fallback to nearest barrier pixel within rr
    let bestD=1e9; for(let dy=-rr;dy<=rr;dy++){ for(let dx=-rr;dx<=rr;dx++){ const x=Math.round(p.x+dx), y=Math.round(p.y+dy); if(x<0||y<0||x>=w||y>=h) continue; if(barrier[y*w+x]){ const d=dx*dx+dy*dy; if(d<bestD){ bestD=d; best={x,y}; } } } }
  }
  out.push(best);
 }
 return out; }

function simplifyDP(points, eps) {
  if (!points || points.length < 3) return points || [];
  function d(p, a, b) {
    const num = Math.abs((b.y - a.y) * p.x - (b.x - a.x) * p.y + b.x * a.y - b.y * a.x);
    const den = Math.hypot(b.y - a.y, b.x - a.x) || 1;
    return num / den;
  }
  function rdp(arr, i, j) {
    let maxD = 0, idx = i;
    for (let k = i + 1; k < j; k++) { const dv = d(arr[k], arr[i], arr[j]); if (dv > maxD) { maxD = dv; idx = k; } }
    if (maxD > eps) { const left = rdp(arr, i, idx); const right = rdp(arr, idx, j); return left.slice(0, -1).concat(right); }
    return [arr[i], arr[j]];
  }
  return rdp(points, 0, points.length - 1);
}

function polygonArea(pts) { let a = 0; const n = pts.length; for (let i = 0; i < n; i++){ const j = (i + 1) % n; a += pts[i].x * pts[j].y - pts[j].x * pts[i].y; } return a / 2; }
function polygonPerimeter(pts) { let p = 0; for (let i = 0; i < pts.length; i++){ const j = (i + 1) % pts.length; p += Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y); } return p; }

function internalEdgeDensity(bitmap, w, h, mag) {
  // Average gradient magnitude over filled region scaled to [0..1]
  let sum = 0, cnt = 0, maxm = 1e-6;
  for (let i = 0; i < mag.length; i++) if (mag[i] > maxm) maxm = mag[i];
  for (let i = 0; i < w * h; i++) if (bitmap[i]) { sum += (mag[i] / maxm); cnt++; }
  return cnt ? (sum / cnt) : 0;
}

function isSimplePolygon(pts) {
  const n = pts.length;
  function dir(a, b, c) { return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x); }
  function inter(a, b, c, d) {
    const d1 = dir(a, b, c), d2 = dir(a, b, d), d3 = dir(c, d, a), d4 = dir(c, d, b);
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
    return false;
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const i2 = (i + 1) % n, j2 = (j + 1) % n;
      if (i === j || i2 === j || j2 === i) continue;
      if (inter(pts[i], pts[i2], pts[j], pts[j2])) return false;
    }
  }
  return true;
}

function bboxOf(pts){ let minX=1e9, minY=1e9, maxX=-1e9, maxY=-1e9; for(const p of pts){ if(p.x<minX)minX=p.x; if(p.y<minY)minY=p.y; if(p.x>maxX)maxX=p.x; if(p.y>maxY)maxY=p.y; } return { minX, minY, maxX, maxY }; }
function iou(a,b){ const ix=Math.max(0, Math.min(a.maxX,b.maxX)-Math.max(a.minX,b.minX)); const iy=Math.max(0, Math.min(a.maxY,b.maxY)-Math.max(a.minY,b.minY)); const inter=ix*iy; const areaA=(a.maxX-a.minX)*(a.maxY-a.minY); const areaB=(b.maxX-b.minX)*(b.maxY-b.minY); const uni=areaA+areaB-inter; return uni>0?inter/uni:0; }


