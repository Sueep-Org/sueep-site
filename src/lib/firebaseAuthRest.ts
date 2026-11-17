import { randomBytes } from "crypto";

/**
 * Server-side Firebase Auth calls over the Identity Toolkit REST API, using the
 * same web API key the login route already verifies tokens with (no service
 * account needed).
 */

const BASE = "https://identitytoolkit.googleapis.com/v1";

async function call<T>(method: string, body: Record<string, unknown>): Promise<{ ok: true; data: T } | { ok: false; code: string }> {
  const key = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!key) return { ok: false, code: "NO_API_KEY" };
  try {
    const res = await fetch(`${BASE}/${method}?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
    if (!res.ok) return { ok: false, code: data.error?.message ?? `HTTP_${res.status}` };
    return { ok: true, data };
  } catch {
    return { ok: false, code: "NETWORK_ERROR" };
  }
}

/** Creates an email/password account with a random password nobody knows.
 * The person sets their own through the password email. */
export async function createFirebaseEmailUser(email: string) {
  const password = randomBytes(24).toString("base64url");
  const r = await call<{ localId: string }>("accounts:signUp", { email, password, returnSecureToken: false });
  return r.ok ? ({ ok: true, uid: r.data.localId } as const) : ({ ok: false, code: r.code } as const);
}

/** Firebase's own "reset your password" email, which also works to set a first password. */
export async function sendFirebasePasswordEmail(email: string) {
  const r = await call("accounts:sendOobCode", { requestType: "PASSWORD_RESET", email });
  return r.ok ? ({ ok: true } as const) : ({ ok: false, code: r.code } as const);
}

/** Placeholder uid for an ERP user whose Firebase account existed before they
 * were added here (we can't look up its uid without admin credentials). The
 * login route swaps in the real uid on their first sign-in, matched by email. */
export function pendingFirebaseUid(email: string) {
  return `pending:${email}`;
}
