// A drop-in replacement for window.prompt(), which this app can't use —
// it throws "prompt() is not supported" in the Next.js-hosted environment
// this runs inside (dialogs the OS itself would have to render aren't
// available there). Same call shape otherwise: resolves with the entered
// text (trimmed), or null if the user cancels/closes without entering
// anything — callers that used to check `if (entry && entry.trim())` after
// a synchronous window.prompt() just need `await` in front of this instead.
//
// Styled to match the SOV modal in simple-app.js (same backdrop/panel/
// mini-btn look) rather than introducing a second modal style.
export function textPrompt({ title = '', message = '', defaultValue = '', placeholder = '' } = {}) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.55);display:flex;align-items:center;justify-content:center;padding:20px;z-index:10001;';

    const panel = document.createElement('div');
    panel.style.cssText = 'width:min(420px, 100%);background:white;border-radius:12px;box-shadow:0 16px 50px rgba(0,0,0,.25);padding:18px;';

    panel.innerHTML = `
      ${title ? `<div style="font-size:15px;font-weight:700;color:#111827;margin-bottom:6px;">${title}</div>` : ''}
      ${message ? `<div style="font-size:12px;color:#374151;margin-bottom:10px;white-space:pre-wrap;">${message}</div>` : ''}
      <input type="text" data-text-prompt-input style="width:100%;box-sizing:border-box;padding:7px 9px;font-size:13px;border:1px solid #d1d5db;border-radius:6px;color:#111827;" />
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px;">
        <button class="mini-btn" data-text-prompt-cancel type="button">Cancel</button>
        <button class="mini-btn" data-text-prompt-ok type="button" style="background:#111827;color:white;">OK</button>
      </div>
    `;

    const input = panel.querySelector('[data-text-prompt-input]');
    input.value = defaultValue || '';
    input.placeholder = placeholder || '';

    let settled = false;
    function finish(value) {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKeyDown, true);
      backdrop.remove();
      resolve(value);
    }
    function onKeyDown(e) {
      if (e.key === 'Escape') { e.preventDefault(); finish(null); }
      else if (e.key === 'Enter') { e.preventDefault(); finish(input.value.trim() || null); }
    }

    panel.querySelector('[data-text-prompt-cancel]').addEventListener('click', () => finish(null));
    panel.querySelector('[data-text-prompt-ok]').addEventListener('click', () => finish(input.value.trim() || null));
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) finish(null); });
    document.addEventListener('keydown', onKeyDown, true);

    backdrop.appendChild(panel);
    document.body.appendChild(backdrop);
    input.focus();
    input.select();
  });
}
