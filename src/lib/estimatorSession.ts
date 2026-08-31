import { jwtVerify, SignJWT } from "jose";

export const estimatorSessionCookieName = "estimator_session";

function getSecret() {
  const secret = process.env.ESTIMATOR_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("ESTIMATOR_SESSION_SECRET must be set (min 32 characters)");
  }
  return new TextEncoder().encode(secret);
}

export async function createEstimatorSessionToken(userId: string, firebaseUid: string, companyId: string | null) {
  return new SignJWT({ scope: "estimator", userId, firebaseUid, companyId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

export async function verifyEstimatorSessionToken(token: string) {
  const { payload } = await jwtVerify(token, getSecret());
  if (payload.scope !== "estimator" || typeof payload.userId !== "string" || typeof payload.firebaseUid !== "string") {
    throw new Error("Invalid estimator session");
  }
  // companyId is a later addition (Phase 2 of ESTIMATOR_STORAGE_FIX_PLAN.md)
  // — tokens minted before that point won't have it. Treat that as "unknown
  // for now" rather than rejecting the whole session; it self-heals on the
  // next login, when the token is re-minted from the DB row.
  const companyId = typeof payload.companyId === "string" ? payload.companyId : null;
  return { userId: payload.userId, firebaseUid: payload.firebaseUid, companyId };
}

export function estimatorSessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true as const,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}