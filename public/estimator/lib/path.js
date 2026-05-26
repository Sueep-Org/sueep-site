export function splitPath(p = '') {
  return (p || '').replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
}
export function joinPath(parts) {
  return (parts || []).filter(Boolean).join('/');
}
export function parentPath(p) {
  const a = splitPath(p); a.pop(); return joinPath(a);
}
export function basename(p) {
  const a = splitPath(p); return a[a.length - 1] || '';
} 