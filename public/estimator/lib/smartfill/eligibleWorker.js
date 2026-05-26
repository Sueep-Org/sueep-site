// Eligible-area gate worker
// API:
//  - { type:'build', width, height, data:ArrayBuffer, textBoxes:[{x,y,w,h}], maxDim?:number }
// Returns:
//  - { type:'eligible', dsWidth, dsHeight, scaleDown, allowedMask:ArrayBuffer }

const MAX_DIM = 1200;

self.onmessage = (e)=>{
  const m = e.data || {};
  try{
    if (m.type !== 'build') return;
    const src = new Uint8ClampedArray(m.data.slice(0));
    const W = m.width|0, H = m.height|0;
    const scale = Math.max(1, Math.ceil(Math.max(W,H) / (m.maxDim||MAX_DIM)));
    const dsW = Math.max(1, Math.floor(W/scale));
    const dsH = Math.max(1, Math.floor(H/scale));
    const ds = downsampleRGBA(src, W, H, dsW, dsH);
    const gray = toGray(ds, dsW, dsH);
    // 1) textMask from boxes (grown 4px)
    const textMask = new Uint8ClampedArray(dsW*dsH);
    (m.textBoxes||[]).forEach(b=>{ const x=Math.max(0, Math.floor(b.x/scale)-4); const y=Math.max(0, Math.floor(b.y/scale)-4); const w=Math.min(dsW-x, Math.ceil(b.w/scale)+8); const h=Math.min(dsH-y, Math.ceil(b.h/scale)+8); for(let yy=y; yy<y+h; yy++){ const off=yy*dsW; for(let xx=x; xx<x+w; xx++){ textMask[off+xx]=255; } } });
    // 2) drawing mask from thresholded strokes
    const ink = sauvola(gray, dsW, dsH, 39, 0.2);
    let draw = open(ink, dsW, dsH); // clean small noise
    // Remove large uniform blocks: suppress components with low perimeter/area
    draw = filterComponents(draw, dsW, dsH);
    // Expand to allow clicks near walls
    draw = dilate(draw, dsW, dsH, 6);
    const allowed = new Uint8ClampedArray(dsW*dsH);
    for (let i=0;i<allowed.length;i++) allowed[i] = (draw[i] && !textMask[i]) ? 255 : 0;
    self.postMessage({ type:'eligible', dsWidth:dsW, dsHeight:dsH, scaleDown: scale, allowedMask: allowed.buffer }, [allowed.buffer]);
  }catch(err){ self.postMessage({ type:'error', error: String(err && err.message || err) }); }
};

function downsampleRGBA(rgba, w, h, dw, dh){ const out=new Uint8ClampedArray(dw*dh*4); const sx=w/dw, sy=h/dh; for(let y=0;y<dh;y++){ for(let x=0;x<dw;x++){ const x0=Math.floor(x*sx), x1=Math.min(w, Math.floor((x+1)*sx)); const y0=Math.floor(y*sy), y1=Math.min(h, Math.floor((y+1)*sy)); let r=0,g=0,b=0,a=0,n=0; for(let yy=y0;yy<y1;yy++){ for(let xx=x0;xx<x1;xx++){ const i=(yy*w+xx)*4; r+=rgba[i]; g+=rgba[i+1]; b+=rgba[i+2]; a+=rgba[i+3]; n++; } } const j=(y*dw+x)*4; out[j]=r/n|0; out[j+1]=g/n|0; out[j+2]=b/n|0; out[j+3]=a/n|0; } } return out; }
function toGray(rgba,w,h){ const out=new Uint8ClampedArray(w*h); for(let i=0,j=0;i<rgba.length;i+=4,j++){ out[j]=(0.299*rgba[i]+0.587*rgba[i+1]+0.114*rgba[i+2])|0; } return out; }
function sauvola(gray,w,h,win=39,k=0.2){ const R=Math.max(1,Math.floor(win/2)); const integ=new Uint32Array((w+1)*(h+1)); const integ2=new Float64Array((w+1)*(h+1)); for(let y=1;y<=h;y++){ let rows=0, rows2=0; for(let x=1;x<=w;x++){ const v=gray[(y-1)*w+(x-1)]; rows+=v; rows2+=v*v; const idx=y*(w+1)+x; integ[idx]=integ[idx-(w+1)]+rows; integ2[idx]=integ2[idx-(w+1)]+rows2; } } const out=new Uint8ClampedArray(w*h); const kR=128; for(let y=0;y<h;y++){ for(let x=0;x<w;x++){ const x0=Math.max(0,x-R), x1=Math.min(w-1,x+R), y0=Math.max(0,y-R), y1=Math.min(h-1,y+R); const A=(x1-x0+1)*(y1-y0+1); const s = rectSum(integ,w,h,x0,y0,x1,y1); const s2= rectSumF(integ2,w,h,x0,y0,x1,y1); const mean=s/A; const varr=Math.max(0,(s2/A)-(mean*mean)); const std=Math.sqrt(varr); const T=mean*(1+k*((std/kR)-1)); out[y*w+x] = gray[y*w+x] < T ? 1 : 0; } } return out; }
function rectSum(integ,w,h,x0,y0,x1,y1){ const W=w+1; const a=integ[y0*W + x0], b=integ[y0*W + (x1+1)], c=integ[(y1+1)*W + x0], d=integ[(y1+1)*W + (x1+1)]; return d - b - c + a; }
function rectSumF(integ,w,h,x0,y0,x1,y1){ const W=w+1; const a=integ[y0*W + x0], b=integ[y0*W + (x1+1)], c=integ[(y1+1)*W + x0], d=integ[(y1+1)*W + (x1+1)]; return d - b - c + a; }
function dilate(mask,w,h,r){ const out=new Uint8ClampedArray(mask.length); for(let y=0;y<h;y++){ for(let x=0;x<w;x++){ let on=0; for(let dy=-r;dy<=r&&!on;dy++){ for(let dx=-r;dx<=r&&!on;dx++){ const xx=x+dx, yy=y+dy; if(xx>=0&&xx<w&&yy>=0&&yy<h && mask[yy*w+xx]) on=1; } } out[y*w+x]=on?255:0; } } return out; }
function erode(mask,w,h,r){ const out=new Uint8ClampedArray(mask.length); for(let y=0;y<h;y++){ for(let x=0;x<w;x++){ let all=1; for(let dy=-r;dy<=r&&all;dy++){ for(let dx=-r;dx<=r&&all;dx++){ const xx=x+dx, yy=y+dy; if(!(xx>=0&&xx<w&&yy>=0&&yy<h && mask[yy*w+xx])) all=0; } } out[y*w+x]=all?255:0; } } return out; }
function open(mask,w,h){ return erode(dilate(mask,w,h,1),w,h,1); }
function filterComponents(mask,w,h){ const seen=new Uint8Array(w*h); const out=new Uint8ClampedArray(mask); const qx=new Int32Array(w*h), qy=new Int32Array(w*h); for(let i=0;i<mask.length;i++){ if(!mask[i]||seen[i]) continue; let head=0,tail=0; const sx=i%w, sy=(i/w)|0; qx[tail]=sx; qy[tail]=sy; tail++; seen[i]=1; let minx=sx,maxx=sx,miny=sy,maxy=sy, area=0, perim=0; const comp=[]; while(head<tail){ const x=qx[head], y=qy[head]; head++; const idx=y*w+x; comp.push(idx); area++; let edgeN=0; for(let dy=-1;dy<=1;dy++){ for(let dx=-1;dx<=1;dx++){ if(dx===0&&dy===0) continue; const xx=x+dx, yy=y+dy; if(xx<0||yy<0||xx>=w||yy>=h||!mask[yy*w+xx]) edgeN++; else if(!seen[yy*w+xx]){ seen[yy*w+xx]=1; qx[tail]=xx; qy[tail]=yy; tail++; } } } perim+=edgeN>0?1:0; if(x<minx)minx=x; if(x>maxx)maxx=x; if(y<miny)miny=y; if(y>maxy)maxy=y; }
    const ww=maxx-minx+1, hh=maxy-miny+1; const aspect = ww>hh? ww/(hh||1) : hh/(ww||1); const compact = perim/(area||1);
    // Keep thin/elongated features; drop big compact blobs
    const keep = (aspect>3) || (compact>0.25);
    if(!keep){ for(const idx of comp) out[idx]=0; }
  }
  return out; }



