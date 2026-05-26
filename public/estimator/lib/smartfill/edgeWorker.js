// Barrier worker: builds a downsampled barrier (wall) mask and optional gradient magnitude
// Message API:
// { type: 'build', width, height, data: ArrayBuffer, maxDim?: number, method?: 'sauvola'|'mean', k?:number, window?:number }
// → { type: 'barriers', width, height, dsWidth, dsHeight, scale, barrierMask: ArrayBuffer, gradMag: ArrayBuffer, inkMask?: ArrayBuffer }

const DEFAULT_MAX_DIM = 1600; // tuning: analysis scale (sharper centerlines)

self.onmessage = (e) => {
  const msg = e.data || {};
  if (msg.type === 'build') {
    try {
      const res = buildBarrier(msg);
      const transfers = [res.barrierMask.buffer];
      if (res.gradMag && res.gradMag.buffer) transfers.push(res.gradMag.buffer);
      if (res.inkMask && res.inkMask.buffer) transfers.push(res.inkMask.buffer);
      self.postMessage({ type: 'barriers', ...res }, transfers);
    } catch (err) {
      self.postMessage({ type: 'error', error: String(err && err.message || err) });
    }
  }
};

function buildBarrier({ width, height, data, maxDim = DEFAULT_MAX_DIM, method, k = 0.2, window:win = 31, dilateR = 1, erodeR = 1, minBlobArea = 40 }) {
  // Clone image data immediately; main thread may reuse backing buffer
  const src = new Uint8ClampedArray(new Uint8ClampedArray(data));
  const gray = toGrayscale(src, width, height);
  // Downsample for speed
  let scale = Math.max(1, Math.ceil(Math.max(width, height) / maxDim));
  let dsW = Math.max(1, Math.floor(width / scale));
  let dsH = Math.max(1, Math.floor(height / scale));
  let ds = downsampleBox(gray, width, height, dsW, dsH);

  // Slight blur to reduce noise
  let blurred = boxBlur(ds, dsW, dsH, 1);

  let gradX, gradY;
  ({ gradX, gradY } = sobel(blurred, dsW, dsH));
  // magnitude scaled to 0..255 for histogram
  let { mag } = edgesFromGradients(gradX, gradY, dsW, dsH);
  const hist = new Uint32Array(256);
  for (let i = 0; i < mag.length; i++) { const v = clamp(Math.floor(mag[i]),0,255); mag[i] = v; hist[v]++; }
  let t = method==='sauvola' ? 0 : otsuThreshold(hist, mag.length);
  t = Math.max(8, Math.floor((t||32) * 0.9));
  let ink = null;
  let barrier = new Uint8Array(dsW * dsH);
  if (method === 'sauvola') {
    barrier = sauvolaThreshold(blurred, dsW, dsH, win, k);
  } else if (method === 'mean') {
    barrier = meanLocalThreshold(blurred, dsW, dsH, win||31);
  } else {
    ink = new Uint8Array(dsW*dsH); for (let i = 0; i < mag.length; i++) { ink[i] = mag[i] >= t ? 1 : 0; }
    barrier = ink;
  }
  // Keep a copy of raw ink for debug (optional)
  const inkMask = ink ? new Uint8Array(ink) : undefined;
  // Connect and solidify walls
  barrier = dilate(barrier, dsW, dsH, dilateR|0 || 1);
  barrier = erode(barrier, dsW, dsH, erodeR|0 || 1);
  barrier = bridgeDoors(barrier, dsW, dsH);
  barrier = closeDiagonalGaps(barrier, dsW, dsH); // connect 1px diagonal gaps
  barrier = directionalClose(barrier, dsW, dsH, 5); // connect collinear gaps
  // Thin to near 1px centerlines so barriers align with ink lines
  barrier = thinZhangSuen(barrier, dsW, dsH, 15);
  barrier = connectNearbyEndpoints(barrier, dsW, dsH, 2);
  barrier = thinZhangSuen(barrier, dsW, dsH, 6);
  barrier = pruneShortSpurs(barrier, dsW, dsH, 4);
  barrier = removeTiny(barrier, dsW, dsH, Math.max(1, minBlobArea|0 || 40));

  let edgeSum = sumMask(barrier);
  let edgeDensity = edgeSum / (dsW * dsH);
  // Fallback: if barrier looks empty, try mean threshold and a slightly stronger connect pass
  if (edgeDensity < 0.0005) {
    scale = Math.max(1, Math.ceil(Math.max(width, height) / 256));
    dsW = Math.max(1, Math.floor(width / scale));
    dsH = Math.max(1, Math.floor(height / scale));
    ds = downsampleBox(gray, width, height, dsW, dsH);
    blurred = boxBlur(ds, dsW, dsH, 0);
    ({ gradX, gradY } = sobel(blurred, dsW, dsH));
    ({ mag } = edgesFromGradients(gradX, gradY, dsW, dsH));
    const hist2 = new Uint32Array(256); for (let i=0;i<mag.length;i++){ const v=clamp(Math.floor(mag[i]),0,255); mag[i]=v; hist2[v]++; }
    let t2 = otsuThreshold(hist2, mag.length); t2 = Math.max(8, Math.floor(t2*0.9));
    let b2 = meanLocalThreshold(blurred, dsW, dsH, 31);
    b2 = dilate(b2, dsW, dsH, 2); b2 = erode(b2, dsW, dsH, 1); b2 = bridgeDoors(b2, dsW, dsH); b2 = closeDiagonalGaps(b2, dsW, dsH); b2 = directionalClose(b2, dsW, dsH, 5);
    // Connectivity priority first
    b2 = thinZhangSuen(b2, dsW, dsH, 10);
    b2 = connectNearbyEndpoints(b2, dsW, dsH, 3);
    b2 = connectByDarkLOS(b2, ds, dsW, dsH, 7, 175); // grayscale-guided small bridges
    b2 = closeDiagonalGaps(b2, dsW, dsH);
    b2 = thinZhangSuen(b2, dsW, dsH, 6);
    b2 = pruneShortSpurs(b2, dsW, dsH, 4);
    b2 = removeTiny(b2, dsW, dsH, Math.max(1, minBlobArea|0 || 40));
    barrier = b2;
    edgeSum = sumMask(barrier); edgeDensity = edgeSum / (dsW*dsH);
  }

  // Estimate drawing ROI as the bbox of barrier pixels with a small padding
  const roi = computeRoi(barrier, dsW, dsH, 6);

  // Adaptive variant selection: try conservative/balanced/aggressive connectivity
  const v1 = refineVariant(barrier, ds, dsW, dsH, { dirClose:3, endDist:2, spur:4, thin1:6, thin2:0 });
  const v2 = refineVariant(barrier, ds, dsW, dsH, { dirClose:5, endDist:3, spur:4, thin1:8, thin2:0 });
  const v3 = refineVariant(barrier, ds, dsW, dsH, { dirClose:7, endDist:5, spur:3, thin1:10, thin2:4 });
  const picks = [v1, v2, v3];
  const scored = picks.map(m => ({ mask:m, score: scoreClosedness(m, dsW, dsH) }));
  scored.sort((a,b)=> a.score - b.score);
  const best = (scored[0] && scored[0].mask) || barrier;

  return {
    width,
    height,
    dsWidth: dsW,
    dsHeight: dsH,
    scale,
    barrierMask: best,
    gradMag: mag,
    inkMask,
    roi
  };
}

function toGrayscale(rgba, w, h) {
  const out = new Uint8ClampedArray(w * h);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j++) {
    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
    out[j] = (0.299 * r + 0.587 * g + 0.114 * b) | 0;
  }
  return out;
}

function downsampleBox(src, sw, sh, dw, dh) {
  const out = new Uint8ClampedArray(dw * dh);
  const sx = sw / dw, sy = sh / dh;
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const x0 = Math.floor(x * sx);
      const y0 = Math.floor(y * sy);
      const x1 = Math.min(sw, Math.floor((x + 1) * sx));
      const y1 = Math.min(sh, Math.floor((y + 1) * sy));
      let sum = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) {
        const off = yy * sw;
        for (let xx = x0; xx < x1; xx++) { sum += src[off + xx]; n++; }
      }
      out[y * dw + x] = n ? (sum / n) | 0 : 0;
    }
  }
  return out;
}

function boxBlur(src, w, h, r) {
  if (r <= 0) return src;
  const out = new Uint8ClampedArray(src.length);
  const tmp = new Uint16Array(src.length);
  // horizontal
  for (let y = 0; y < h; y++) {
    let sum = 0;
    for (let x = -r; x <= r; x++) sum += src[y * w + clamp(x, 0, w - 1)];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = sum;
      const x0 = x - r, x1 = x + r + 1;
      if (x0 >= 0) sum -= src[y * w + x0];
      if (x1 < w) sum += src[y * w + x1];
    }
  }
  // vertical
  const diam = 2 * r + 1;
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += tmp[clamp(y, 0, h - 1) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = (sum / diam) | 0;
      const y0 = y - r, y1 = y + r + 1;
      if (y0 >= 0) sum -= tmp[y0 * w + x];
      if (y1 < h) sum += tmp[y1 * w + x];
    }
  }
  return out;
}

function sobel(src, w, h) {
  const gradX = new Float32Array(w * h);
  const gradY = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      const tl = src[p - w - 1], tc = src[p - w], tr = src[p - w + 1];
      const ml = src[p - 1], mc = src[p], mr = src[p + 1];
      const bl = src[p + w - 1], bc = src[p + w], br = src[p + w + 1];
      const gx = -tl - 2 * ml - bl + tr + 2 * mr + br;
      const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;
      gradX[p] = gx; gradY[p] = gy;
    }
  }
  return { gradX, gradY };
}

function edgesFromGradients(gx, gy, w, h) {
  const mag = new Float32Array(w * h);
  for (let i = 0; i < mag.length; i++) { const m = Math.hypot(gx[i] || 0, gy[i] || 0); mag[i] = m; }
  const edges = new Uint8Array(w * h); // unused
  return { mag, edges };
}

function dilate(mask, w, h, r = 1) { const out = new Uint8ClampedArray(mask.length); const R=r; for(let y=0;y<h;y++){ for(let x=0;x<w;x++){ let on=0; for(let dy=-R;dy<=R && !on;dy++){ for(let dx=-R;dx<=R && !on;dx++){ const xx=x+dx, yy=y+dy; if(xx>=0&&xx<w&&yy>=0&&yy<h && mask[yy*w+xx]) on=1; } } out[y*w+x]=on; } } return out; }
function erode(mask, w, h, r = 1) { const out = new Uint8ClampedArray(mask.length); const R=r; for(let y=0;y<h;y++){ for(let x=0;x<w;x++){ let all=1; for(let dy=-R;dy<=R && all;dy++){ for(let dx=-R;dx<=R && all;dx++){ const xx=x+dx, yy=y+dy; if(!(xx>=0&&xx<w&&yy>=0&&yy<h && mask[yy*w+xx])) all=0; } } out[y*w+x]=all; } } return out; }

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function sumMask(arr){ let s=0; for(let i=0;i<arr.length;i++) s+=arr[i]; return s; }
function otsuThreshold(hist, total){ let sum=0; for(let i=0;i<256;i++) sum+=i*hist[i]; let sumB=0, wB=0, maxVar=0, thresh=0; for(let t=0;t<256;t++){ wB+=hist[t]; if(wB===0) continue; const wF=total-wB; if(wF===0) break; sumB+=t*hist[t]; const mB=sumB/wB, mF=(sum-sumB)/wF; const diff=mB-mF; const between=wB*wF*diff*diff; if(between>maxVar){ maxVar=between; thresh=t; } } return thresh; }
function sauvolaThreshold(gray,w,h,win=21,k=0.2){ const r=(win|0)||21; const R=Math.max(1,Math.floor(r/2)); const out=new Uint8Array(w*h); const integ=new Uint32Array((w+1)*(h+1)); const integ2=new Float64Array((w+1)*(h+1)); for(let y=1;y<=h;y++){ let rows=0, rows2=0; for(let x=1;x<=w;x++){ const v=gray[(y-1)*w+(x-1)]; rows+=v; rows2+=v*v; const idx=y*(w+1)+x; integ[idx]=integ[idx-(w+1)]+rows; integ2[idx]=integ2[idx-(w+1)]+rows2; } } const kR=128; for(let y=0;y<h;y++){ for(let x=0;x<w;x++){ const x0=Math.max(0,x-R), x1=Math.min(w-1,x+R), y0=Math.max(0,y-R), y1=Math.min(h-1,y+R); const A=(x1-x0+1)*(y1-y0+1); const s = rectSum(integ,w,h,x0,y0,x1,y1); const s2= rectSumF(integ2,w,h,x0,y0,x1,y1); const mean=s/A; const varr=Math.max(0,(s2/A)-(mean*mean)); const std=Math.sqrt(varr); const T=mean*(1+k*((std/kR)-1)); // walls are darker → barrier when gray < T
      out[y*w+x]=gray[y*w+x] < T ? 1 : 0; } } return out; }
function meanLocalThreshold(gray,w,h,win){ const R=Math.max(1,Math.floor((win||31)/2)); const out=new Uint8Array(w*h); const integ=new Uint32Array((w+1)*(h+1)); for(let y=1;y<=h;y++){ let rows=0; for(let x=1;x<=w;x++){ const v=gray[(y-1)*w+(x-1)]; rows+=v; const idx=y*(w+1)+x; integ[idx]=integ[idx-(w+1)]+rows; } } for(let y=0;y<h;y++){ for(let x=0;x<w;x++){ const x0=Math.max(0,x-R), x1=Math.min(w-1,x+R), y0=Math.max(0,y-R), y1=Math.min(h-1,y+R); const A=(x1-x0+1)*(y1-y0+1); const s = rectSum(integ,w,h,x0,y0,x1,y1); const mean=s/A; out[y*w+x] = gray[y*w+x] < mean ? 1 : 0; } } return out; }
function rectSum(integ,w,h,x0,y0,x1,y1){ const W=w+1; const a=integ[y0*W + x0], b=integ[y0*W + (x1+1)], c=integ[(y1+1)*W + x0], d=integ[(y1+1)*W + (x1+1)]; return d - b - c + a; }
function rectSumF(integ,w,h,x0,y0,x1,y1){ const W=w+1; const a=integ[y0*W + x0], b=integ[y0*W + (x1+1)], c=integ[(y1+1)*W + x0], d=integ[(y1+1)*W + (x1+1)]; return d - b - c + a; }
function bridgeDoors(mask,w,h){ const out=new Uint8Array(mask); for(let y=1;y<h-1;y++){ for(let x=1;x<w-1;x++){ const i=y*w+x; if(mask[i]) continue; const l=mask[y*w+(x-1)], r=mask[y*w+(x+1)], u=mask[(y-1)*w+x], d=mask[(y+1)*w+x]; if((l&&r) && (u||d)) { out[i]=1; continue; } if((u&&d) && (l||r)) { out[i]=1; continue; } } } return out; }
function removeTiny(mask,w,h,minArea){ const seen=new Uint8Array(w*h); const out=new Uint8Array(mask); const qx=new Int32Array(w*h), qy=new Int32Array(w*h); for(let i=0;i<mask.length;i++){ if(!mask[i]||seen[i]) continue; let head=0,tail=0; const sx=i%w, sy=(i/w)|0; qx[tail]=sx; qy[tail]=sy; tail++; seen[i]=1; let count=0, minx=sx,maxx=sx,miny=sy,maxy=sy; const comp=[]; while(head<tail){ const x=qx[head], y=qy[head]; head++; const idx=y*w+x; comp.push(idx); count++; if(x<minx)minx=x; if(x>maxx)maxx=x; if(y<miny)miny=y; if(y>maxy)maxy=y; for(let dy=-1;dy<=1;dy++){ for(let dx=-1;dx<=1;dx++){ if(dx===0&&dy===0) continue; const xx=x+dx, yy=y+dy; if(xx<0||yy<0||xx>=w||yy>=h) continue; const ii=yy*w+xx; if(mask[ii]&&!seen[ii]){ seen[ii]=1; qx[tail]=xx; qy[tail]=yy; tail++; } } } }
    const ww=maxx-minx+1, hh=maxy-miny+1; if(count<minArea || (ww<2 && hh<2)){ for(const idx of comp) out[idx]=0; }
  }
  return out; }

function thinZhangSuen(bin,w,h,maxIters){ const a=new Uint8ClampedArray(bin); const N=(x,y)=>a[y*w+x]; let changed=true, iter=0; while(changed && iter<(maxIters||15)){ changed=false; const rem=[]; for(let y=1;y<h-1;y++){ for(let x=1;x<w-1;x++){ if(!N(x,y)) continue; const p2=N(x,y-1), p3=N(x+1,y-1), p4=N(x+1,y), p5=N(x+1,y+1), p6=N(x,y+1), p7=N(x-1,y+1), p8=N(x-1,y), p9=N(x-1,y-1); const nb=p2+p3+p4+p5+p6+p7+p8+p9; if(nb<2||nb>6) continue; const trans = (!p2&&p3)+(!p3&&p4)+(!p4&&p5)+(!p5&&p6)+(!p6&&p7)+(!p7&&p8)+(!p8&&p9)+(!p9&&p2); if(trans!==1) continue; if(p2&&p4&&p6) continue; if(p4&&p6&&p8) continue; rem.push(y*w+x); } } if(rem.length){ changed=true; for(const i of rem) a[i]=0; } const rem2=[]; for(let y=1;y<h-1;y++){ for(let x=1;x<w-1;x++){ if(!N(x,y)) continue; const p2=N(x,y-1), p3=N(x+1,y-1), p4=N(x+1,y), p5=N(x+1,y+1), p6=N(x,y+1), p7=N(x-1,y+1), p8=N(x-1,y), p9=N(x-1,y-1); const nb=p2+p3+p4+p5+p6+p7+p8+p9; if(nb<2||nb>6) continue; const trans = (!p2&&p3)+(!p3&&p4)+(!p4&&p5)+(!p5&&p6)+(!p6&&p7)+(!p7&&p8)+(!p8&&p9)+(!p9&&p2); if(trans!==1) continue; if(p2&&p4&&p8) continue; if(p2&&p6&&p8) continue; rem2.push(y*w+x); } } if(rem2.length){ changed=true; for(const i of rem2) a[i]=0; } iter++; } return a; }

// Remove short dangling spurs from a 1px skeleton. A spur is defined as a pixel
// with degree 1 whose path to the nearest junction is shorter than maxLen.
function pruneShortSpurs(mask,w,h,maxLen){ const a=new Uint8Array(mask); const deg=new Uint8Array(w*h); const idx=(x,y)=>y*w+x; const inside=(x,y)=>x>=0&&y>=0&&x<w&&y<h; for(let y=0;y<h;y++){ for(let x=0;x<w;x++){ if(!a[idx(x,y)]) continue; let d=0; for(let dy=-1;dy<=1;dy++){ for(let dx=-1;dx<=1;dx++){ if(dx===0&&dy===0) continue; const xx=x+dx, yy=y+dy; if(inside(xx,yy)&&a[idx(xx,yy)]) d++; } } deg[idx(x,y)]=d; } } const qx=new Int16Array(w*h), qy=new Int16Array(w*h); const seen=new Uint8Array(w*h); for(let y=1;y<h-1;y++){ for(let x=1;x<w-1;x++){ const i=idx(x,y); if(!a[i]||deg[i]!==1) continue; // start of spur
    let head=0,tail=0; qx[tail]=x; qy[tail]=y; tail++; seen[i]=1; const path=[]; let hitJunction=false; while(head<tail && path.length<=maxLen){ const cx=qx[head], cy=qy[head]; head++; const ci=idx(cx,cy); path.push(ci); if(deg[ci]!==1 && path.length>1){ hitJunction=true; break; } for(let dy=-1;dy<=1;dy++){ for(let dx=-1;dx<=1;dx++){ if(dx===0&&dy===0) continue; const nx=cx+dx, ny=cy+dy; const ni=idx(nx,ny); if(!inside(nx,ny)||!a[ni]||seen[ni]) continue; seen[ni]=1; qx[tail]=nx; qy[tail]=ny; tail++; } } }
    if(!hitJunction && path.length>0 && path.length<=maxLen){ for(const pi of path) a[pi]=0; }
  } }
  return a;
}

// For each skeleton pixel, nudge it toward the darkest local gray ridge so the
// centerline aligns with the actual printed line center. radius: search radius
// in pixels on the ds grayscale image; iters: how many relaxation steps.
function snapToDarkest(skel, gray, w, h, radius=2, iters=6){ const a=new Uint8Array(skel); const idx=(x,y)=>y*w+x; const inside=(x,y)=>x>=0&&y>=0&&x<w&&y<h; for(let k=0;k<iters;k++){ const moves=[]; for(let y=1;y<h-1;y++){ for(let x=1;x<w-1;x++){ if(!a[idx(x,y)]) continue; let bestX=x, bestY=y, bestV=gray[idx(x,y)]; for(let dy=-radius;dy<=radius;dy++){ for(let dx=-radius;dx<=radius;dx++){ const xx=x+dx, yy=y+dy; if(!inside(xx,yy)) continue; const v=gray[idx(xx,yy)]; if(v<bestV){ bestV=v; bestX=xx; bestY=yy; } } } if(bestX!==x || bestY!==y) moves.push([x,y,bestX,bestY]); } } for(const [x,y,nx,ny] of moves){ a[idx(y,x)]; a[idx(x,y)]=0; a[idx(nx,ny)]=1; } }
  return a; }

function computeRoi(mask,w,h,pad=6){ let minx=w, miny=h, maxx=-1, maxy=-1; let cnt=0; for(let y=0;y<h;y++){ for(let x=0;x<w;x++){ if(mask[y*w+x]){ cnt++; if(x<minx)minx=x; if(x>maxx)maxx=x; if(y<miny)miny=y; if(y>maxy)maxy=y; } } }
  if (cnt < 50) return { x:0, y:0, w, h };
  minx=Math.max(0,minx-pad); miny=Math.max(0,miny-pad); maxx=Math.min(w-1,maxx+pad); maxy=Math.min(h-1,maxy+pad);
  return { x:minx, y:miny, w:(maxx-minx+1), h:(maxy-miny+1) };
}

// Connect diagonals like
// 1 0
// 0 1  →  fill center to bridge 1px gaps, and 2×2 near-miss cases.
function closeDiagonalGaps(mask,w,h){ const out=new Uint8Array(mask); const idx=(x,y)=>y*w+x; for(let y=1;y<h-1;y++){ for(let x=1;x<w-1;x++){ const i=idx(x,y); if(out[i]) continue; const a=out[idx(x-1,y-1)], b=out[idx(x+1,y-1)], c=out[idx(x-1,y+1)], d=out[idx(x+1,y+1)]; const l=out[idx(x-1,y)], r=out[idx(x+1,y)], u=out[idx(x,y-1)], dn=out[idx(x,y+1)]; if((a&&d && (u||l||r||dn)) || (b&&c && (u||l||r||dn))){ out[i]=1; continue; } } } return out; }

// Connect endpoints that are very close but not touching (small gaps after thinning)
function connectNearbyEndpoints(mask,w,h,maxDist){ const out=new Uint8Array(mask); const deg=new Uint8Array(w*h); const pts=[]; const idx=(x,y)=>y*w+x; const inside=(x,y)=>x>=0&&y>=0&&x<w&&y<h; for(let y=1;y<h-1;y++){ for(let x=1;x<w-1;x++){ if(!out[idx(x,y)]) continue; let d=0; for(let dy=-1;dy<=1;dy++){ for(let dx=-1;dx<=1;dx++){ if(dx===0&&dy===0) continue; const xx=x+dx, yy=y+dy; if(inside(xx,yy)&&out[idx(xx,yy)]) d++; } } deg[idx(x,y)]=d; if(d===1) pts.push([x,y]); } } for(let i=0;i<pts.length;i++){ const [x1,y1]=pts[i]; for(let j=i+1;j<pts.length;j++){ const [x2,y2]=pts[j]; const dx=x2-x1, dy=y2-y1; const dist=Math.hypot(dx,dy); if(dist>maxDist) continue; // draw a tiny line between
      const steps=Math.max(1,Math.ceil(dist)); for(let s=0;s<=steps;s++){ const t=s/steps; const x=Math.round(x1+dx*t), y=Math.round(y1+dy*t); if(inside(x,y)) out[idx(x,y)]=1; }
    } } return out; }

// Bridge collinear gaps along rows/cols using run-length fill up to radius
function directionalClose(mask,w,h,radius){ const out=new Uint8Array(mask); for(let y=0;y<h;y++){ let x=0; while(x<w){ while(x<w && !out[y*w+x]) x++; let s=x; while(x<w && out[y*w+x]) x++; let e=x-1; if(s<w && e>=s){ // look ahead for small gaps
        let g=0; while(x<w && g<radius && !out[y*w+x]){ g++; x++; }
        if(g>0 && g<=radius){ let k=x; while(k<w && out[y*w+k]) k++; if(k>x){ for(let t=0;t<g;t++) out[y*w+(x-g+t)]=1; } }
      }
    } }
  for(let x=0;x<w;x++){ let y=0; while(y<h){ while(y<h && !out[y*w+x]) y++; let s=y; while(y<h && out[y*w+x]) y++; let e=y-1; if(s<h && e>=s){ let g=0; while(y<h && g<radius && !out[y*w+x]){ g++; y++; } if(g>0 && g<=radius){ let k=y; while(k<h && out[k*w+x]) k++; if(k>y){ for(let t=0;t<g;t++) out[(y-g+t)*w+x]=1; } } } } }
  return out; }

// Connect endpoints if the straight line between them is dark in grayscale (LOS)
function connectByDarkLOS(mask, gray, w, h, maxDist, maxMean){ const out=new Uint8Array(mask); const deg=new Uint8Array(w*h); const pts=[]; const idx=(x,y)=>y*w+x; const inside=(x,y)=>x>=0&&y>=0&&x<w&&y<h; for(let y=1;y<h-1;y++){ for(let x=1;x<w-1;x++){ if(!out[idx(x,y)]) continue; let d=0; for(let dy=-1;dy<=1;dy++){ for(let dx=-1;dx<=1;dx++){ if(dx===0&&dy===0) continue; const xx=x+dx, yy=y+dy; if(inside(xx,yy)&&out[idx(xx,yy)]) d++; } } deg[idx(x,y)]=d; if(d===1) pts.push([x,y]); } } for(let i=0;i<pts.length;i++){ const [x1,y1]=pts[i]; for(let j=i+1;j<pts.length;j++){ const [x2,y2]=pts[j]; const dx=x2-x1, dy=y2-y1; const dist=Math.hypot(dx,dy); if(dist>maxDist) continue; // sample grayscale along segment
      const steps=Math.max(1,Math.ceil(dist)); let sum=0; for(let s=0;s<=steps;s++){ const t=s/steps; const x=Math.round(x1+dx*t), y=Math.round(y1+dy*t); if(!inside(x,y)) continue; sum+=gray[idx(x,y)]; }
      const mean = sum/(steps+1); if(mean<=maxMean){ for(let s=0;s<=steps;s++){ const t=s/steps; const x=Math.round(x1+dx*t), y=Math.round(y1+dy*t); if(inside(x,y)) out[idx(x,y)]=1; } }
    } }
  return out; }

// Build a connectivity refinement variant with given parameters
function refineVariant(mask, gray, w, h, { dirClose=5, endDist=3, spur=4, thin1=6, thin2=0 }){
  let m = directionalClose(mask, w, h, dirClose|0);
  m = connectNearbyEndpoints(m, w, h, endDist|0);
  m = connectByDarkLOS(m, gray, w, h, Math.max(2,endDist|0)+2, 180);
  if (thin1>0) m = thinZhangSuen(m, w, h, thin1|0);
  m = closeDiagonalGaps(m, w, h);
  if (thin2>0) m = thinZhangSuen(m, w, h, thin2|0);
  m = pruneShortSpurs(m, w, h, spur|0);
  return m;
}

// Heuristic score: fewer endpoints and reasonable density wins
function scoreClosedness(mask, w, h){ const total=w*h; let sum=0; for(let i=0;i<mask.length;i++) sum+=mask[i]; const density = sum/total; const deg=new Uint8Array(w*h); let endpoints=0; const inside=(x,y)=>x>=0&&y>=0&&x<w&&y<h; for(let y=1;y<h-1;y++){ for(let x=1;x<w-1;x++){ if(!mask[y*w+x]) continue; let d=0; for(let dy=-1;dy<=1;dy++){ for(let dx=-1;dx<=1;dx++){ if(dx===0&&dy===0) continue; const xx=x+dx, yy=y+dy; if(inside(xx,yy)&&mask[yy*w+xx]) d++; } } if(d===1) endpoints++; } }
  // penalize masks that are too sparse or too dense
  const densityPenalty = (density<0.0008||density>0.035) ? 0.5 : 0;
  return (endpoints/(sum||1)) + densityPenalty;
}


