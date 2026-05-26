// Geometry utilities for freehand highlight paths
// Points are objects: { x: number, y: number }

export function pathBounds(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points || []) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
}

export function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

// Ramer–Douglas–Peucker simplification
export function simplifyRDP(points, epsilon = 0.75) {
  const pts = Array.isArray(points) ? points : [];
  if (pts.length < 3) return pts.slice();

  function perpendicularDistance(p, a, b) {
    const num = Math.abs((b.y - a.y) * p.x - (b.x - a.x) * p.y + b.x * a.y - b.y * a.x);
    const den = Math.hypot(b.y - a.y, b.x - a.x) || 1;
    return num / den;
  }

  function rdp(startIdx, endIdx) {
    let maxDist = 0;
    let index = startIdx;
    const a = pts[startIdx];
    const b = pts[endIdx];
    for (let i = startIdx + 1; i < endIdx; i++) {
      const d = perpendicularDistance(pts[i], a, b);
      if (d > maxDist) { maxDist = d; index = i; }
    }
    if (maxDist > epsilon) {
      const left = rdp(startIdx, index);
      const right = rdp(index, endIdx);
      return left.slice(0, -1).concat(right);
    }
    return [a, b];
  }

  return rdp(0, pts.length - 1);
}

export function smooth(points, windowSize = 3) {
  const pts = Array.isArray(points) ? points : [];
  if (pts.length <= 2 || windowSize <= 1) return pts.slice();
  const half = Math.floor(windowSize / 2);
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    let sx = 0, sy = 0, n = 0;
    for (let j = i - half; j <= i + half; j++) {
      const k = Math.max(0, Math.min(pts.length - 1, j));
      sx += pts[k].x; sy += pts[k].y; n++;
    }
    out.push({ x: sx / n, y: sy / n });
  }
  return out;
}

export function drawPolyline(ctx, points, { strokeStyle = 'rgba(255, 255, 0, 0.9)', lineWidth = 8, lineCap = 'round', lineJoin = 'round' } = {}) {
  if (!ctx || !points || points.length === 0) return;
  ctx.save();
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = lineCap;
  ctx.lineJoin = lineJoin;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.stroke();
  ctx.restore();
}


