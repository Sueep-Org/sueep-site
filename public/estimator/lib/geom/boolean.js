// Minimal raster-based polygon boolean (union / subtract) using canvas compositing
// Works in screen space. Suitable for relatively small canvases (< 2MP).

export function union(polysA, polyB, width, height) {
  return rasterBoolean(polysA, polyB, width, height, 'union');
}

export function subtract(polysA, polyB, width, height) {
  return rasterBoolean(polysA, polyB, width, height, 'subtract');
}

function rasterBoolean(polysA, polyB, width, height, op) {
  const can = document.createElement('canvas');
  can.width = Math.max(1, Math.floor(width));
  can.height = Math.max(1, Math.floor(height));
  const ctx = can.getContext('2d');
  ctx.clearRect(0, 0, can.width, can.height);
  ctx.fillStyle = '#000';
  ctx.globalCompositeOperation = 'source-over';
  drawPolys(ctx, polysA);
  if (op === 'union') {
    ctx.globalCompositeOperation = 'source-over';
    drawPolys(ctx, [polyB]);
  } else if (op === 'subtract') {
    ctx.globalCompositeOperation = 'destination-out';
    drawPolys(ctx, [polyB]);
  }
  const img = ctx.getImageData(0, 0, can.width, can.height);
  const mask = new Uint8Array(can.width * can.height);
  for (let i = 0; i < mask.length; i++) mask[i] = img.data[i * 4 + 3] > 0 ? 1 : 0;
  const poly = marchingSquares(mask, can.width, can.height);
  return poly;
}

function drawPolys(ctx, polys) {
  for (const pts of polys || []) {
    if (!Array.isArray(pts) || pts.length < 3) continue;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fill();
  }
}

// Simple marching squares outer contour
function marchingSquares(bitmap, w, h) {
  // find first 1
  let start = -1;
  for (let i = 0; i < bitmap.length; i++) { if (bitmap[i]) { start = i; break; } }
  if (start < 0) return [];
  let x = start % w, y = (start / w) | 0;
  const path = [];
  const dirs = [[1,0],[0,1],[-1,0],[0,-1]]; // R,D,L,U
  let dir = 0;
  const seen = new Set();
  const key = (x,y,d)=>`${x},${y},${d}`;
  let guard=0;
  while(guard<w*h*4){
    path.push({ x, y }); seen.add(key(x,y,dir));
    // choose next by marching squares rules
    const i = y*w + x;
    const right = x+1<w && bitmap[y*w + (x+1)] ? 1 : 0;
    const down  = y+1<h && bitmap[(y+1)*w + x] ? 1 : 0;
    const diag  = (x+1<w && y+1<h && bitmap[(y+1)*w + (x+1)]) ? 1 : 0;
    const code = (bitmap[i]?1:0) | (right?2:0) | (down?4:0) | (diag?8:0);
    switch(code){
      case 0: return path;
      case 1: case 5: case 13: dir = 3; break;        // up
      case 2: case 3: case 7:  dir = 0; break;        // right
      case 4: case 12: case 14:dir = 2; break;        // left
      case 8: case 10: case 11:dir = 1; break;        // down
      case 6: dir = (dir===0?1:0); break;             // ambiguous
      case 9: dir = (dir===3?2:3); break;             // ambiguous
      default: dir = (dir+1)&3; break;
    }
    x += dirs[dir][0]; y += dirs[dir][1];
    if (x<0||y<0||x>=w||y>=h) break;
    if (seen.has(key(x,y,dir))) break;
    guard++;
  }
  return path;
}



