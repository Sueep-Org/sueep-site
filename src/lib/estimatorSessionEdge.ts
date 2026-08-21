/**
 * HS256 JWT verify for Edge middleware for estimator_session.
 * Mirrors the ERP edge verifier (no jose) so middleware can run in Edge.
 */

function base64UrlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function hmacSha256(secret: string, data: string): Promise<ArrayBuffer> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", key, enc.encode(data));
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a[i] ^ b[i];
  return x === 0;
}

export async function verifyEstimatorJwtEdge(token: string, secret: string): Promise<boolean> {
  if (!secret || secret.length < 32) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [h, p, s] = parts;
  const data = `${h}.${p}`;
  let sigBytes: Uint8Array;
  let expected: ArrayBuffer;
  try {
    sigBytes = base64UrlToBytes(s);
    expected = await hmacSha256(secret, data);
  } catch {
    return false;
  }
  if (!timingSafeEqual(sigBytes, new Uint8Array(expected))) return false;

  let payload: { exp?: number };
  try {
    const json = new TextDecoder().decode(base64UrlToBytes(p));
    payload = JSON.parse(json) as { exp?: number };
  } catch {
    return false;
  }
  const exp = payload.exp;
  if (typeof exp !== "number") return false;
  return exp * 1000 > Date.now();
}
