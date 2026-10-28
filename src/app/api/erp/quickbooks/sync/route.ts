import { NextResponse } from "next/server";
import { getErpAuth, canManageQuickBooks } from "@/lib/erpAuth";
import { QboReconnectError } from "@/lib/erp/qboClient";
import { qboSync } from "@/lib/erp/qboSync";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Sync now: reads the P&L and A/R Aging from QuickBooks (saves only on a production connection). */
export async function POST() {
  const auth = await getErpAuth();
  if (!auth || !canManageQuickBooks(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    return NextResponse.json(await qboSync({ by: auth.email ?? null }));
  } catch (e) {
    const reconnect = e instanceof QboReconnectError;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Sync failed", reconnect }, { status: reconnect ? 401 : 502 });
  }
}
