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
    const bin = threshold(gray, dsW, dsH, Math.max(38, Math.min(180, thr + 25)));
    const opened = dilate(erode(bin, dsW, dsH, 1), dsW, dsH, 1);
    const closed = erode(dilate(opened, dsW, dsH, 1), dsW, dsH, 1);
    const components = connectedComponents(closed, dsW, dsH);
    const segments = traceComponents(components, dsW, dsH, scale, Math.max(45, Math.ceil(Math.min(dsW, dsH) * 0.06)));
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

function connectedComponents(mask,w,h){
  const visited=new Uint8ClampedArray(w*h);
  const comps=[];
  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      const idx=y*w+x;
      if(!mask[idx] || visited[idx]) continue;
      const stack=[[x,y]];
      const pixels=[];
      visited[idx]=1;
      while(stack.length){
        const [cx,cy]=stack.pop();
        const pidx=cy*w+cx;
        pixels.push({ x: cx, y: cy });
        for(let dy=-1;dy<=1;dy++){
          for(let dx=-1;dx<=1;dx++){
            if(!dx&&!dy) continue;
            const nx=cx+dx, ny=cy+dy;
            if(nx<0||nx>=w||ny<0||ny>=h) continue;
            const nidx=ny*w+nx;
            if(mask[nidx] && !visited[nidx]){ visited[nidx]=1; stack.push([nx,ny]); }
          }
        }
      }
      comps.push(pixels);
    }
  }
  return comps;
}

function traceComponents(components,w,h,scale,minLen){
  const segs=[];
  let sid=1;
  for(const pixels of components){
    if(pixels.length < 4) continue;
    const xs=pixels.map(p=>p.x);
    const ys=pixels.map(p=>p.y);
    const minX=Math.min(...xs), maxX=Math.max(...xs), minY=Math.min(...ys), maxY=Math.max(...ys);
    const width=maxX-minX+1;
    const height=maxY-minY+1;
    const length=Math.max(width, height) * scale;
    if(length < minLen) continue;
    const aspect = Math.max(width, height) / Math.max(1, Math.min(width, height));
    if(aspect < 3) continue;
    const centerX=(minX+maxX)/2;
    const centerY=(minY+maxY)/2;
    const isHorizontal = width >= height * 2;
    const start = isHorizontal
      ? { x: minX * scale, y: centerY * scale }
      : { x: centerX * scale, y: minY * scale };
    const end = isHorizontal
      ? { x: maxX * scale, y: centerY * scale }
      : { x: centerX * scale, y: maxY * scale };
    segs.push({ id: String(sid++), points: [start, end] });
  }
  return segs;
}



