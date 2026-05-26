// In-memory store of highlights per page (Smart Fill polygons).
// Each item: { points: [{x,y} normalized], areaPx: number, areaUnits?: number, unit?: string }

export class HighlightsStore {
  constructor() {
    this._pageToStrokes = new Map();
    this._pageToRedo = new Map();
    this._pageToProposed = new Map();
    this._version = 1;
  }

  _ensure(page) {
    if (!this._pageToStrokes.has(page)) this._pageToStrokes.set(page, []);
    if (!this._pageToRedo.has(page)) this._pageToRedo.set(page, []);
    if (!this._pageToProposed.has(page)) this._pageToProposed.set(page, []);
  }

  getPage(page) {
    this._ensure(page);
    return this._pageToStrokes.get(page);
  }

  addPolygon(page, polygon) {
    this._ensure(page);
    const arr = this._pageToStrokes.get(page);
    arr.push(polygon);
    // clear redo stack on new action
    this._pageToRedo.set(page, []);
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
  }

  clearAll() {
    this._pageToStrokes.clear();
    this._pageToRedo.clear();
    this._pageToProposed.clear();
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
}


