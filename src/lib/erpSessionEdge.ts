/**
 * HS256 JWT verify for Edge middleware (no jose — avoids CompressionStream in Edge).
 * Tokens are created by the same secret in `erpSession.ts` using jose (Node route handlers).
 */

import type { ErpRole, ErpSessionPayload } from "./erpSession";

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
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  return crypto.subtle.sign("HMAC", key, enc.encode(data));
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a[i] ^ b[i];
  return x === 0;
}

const VALID_ROLES = ["ADMIN", "PROJECT_MANAGER", "SUPERVISOR", "ESTIMATION", "EMPLOYEE"] as const;

export async function verifyErpJwtEdge(token: string, secret: string): Promise<ErpSessionPayload | null> {
  if (!secret || secret.length < 16) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const data = `${h}.${p}`;
  let sigBytes: Uint8Array;
  let expected: ArrayBuffer;
  try {
    sigBytes = base64UrlToBytes(s);
    expected = await hmacSha256(secret, data);
  } catch {
    return null;
  }
  if (!timingSafeEqual(sigBytes, new Uint8Array(expected))) return null;

  let payload: { exp?: number; uid?: string; email?: string; role?: string };
  try {
    const json = new TextDecoder().decode(base64UrlToBytes(p));
    payload = JSON.parse(json) as typeof payload;
  } catch {
    return null;
  }
  const exp = payload.exp;
  if (typeof exp !== "number" || exp * 1000 <= Date.now()) return null;

  // Tokens issued before roles were added: force re-login
  if (!payload.uid || !payload.email || !payload.role) return null;
  if (!(VALID_ROLES as readonly string[]).includes(payload.role)) return null;

  return {
    uid: payload.uid,
    email: payload.email,
    role: payload.role as ErpRole,
  };
}
