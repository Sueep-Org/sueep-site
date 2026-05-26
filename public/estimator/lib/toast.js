const containerId = 'toastContainer';

function ensureContainer() {
  let c = document.getElementById(containerId);
  if (!c) {
    c = document.createElement('div');
    c.id = containerId;
    c.style.position = 'fixed';
    c.style.right = '12px';
    c.style.bottom = '12px';
    c.style.zIndex = '9999';
    document.body.appendChild(c);
  }
  return c;
}

export function toast(msg, type = 'info', timeout = 3000) {
  const c = ensureContainer();
  const n = document.createElement('div');
  n.style.background = type === 'error' ? '#5d1a1a' : type === 'success' ? '#165d2b' : '#333';
  n.style.color = '#fff';
  n.style.padding = '8px 10px';
  n.style.marginTop = '8px';
  n.style.borderRadius = '6px';
  n.style.font = '12px system-ui, sans-serif';
  n.textContent = String(msg);
  c.appendChild(n);
  setTimeout(() => { n.remove(); }, timeout);
} 