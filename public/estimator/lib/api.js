import { API_BASE } from '../config.js';
import { getAnonId } from './anon.js';

function withAnon(init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('x-anon-id', getAnonId());
  return { ...init, headers };
}

export async function listFiles(folder = '') {
  const url = `${API_BASE}/api/files/list`;
  console.log('GET', url);
  const r = await fetch(url, withAnon({ credentials: 'include' }));
  const ct = r.headers.get('content-type') || '';
  if (!r.ok) {
    const t = await r.text();
    if (!ct.includes('application/json')) return { folders: [], files: [] };
    throw new Error(t);
  }
  if (!ct.includes('application/json')) return { folders: [], files: [] };
  return await r.json();
}

export async function saveFromProcessing({ sourceBlobUrl, name }) {
  const body = { sourceBlobUrl, name };
  const url = `${API_BASE}/api/files/save`;
  console.log('POST', url, body);
  const r = await fetch(url, withAnon({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
  if (!r.ok) throw new Error(await r.text());
  return await r.json();
}

export async function uploadInit({ filename, path='' }) {
  const url = `${API_BASE}/api/files/upload-init`;
  const body = { filename, path };
  console.log('POST', url, body);
  const res = await fetch(url, withAnon({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
  if (!res.ok) {
    const txt = await res.text();
    console.error('upload-init failed', res.status, txt);
    throw new Error(`upload-init ${res.status}: ${txt}`);
  }
  return res.json();
}

export async function renameFile({ oldPath, newPath }) {
  // Stub: not supported yet. If backend supports move, call it here.
  console.warn('renameFile stub: backend move not implemented');
  return Promise.resolve();
}

export async function deleteFile({ blobUrl }) {
  // Stub: delete endpoint not present; hide delete in UI.
  console.warn('deleteFile stub: backend delete not implemented');
  return Promise.resolve();
} 

export async function listBoth() {
  const url = `${API_BASE}/api/files/list-all`;
  console.log('GET', url);
  const r = await fetch(url, withAnon({ credentials: 'include', headers: { 'content-type': 'application/json' } }));
  if (!r.ok) throw new Error(`list-all failed ${r.status}`);
  return r.json();
}

export async function getDownloadUrl(kind, name){
  const url = `${API_BASE}/api/files/download-url?kind=${encodeURIComponent(kind)}&name=${encodeURIComponent(name)}`;
  const r = await fetch(url, withAnon());
  if (!r.ok) throw new Error(`dl ${r.status}`);
  return r.json();
}

export async function renameSaved(oldName, newName){
  const url = `${API_BASE}/api/files/rename`;
  const r = await fetch(url, withAnon({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ old: oldName, new: newName }) }));
  if (!r.ok) throw new Error(`rename ${r.status}`);
  return r.json();
}

export async function deleteSaved(name){
  const url = `${API_BASE}/api/files/delete`;
  const r = await fetch(url, withAnon({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) }));
  if (!r.ok) throw new Error(`delete ${r.status}`);
  return r.json();
}

export async function listSavedOnly(){
  const pickFiles = (arr) => (Array.isArray(arr) ? arr.filter(x => x?.kind === 'file') : []);
  try {
    const data = await listBoth();
    if (data?.saved || data?.processing) {
      return [...pickFiles(data.saved), ...pickFiles(data.processing)];
    }
    if (Array.isArray(data)) {
      return data.filter(x => x?.kind === 'file' && (!x.path || x.path.startsWith('saved/') || x.path.startsWith('processing/')));
    }
    if (data?.items) {
      return data.items.filter(x => x?.kind === 'file' && (!x.path || x.path.startsWith('saved/') || x.path.startsWith('processing/')));
    }
  } catch {}
  return [];
}

export async function listAllNormalized(){
  const url = `${API_BASE}/api/files/list-all?ts=${Date.now()}`;
  const res = await fetch(url, withAnon({ credentials: 'include', headers: { 'content-type': 'application/json' } }));
  if (!res.ok) throw new Error(`list-all failed ${res.status}`);
  const data = await res.json();
  console.log('[drawer] list-all payload:', data);
  return normalizeFiles(data);
}

function normalizeFiles(data){
  const onlyFiles = (arr) => (Array.isArray(arr) ? arr.filter(x => x?.kind === 'file') : []);
  let merged = [];
  if (data?.saved || data?.processing) {
    merged = [...onlyFiles(data.saved), ...onlyFiles(data.processing)];
  } else if (Array.isArray(data)) {
    merged = onlyFiles(data);
  } else if (data?.items) {
    merged = onlyFiles(data.items);
  } else {
    merged = [];
  }
  // Temporarily do not filter by path; render everything the API sends
  return merged.sort((a, b) => {
    const ta = (a.updatedMs ?? Date.parse(a.updatedAt ?? a.lastModified ?? 0)) ?? 0;
    const tb = (b.updatedMs ?? Date.parse(b.updatedAt ?? b.lastModified ?? 0)) ?? 0;
    return tb - ta || String(a.name || a.path || '').localeCompare(String(b.name || b.path || ''));
  });
}