// Validators for Smart Fill polygons

export const MIN_AREA_PX = 800;
export const MAX_AREA_RATIO = 1.0; // relaxed: no page-ratio rejection in validatePolygon
export const MAX_VERTICES = 250;
export const DENSITY_MAX = 0.08;
export const MIN_COMPACTNESS = 0.02; // 4πA/P^2

let __rejTimer = 0, __rejLast = '';
function logOnce(msg){ if (__rejLast === msg && __rejTimer && (Date.now()-__rejTimer)<800) return; __rejLast = msg; __rejTimer = Date.now(); try{ console.warn('[validator]', msg); }catch{} }

export function validatePolygon({ polygon, areaPx, perimeterPx, density, canvasW, canvasH, selfIntersect }) {
  if (!Array.isArray(polygon) || polygon.length < 3) return fail('Invalid polygon');
  if (selfIntersect) return fail('Self-intersection');
  if (!Number.isFinite(areaPx) || areaPx < MIN_AREA_PX) return fail('Too small');
  // No page ratio cap by default (relaxed)
  if (polygon.length > MAX_VERTICES) return fail('Too many vertices');
  if (Number.isFinite(density) && density > DENSITY_MAX) return fail('Too noisy');
  const compactness = calcCompactness(areaPx, perimeterPx);
  if (compactness < MIN_COMPACTNESS) return fail('Too thin');
  for (const p of polygon) {
    if (p.x < 0 || p.y < 0 || p.x > canvasW || p.y > canvasH) return fail('Out of bounds');
  }
  return { ok: true, reason: '' };
}

function calcCompactness(area, perim) {
  const p2 = perim * perim;
  if (p2 <= 0) return 0;
  return (4 * Math.PI * area) / p2;
}

function fail(reason) { logOnce(reason); return { ok: false, reason }; }

// Slightly stricter filter for auto-detect prepopulation to reduce false positives
export function isValidForAuto({ polygon, areaPx, perimeterPx, density, canvasW, canvasH, selfIntersect }) {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;
  if (selfIntersect) return false;
  const minArea = MIN_AREA_PX * 1.2; // stricter min area
  if (!Number.isFinite(areaPx) || areaPx < minArea) return false;
  const maxArea = Math.max(1, canvasW * canvasH) * Math.min(0.5, MAX_AREA_RATIO); // stricter ratio
  if (areaPx > maxArea) return false;
  if (polygon.length > Math.min(160, MAX_VERTICES)) return false;
  if (Number.isFinite(density) && density > Math.max(0.06, Math.min(DENSITY_MAX, 0.08))) return false;
  const compactness = calcCompactness(areaPx, perimeterPx);
  if (compactness < Math.max(0.03, MIN_COMPACTNESS)) return false;
  for (const p of polygon) {
    if (p.x < 0 || p.y < 0 || p.x > canvasW || p.y > canvasH) return false;
  }
  return true;
}


