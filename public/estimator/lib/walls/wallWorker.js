// Wall extraction worker: fast, downsampled, produces polyline segments
// Message: { type:'build', width, height, data: ArrayBuffer, maxDim?: number }
// Reply: { type:'walls', segments: [{ id, points: [{x,y}...] }] }

const MAX_DIM = 1400;

self.onmessage = (e)=>{
  const m = e.data || {};
  if (m.type !== 'build') return;
  try{
    const { width, height, data } = m;
    const src = new Uint8ClampedArray(data);
    const { ds, dsW, dsH, scale } = downsampleRGBA(src, width, height, m.maxDim || MAX_DIM);
    const gray = toGray(ds, dsW, dsH);
    const thr = otsu(gray);
    const bin = threshold(gray, dsW, dsH, Math.max(8, Math.floor(thr*0.95)));
    // morphology: open then close
    const opened = dilate(erode(bin, dsW, dsH, 1), dsW, dsH, 1);
    const closed = erode(dilate(opened, dsW, dsH, 1), dsW, dsH, 1);
    const skel = thinZhangSuen(closed, dsW, dsH, 15);
    const segments = traceSegments(skel, dsW, dsH, scale, 20);
    self.postMessage({ type:'walls', segments });
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
function otsu(gray){ const hist=new Uint32Array(256); for(let i=0;i<gray.length;i++) hist[gray[i]]++; let sum=0; for(let i=0;i<256;i++) sum+=i*hist[i]; let sumB=0,wB=0,maxVar=0,th=0; const total=gray.length; for(let t=0;t<256;t++){ wB+=hist[t]; if(!wB) continue; const wF=total-wB; if(!wF) break; sumB+=t*hist[t]; const mB=sumB/wB, mF=(sum-sumB)/wF; const diff=mB-mF; const v=wB*wF*diff*diff; if(v>maxVar){ maxVar=v; th=t; } } return th; }
function threshold(gray,w,h,t){ const out=new Uint8ClampedArray(w*h); for(let i=0;i<gray.length;i++) out[i]=gray[i]>=t?1:0; return out; }
function erode(mask,w,h,r){ const out=new Uint8ClampedArray(mask.length); for(let y=0;y<h;y++){ for(let x=0;x<w;x++){ let all=1; for(let dy=-r;dy<=r&&all;dy++){ for(let dx=-r;dx<=r&&all;dx++){ const xx=x+dx, yy=y+dy; if(!(xx>=0&&xx<w&&yy>=0&&yy<h&&mask[yy*w+xx])) all=0; } } out[y*w+x]=all; } } return out; }
function dilate(mask,w,h,r){ const out=new Uint8ClampedArray(mask.length); for(let y=0;y<h;y++){ for(let x=0;x<w;x++){ let on=0; for(let dy=-r;dy<=r&&!on;dy++){ for(let dx=-r;dx<=r&&!on;dx++){ const xx=x+dx, yy=y+dy; if(xx>=0&&xx<w&&yy>=0&&yy<h&&mask[yy*w+xx]) on=1; } } out[y*w+x]=on; } } return out; }

// Very small Zhang–Suen thinning (limited iterations)
function thinZhangSuen(bin,w,h,maxIters){ const a=new Uint8ClampedArray(bin); const N=(x,y)=>a[y*w+x]; let changed=true, iter=0; while(changed && iter<maxIters){ changed=false; // step 1
  const rem=[]; for(let y=1;y<h-1;y++){ for(let x=1;x<w-1;x++){ if(!N(x,y)) continue; const p2=N(x,y-1), p3=N(x+1,y-1), p4=N(x+1,y), p5=N(x+1,y+1), p6=N(x,y+1), p7=N(x-1,y+1), p8=N(x-1,y), p9=N(x-1,y-1); const nb=p2+p3+p4+p5+p6+p7+p8+p9; if(nb<2||nb>6) continue; const trans = (!p2&&p3)+(!p3&&p4)+(!p4&&p5)+(!p5&&p6)+(!p6&&p7)+(!p7&&p8)+(!p8&&p9)+(!p9&&p2); if(trans!==1) continue; if(p2&&p4&&p6) continue; if(p4&&p6&&p8) continue; rem.push(y*w+x); } } if(rem.length){ changed=true; for(const i of rem) a[i]=0; }
  const rem2=[]; for(let y=1;y<h-1;y++){ for(let x=1;x<w-1;x++){ if(!N(x,y)) continue; const p2=N(x,y-1), p3=N(x+1,y-1), p4=N(x+1,y), p5=N(x+1,y+1), p6=N(x,y+1), p7=N(x-1,y+1), p8=N(x-1,y), p9=N(x-1,y-1); const nb=p2+p3+p4+p5+p6+p7+p8+p9; if(nb<2||nb>6) continue; const trans = (!p2&&p3)+(!p3&&p4)+(!p4&&p5)+(!p5&&p6)+(!p6&&p7)+(!p7&&p8)+(!p8&&p9)+(!p9&&p2); if(trans!==1) continue; if(p2&&p4&&p8) continue; if(p2&&p6&&p8) continue; rem2.push(y*w+x); } } if(rem2.length){ changed=true; for(const i of rem2) a[i]=0; }
  iter++; }
  return a;
}

function traceSegments(skel,w,h,scale,minLen){
  const deg = new Uint8ClampedArray(w*h);
  const nbrs=[[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){ if(!skel[y*w+x]) continue; let d=0; for(const [dx,dy] of nbrs){ const xx=x+dx, yy=y+dy; if(xx>=0&&xx<w&&yy>=0&&yy<h && skel[yy*w+xx]) d++; } deg[y*w+x]=d; }
  const visited=new Uint8ClampedArray(w*h); const segs=[]; let sid=1;
  function walk(x,y){ const pts=[]; let cx=x, cy=y, last=-1; while(true){ const idx=cy*w+cx; if(visited[idx]) break; visited[idx]=1; pts.push({ x: cx*scale, y: cy*scale }); let next=-1, nx=0, ny=0; for(let k=0;k<nbrs.length;k++){ const dx=nbrs[k][0], dy=nbrs[k][1]; const xx=cx+dx, yy=cy+dy; if(xx<0||xx>=w||yy<0||yy>=h) continue; const ii=yy*w+xx; if(!skel[ii] || visited[ii]) continue; next=ii; nx=xx; ny=yy; break; } if(next<0) break; cx=nx; cy=ny; }
    return pts;
  }
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){ const i=y*w+x; if(!skel[i]||visited[i]) continue; if(deg[i]!==1){ continue; } const pts=walk(x,y); if(pts.length*scale >= minLen) segs.push({ id: String(sid++), points: simplify(pts, 1.2*scale) }); }
  return segs;
}

// RDP simplify
function simplify(pts, eps){ if(!pts||pts.length<3) return pts||[]; function d(p,a,b){ const num=Math.abs((b.y-a.y)*p.x - (b.x-a.x)*p.y + b.x*a.y - b.y*a.x); const den=Math.hypot(b.y-a.y, b.x-a.x)||1; return num/den; } function rdp(arr,i,j){ let max=0,idx=i; for(let k=i+1;k<j;k++){ const v=d(arr[k], arr[i], arr[j]); if(v>max){ max=v; idx=k; } } if(max>eps){ const L=rdp(arr,i,idx), R=rdp(arr,idx,j); return L.slice(0,-1).concat(R); } return [arr[i], arr[j]]; } return rdp(pts,0,pts.length-1); }



