const UNIT_KEY = 'measure.unit';
const SCALE_KEY = 'measure.pxPerUnit';

function read(key, fallback){ try{ const v=localStorage.getItem(key); if(v===null||v===undefined) return fallback; const num=Number(v); return Number.isFinite(num)?num:v; }catch{ return fallback; } }
function write(key, value){ try{ localStorage.setItem(key, String(value)); }catch{} }

const MeasureStore = {
  getUnit(){ const v = read(UNIT_KEY, 'ft'); return (v==='in'||v==='m')?v:'ft'; },
  setUnit(u){ const v = (u==='in'||u==='m')?u:'ft'; write(UNIT_KEY, v); },
  getPxPerUnit(){ const v = read(SCALE_KEY, ''); const n=Number(v); return Number.isFinite(n)&&n>0 ? n : null; },
  setPxPerUnit(v){ const n=Number(v); if(Number.isFinite(n)&&n>0) write(SCALE_KEY, n); }
};

export default MeasureStore;




