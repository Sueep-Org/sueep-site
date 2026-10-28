import { NextResponse } from "next/server";
import { isQboConfigured, loadQboConnection } from "@/lib/erp/qboClient";
import { qboSync } from "@/lib/erp/qboSync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Nightly (see vercel.json): reads QuickBooks' P&L and A/R Aging into the
 * ERP. Does nothing when QuickBooks isn't set up or connected; a connection
 * that needs reconnecting is marked by the client and shows as a banner.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isQboConfigured() || !(await loadQboConnection())) return NextResponse.json({ skipped: "QuickBooks isn't connected" });
  try {
    return NextResponse.json(await qboSync({ by: "nightly sync" }));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
