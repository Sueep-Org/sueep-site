// Minimal library API helpers
import { API_BASE } from '../config.js';

export async function listFiles({ folder = '', token = '' } = {}) {
  const q = new URLSearchParams();
  if (folder) q.set('prefix', folder);
  if (token) q.set('token', token);
  const r = await fetch(`${API_BASE}/files/list?${q.toString()}`, { credentials: 'include' });
  const ct = r.headers.get('content-type') || '';
  if (!r.ok) {
    const t = await r.text();
    if (!ct.includes('application/json')) return { items: [], token: '' };
    throw new Error(t);
  }
  if (!ct.includes('application/json')) return { items: [], token: '' };
  const j = await r.json();
  const items = (j.items || j.files || []).map(normalizeItem);
  return { items, token: j.token || j.nextToken || j.nextPageToken || '' };
}

export async function downloadSas(path, ttlSeconds = 300) {
  const r = await fetch(`${API_BASE}/files/sas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, ttlSeconds })
  });
  if (!r.ok) throw new Error(await r.text());
  return await r.json();
}

export async function moveFile(from, to) {
  const r = await fetch(`${API_BASE}/files/move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to })
  });
  if (!r.ok) throw new Error(await r.text());
  return await r.json();
}

export async function deleteFile(path) {
  const r = await fetch(`${API_BASE}/files?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
  if (!r.ok) throw new Error(await r.text());
  return await r.json();
}

export function humanSize(n) {
  if (!Number.isFinite(n)) return '';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0; let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${u[i]}`;
}

export function humanDate(d) {
  try { const t = typeof d === 'string' ? new Date(d) : d; return t.toLocaleString(); } catch { return ''; }
}

function normalizeItem(it) {
  return {
    path: it.path || it.name || it.blobPath || '',
    name: it.name || (it.path ? it.path.split('/').pop() : ''),
    folder: deriveFolder(it.path || ''),
    url: it.url || it.blobUrl || '',
    thumbUrl: it.thumbUrl || '',
    size: it.size || 0,
    contentType: it.contentType || '',
    modifiedOn: it.createdAt || it.modifiedOn || ''
  };
}

export function deriveFolder(p) {
  const parts = (p || '').split('/');
  if (parts.length <= 2) return '';
  return parts.slice(2, -1).join('/'); // strip saved/<userPrefix>/ and filename
} 