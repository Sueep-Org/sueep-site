// In-memory store of highlights per page (Smart Fill polygons).
// Each item: { points: [{x,y} normalized], areaPx: number, areaUnits?: number, unit?: string }

export class HighlightsStore {
  constructor() {
    this._pageToStrokes = new Map();
    this._pageToRedo = new Map();
    this._pageToProposed = new Map();
    this._pageToLines = new Map(); // vector lines per page
    this._pageToScale = new Map(); // per-page scale factors (real_units_per_px)
    this._pageToMeasurements = new Map(); // per-page saved manual measurements
    this._version = 1;
  }

  _ensure(page) {
    if (!this._pageToStrokes.has(page)) this._pageToStrokes.set(page, []);
    if (!this._pageToRedo.has(page)) this._pageToRedo.set(page, []);
    if (!this._pageToProposed.has(page)) this._pageToProposed.set(page, []);
    if (!this._pageToLines.has(page)) this._pageToLines.set(page, []);
    if (!this._pageToScale.has(page)) this._pageToScale.set(page, null);
    if (!this._pageToMeasurements.has(page)) this._pageToMeasurements.set(page, []);
  }

  getPage(page) {
    this._ensure(page);
    return this._pageToStrokes.get(page);
  }

  addPolygon(page, polygon) {
    this._ensure(page);
    const arr = this._pageToStrokes.get(page);
    const entry = { ...polygon };
    arr.push(entry);
    // clear redo stack on new action
    this._pageToRedo.set(page, []);
    return entry;
  }

  undo(page) {
    this._ensure(page);
    const arr = this._pageToStrokes.get(page);
    if (!arr.length) return null;
    const s = arr.pop();
    const redoArr = this._pageToRedo.get(page);
    redoArr.push(s);
    return s;
  }

  redo(page) {
    this._ensure(page);
    const redoArr = this._pageToRedo.get(page);
    if (!redoArr.length) return null;
    const s = redoArr.pop();
    const arr = this._pageToStrokes.get(page);
    arr.push(s);
    return s;
  }

  clearPage(page) {
    this._pageToStrokes.set(page, []);
    this._pageToRedo.set(page, []);
    this._pageToProposed.set(page, []);
    this._pageToLines.set(page, []);
    this._pageToScale.set(page, null);
    this._pageToMeasurements.set(page, []);
  }

  clearAll() {
    this._pageToStrokes.clear();
    this._pageToRedo.clear();
    this._pageToProposed.clear();
    this._pageToLines.clear();
    this._pageToScale.clear();
    this._pageToMeasurements.clear();
  }

  exportJSON() {
    const out = {};
    for (const [page, strokes] of this._pageToStrokes.entries()) out[page] = strokes;
    return JSON.stringify({ v: this._version, pages: out }, null, 2);
  }

  importJSON(jsonText) {
    try {
      const data = typeof jsonText === 'string' ? JSON.parse(jsonText) : jsonText;
      if (!data || typeof data !== 'object') throw new Error('Invalid highlights file');
      const pages = data.pages || {};
      this._pageToStrokes = new Map();
      this._pageToRedo = new Map();
      this._pageToProposed = new Map();
      for (const k of Object.keys(pages)) {
        const pageNum = Number(k);
        const arr = Array.isArray(pages[k]) ? pages[k] : [];
        this._pageToStrokes.set(pageNum, arr);
        this._pageToRedo.set(pageNum, []);
        this._pageToProposed.set(pageNum, []);
        this._pageToLines.set(pageNum, []);
        this._pageToScale.set(pageNum, null);
        this._pageToMeasurements.set(pageNum, []);
      }
      return true;
    } catch (e) {
      console.error('importJSON failed', e);
      return false;
    }
  }

  // Proposed layer API
  addProposed(page, poly) { this._ensure(page); const arr=this._pageToProposed.get(page); arr.push({ ...poly, __id: (arr.length?arr[arr.length-1].__id+1:1) }); }
  setProposed(page, polys) { this._ensure(page); const arr = Array.isArray(polys)?polys:[]; let id=1; this._pageToProposed.set(page, arr.map(p=>({ ...p, __id: id++ }))); }
  clearProposed(page) { this._ensure(page); this._pageToProposed.set(page, []); }
  listProposed(page) { this._ensure(page); return this._pageToProposed.get(page); }
  listAccepted(page) { this._ensure(page); return this._pageToStrokes.get(page); }
  toggleProposedSelection(page, id) { this._ensure(page); const arr=this._pageToProposed.get(page); const idx=arr.findIndex(p=>p.__id===id); if(idx>=0){ const p=arr[idx]; arr.splice(idx,1); const acc=this._pageToStrokes.get(page); acc.push({ points:p.points, areaPx:p.areaPx, areaUnits:p.areaUnits, unit:p.unit }); this._pageToRedo.set(page, []); } }
  acceptAllProposed(page) { this._ensure(page); const arr=this._pageToProposed.get(page); const acc=this._pageToStrokes.get(page); arr.forEach(p=>{ acc.push({ points:p.points, areaPx:p.areaPx, areaUnits:p.areaUnits, unit:p.unit }); }); this._pageToProposed.set(page, []); this._pageToRedo.set(page, []); }

  // Serialization (for per-project localStorage persistence)
  serialize() {
    const strokes = {};
    for (const [page, arr] of this._pageToStrokes.entries()) strokes[page] = arr;
    const measurements = {};
    for (const [page, arr] of this._pageToMeasurements.entries()) measurements[page] = arr;
    const scales = {};
    for (const [page, s] of this._pageToScale.entries()) if (s != null) scales[page] = s;
    return JSON.stringify({ v: this._version, strokes, measurements, scales });
  }

  deserialize(json) {
    try {
      const data = typeof json === 'string' ? JSON.parse(json) : json;
      if (!data || typeof data !== 'object') return false;
      this._pageToStrokes = new Map();
      this._pageToRedo = new Map();
      this._pageToProposed = new Map();
      this._pageToLines = new Map();
      this._pageToScale = new Map();
      this._pageToMeasurements = new Map();
      for (const k of Object.keys(data.strokes || {})) {
        const p = Number(k);
        this._pageToStrokes.set(p, data.strokes[k] || []);
        this._pageToRedo.set(p, []);
        this._pageToProposed.set(p, []);
        this._pageToLines.set(p, []);
      }
      for (const k of Object.keys(data.scales || {})) {
        this._pageToScale.set(Number(k), data.scales[k]);
      }
      for (const k of Object.keys(data.measurements || {})) {
        this._pageToMeasurements.set(Number(k), data.measurements[k] || []);
      }
      return true;
    } catch(e) {
      console.error('deserialize failed', e);
      return false;
    }
  }

  // Vector line API
  setLines(page, lines){ this._ensure(page); // expected: [{ id, x1,y1,x2,y2 } with normalized coords 0..1]
    this._pageToLines.set(page, Array.isArray(lines)?lines.slice():[]);
  }

  getLines(page){ this._ensure(page); return this._pageToLines.get(page); }

  clearLines(page){ this._ensure(page); this._pageToLines.set(page, []); }

  // Scale API (real_units per pixel). unit is a string like 'in' or 'ft'
  setScale(page, scaleObj){ this._ensure(page); this._pageToScale.set(page, scaleObj); }
  getScale(page){ this._ensure(page); return this._pageToScale.get(page); }

  // Measurements
  addMeasurement(page, m){ this._ensure(page); const arr=this._pageToMeasurements.get(page); arr.push(m); }
  removeMeasurement(page, id){
    this._ensure(page);
    const arr=this._pageToMeasurements.get(page);
    const idx = arr.findIndex(m=>m.id===id);
    if (idx < 0) return false;

    const measurement = arr[idx];
    arr.splice(idx, 1);

    const isAreaMeasurement = Boolean(
      measurement?.area != null ||
      measurement?.areaLabel != null ||
      measurement?.areaPx != null ||
      measurement?.shapeType === 'polygon'
    );
    if (isAreaMeasurement) {
      const polygons = this._pageToStrokes.get(page) || [];
      const shapePoints = Array.isArray(measurement?.shapePoints) ? measurement.shapePoints : [];
      const polygonPoints = Array.isArray(measurement?.polygonPoints) ? measurement.polygonPoints : [];

      const samePoints = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((pt, i) => {
        const other = b[i] || {};
        return Math.abs((pt.x || 0) - (other.x || 0)) < 1e-9 && Math.abs((pt.y || 0) - (other.y || 0)) < 1e-9;
      });
      const targetPolygonId = measurement.polygonId || measurement.id;
      const exactMatches = polygons.filter(poly =>
        poly.id === measurement.id ||
        poly.id === targetPolygonId ||
        poly.measurementId === measurement.id ||
        poly.measurementId === targetPolygonId
      );

      if (exactMatches.length) {
        const exactIndex = polygons.findIndex(poly => exactMatches[0] === poly);
        if (exactIndex >= 0) polygons.splice(exactIndex, 1);
      } else if (shapePoints.length || polygonPoints.length) {
        const fallbackMatches = polygons.filter(poly =>
          samePoints(poly.points, shapePoints) ||
          samePoints(poly.points, polygonPoints)
        );
        if (fallbackMatches.length === 1) {
          const fallbackIndex = polygons.findIndex(poly => fallbackMatches[0] === poly);
          if (fallbackIndex >= 0) polygons.splice(fallbackIndex, 1);
        }
      }
    }

    return true;
  }
  listMeasurements(page){ this._ensure(page); return this._pageToMeasurements.get(page); }
  listMeasurementsAllPages(){ const out=[]; for (const [page, arr] of this._pageToMeasurements.entries()){ out.push({ page, measurements: arr.slice() }); } return out; }
}


