// A drop-in replacement for window.confirm() — same reason as
// lib/textPrompt.js (window.confirm/alert/prompt all throw "not supported"
// in the Next.js-hosted environment this runs inside). Resolves true/false
// instead of returning synchronously, so callers need `await` in front of
// where they used to call window.confirm() directly.
//
// Styled to match textPrompt.js / the SOV modal in simple-app.js, same
// backdrop/panel/mini-btn look.
export function confirmDialog({ title = '', message = '', confirmLabel = 'OK', cancelLabel = 'Cancel', danger = false } = {}) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.55);display:flex;align-items:center;justify-content:center;padding:20px;z-index:10001;';

    const panel = document.createElement('div');
    panel.style.cssText = 'width:min(420px, 100%);background:white;border-radius:12px;box-shadow:0 16px 50px rgba(0,0,0,.25);padding:18px;';

    panel.innerHTML = `
      ${title ? `<div style="font-size:15px;font-weight:700;color:#111827;margin-bottom:6px;">${title}</div>` : ''}
      ${message ? `<div style="font-size:13px;color:#374151;white-space:pre-wrap;">${message}</div>` : ''}
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px;">
        <button class="mini-btn" data-confirm-cancel type="button">${cancelLabel}</button>
        <button class="mini-btn" data-confirm-ok type="button" style="background:${danger ? '#dc2626' : '#111827'};color:white;">${confirmLabel}</button>
      </div>
    `;

    let settled = false;
    function finish(value) {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKeyDown, true);
      backdrop.remove();
      resolve(value);
    }
    function onKeyDown(e) {
      if (e.key === 'Escape') { e.preventDefault(); finish(false); }
      else if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    }

    panel.querySelector('[data-confirm-cancel]').addEventListener('click', () => finish(false));
    panel.querySelector('[data-confirm-ok]').addEventListener('click', () => finish(true));
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) finish(false); });
    document.addEventListener('keydown', onKeyDown, true);

    backdrop.appendChild(panel);
    document.body.appendChild(backdrop);
    panel.querySelector('[data-confirm-ok]').focus();
  });
}
