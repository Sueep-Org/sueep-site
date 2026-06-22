import { SignJWT } from "jose";

const COOKIE = "erp_session";

export const ERP_ROLES = ["ADMIN", "PROJECT_MANAGER", "FINANCE", "SUPERVISOR", "ESTIMATION", "EMPLOYEE"] as const;
export type ErpRole = (typeof ERP_ROLES)[number];

export type ErpSessionPayload = { uid: string; email: string; role: ErpRole };

function getSecret() {
  const s = process.env.ERP_SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error("ERP_SESSION_SECRET must be set (min 16 characters)");
  }
  return new TextEncoder().encode(s);
}

export async function createErpSessionToken(payload: ErpSessionPayload): Promise<string> {
  return new SignJWT({ scope: "erp", ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

export const erpSessionCookieName = COOKIE;

export function erpSessionCookieOptions(maxAgeSec: number) {
  return {
    httpOnly: true as const,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSec,
  };
}
