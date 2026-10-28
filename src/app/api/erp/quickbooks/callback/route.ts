import { timingSafeEqual } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getErpAuth, canConnectQuickBooks } from "@/lib/erpAuth";
import { QBO_STATE_COOKIE, qboCompleteConnect } from "@/lib/erp/qboClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sameState(a: string | undefined, b: string | null): boolean {
  if (!a || !b || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** Where Intuit sends the Admin back after approving (or declining) the connection. */
export async function GET(req: NextRequest) {
  const back = new URL("/erp/quickbooks", req.url);
  const done = (result: string, detail?: string) => {
    back.searchParams.set("qbo", result);
    if (detail) back.searchParams.set("detail", detail.slice(0, 200));
    const res = NextResponse.redirect(back);
    res.cookies.set(QBO_STATE_COOKIE, "", { path: "/api/erp/quickbooks", maxAge: 0 });
    return res;
  };

  const auth = await getErpAuth();
  if (!auth || !canConnectQuickBooks(auth.role)) return done("forbidden");
  const params = req.nextUrl.searchParams;
  // CSRF: the state must be the one this browser was given when it started connecting.
  if (!sameState(req.cookies.get(QBO_STATE_COOKIE)?.value, params.get("state"))) return done("expired");
  if (params.get("error")) return done("declined");
  const code = params.get("code");
  const realmId = params.get("realmId");
  if (!code || !realmId) return done("error", "QuickBooks didn't send back a company.");
  try {
    await qboCompleteConnect(code, realmId, auth.email ?? null);
    return done("connected");
  } catch (e) {
    return done("error", e instanceof Error ? e.message : "Couldn't finish connecting");
  }
}
