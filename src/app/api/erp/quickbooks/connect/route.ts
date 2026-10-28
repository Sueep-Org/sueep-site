import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { getErpAuth, canConnectQuickBooks } from "@/lib/erpAuth";
import { QBO_STATE_COOKIE, qboAuthorizeUrl } from "@/lib/erp/qboClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Starts "Connect QuickBooks": sends an Admin to Intuit's sign-in with a one-time state (checked on the way back). */
export async function GET(req: Request) {
  const auth = await getErpAuth();
  if (!auth || !canConnectQuickBooks(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const state = randomBytes(24).toString("base64url");
  let url: string;
  try {
    url = await qboAuthorizeUrl(state);
  } catch (e) {
    const back = new URL("/erp/quickbooks", req.url);
    back.searchParams.set("qbo", "error");
    back.searchParams.set("detail", e instanceof Error ? e.message.slice(0, 200) : "Couldn't start the connection");
    return NextResponse.redirect(back);
  }
  const res = NextResponse.redirect(url);
  res.cookies.set(QBO_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/erp/quickbooks",
    maxAge: 600,
  });
  return res;
}
