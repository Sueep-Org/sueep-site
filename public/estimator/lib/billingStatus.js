// Cached read of the current company's plan, used purely for UI state
// (locking the beta button, showing its tooltip correctly) before a click
// even happens. Not the actual gate: the proxy's 402 on /figures is (see
// src/app/api/estimator/proxy/[...path]/route.ts), this can be stale or
// wrong and the worst case is a confusing button state, never a bypass.
let cached = null;

export async function isProCompany() {
  if (cached !== null) return cached;
  try {
    const res = await fetch('/api/estimator/billing/status', { cache: 'no-store' });
    if (!res.ok) { cached = false; return cached; }
    const data = await res.json();
    cached = !!data.isPaid;
  } catch {
    cached = false;
  }
  return cached;
}
