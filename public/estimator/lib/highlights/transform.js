// Coordinate transforms between canvas pixels and normalized [0..1] page space

export function toNormalized(point, width, height) {
  const w = Math.max(1, Number(width) || 1);
  const h = Math.max(1, Number(height) || 1);
  return { x: point.x / w, y: point.y / h };
}

export function fromNormalized(point, width, height) {
  return { x: point.x * (Number(width) || 0), y: point.y * (Number(height) || 0) };
}

export function normalizePath(points, width, height) {
  return (points || []).map(p => toNormalized(p, width, height));
}

export function denormalizePath(points, width, height) {
  return (points || []).map(p => fromNormalized(p, width, height));
}


