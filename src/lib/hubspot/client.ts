/**
 * Outbound HubSpot API calls (CRM). Uses private app access token.
 * @see https://developers.hubspot.com/docs/api/overview
 */
export function hubspotApiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `https://api.hubapi.com${p}`;
}

// HubSpot caps private apps per rolling 10 seconds and answers 429 past
// that. Waiting and retrying lets bursts (billing page, crons) finish
// instead of failing. Worst case is about 15s of waiting per call.
const MAX_RATE_LIMIT_RETRIES = 4;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function rateLimitDelayMs(res: Response, attempt: number): number {
  const retryAfter = Number(res.headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter * 1000;
  // 1s, 2s, 4s, 8s plus jitter so parallel callers don't retry in lockstep.
  return 1000 * 2 ** attempt + Math.random() * 500;
}

export async function hubspotFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) {
    throw new Error("HUBSPOT_ACCESS_TOKEN is not set");
  }
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("content-type") && init?.body) {
    headers.set("content-type", "application/json");
  }
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(hubspotApiUrl(path), { ...init, headers });
    if (res.status !== 429 || attempt >= MAX_RATE_LIMIT_RETRIES) return res;
    await res.body?.cancel();
    await sleep(rateLimitDelayMs(res, attempt));
  }
}
