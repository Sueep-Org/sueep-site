// Paywall modal, fires when the proxy blocks a request with 402 (see
// src/app/api/estimator/proxy/[...path]/route.ts). Same backdrop/panel
// recipe as confirmDialog.js/textPrompt.js (window.confirm/alert throw
// "not supported" in this Next.js-hosted environment), styled with the
// app's own green accent instead of confirmDialog's neutral buttons since
// this is a sell, not a yes/no question.
//
// Not the actual gate, the proxy already refused the request before this
// ever shows. This is just turning that 402 into something a person can
// act on instead of a raw JSON error nobody sees.

const REASON_COPY = {
  FREE_TRIAL_EXHAUSTED: {
    title: "You've used your free upload",
    message: 'Free accounts get 1 free upload to try the estimator. Upgrade to Pro to keep working on new files, unlimited uploads up to 150 pages each.',
  },
  BETA_LOCKED: {
    title: 'That’s a Pro feature',
    message: 'Beta features like wall detection and extracted measurements are part of Pro. Upgrade to unlock them.',
  },
};

/** Shows the paywall modal for a given 402 `code` (from the proxy's error
 * body). Falls back to a generic message for an unrecognized code so a
 * future gated route without matching copy here still shows *something*
 * sensible instead of silently doing nothing. */
export function showPaywallModal(code) {
  const copy = REASON_COPY[code] || {
    title: 'Upgrade to Pro',
    message: 'This requires a Pro subscription.',
  };

  const backdrop = document.createElement('div');
  backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.55);display:flex;align-items:center;justify-content:center;padding:20px;z-index:10001;';

  const panel = document.createElement('div');
  panel.style.cssText = 'width:min(400px, 100%);background:white;border-radius:16px;box-shadow:0 24px 60px rgba(15,23,42,.25);padding:28px;text-align:center;';

  panel.innerHTML = `
    <div style="width:48px;height:48px;border-radius:999px;margin:0 auto 14px;background:#fffbeb;border:1px solid #fde68a;display:flex;align-items:center;justify-content:center;color:#d97706;">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
    </div>
    <div style="font-size:16px;font-weight:700;color:#0f172a;">${copy.title}</div>
    <div style="font-size:13px;color:#64748b;line-height:1.55;margin:8px 0 20px;">${copy.message}</div>
    <button data-paywall-upgrade type="button" style="width:100%;border:none;border-radius:10px;padding:11px;font-size:14px;font-weight:600;background:#16a34a;color:white;cursor:pointer;">Upgrade to Pro</button>
    <button data-paywall-dismiss type="button" style="width:100%;border:none;background:transparent;color:#94a3b8;font-size:13px;margin-top:10px;cursor:pointer;">Not now</button>
  `;

  function close() {
    document.removeEventListener('keydown', onKeyDown, true);
    backdrop.remove();
  }
  function onKeyDown(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
  }

  panel.querySelector('[data-paywall-dismiss]').addEventListener('click', close);
  panel.querySelector('[data-paywall-upgrade]').addEventListener('click', () => {
    window.location.href = `/estimator/upgrade?reason=${encodeURIComponent(code || '')}`;
  });
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  document.addEventListener('keydown', onKeyDown, true);

  backdrop.appendChild(panel);
  document.body.appendChild(backdrop);
}

/** Checks a fetch Response for the paywall's 402 shape; if it matches,
 * shows the modal and returns true (caller should stop, the request was
 * refused). Returns false for everything else so normal error handling
 * continues untouched. Doesn't consume/clone the body unless it's
 * actually a 402 with our JSON shape. */
export async function handlePaywallResponse(res) {
  if (res.status !== 402) return false;
  let body = null;
  try {
    body = await res.clone().json();
  } catch {
    // not our JSON shape, fall through, let the caller's own error
    // handling deal with it
  }
  if (!body || !body.code) return false;
  showPaywallModal(body.code);
  return true;
}
