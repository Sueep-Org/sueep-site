import { NextResponse } from "next/server";
import { getErpAuth, canConnectQuickBooks } from "@/lib/erpAuth";
import { qboDisconnect } from "@/lib/erp/qboClient";

export const runtime = "nodejs";

/** Disconnects the ERP from QuickBooks. Uploaded and synced reports stay. */
export async function POST() {
  const auth = await getErpAuth();
  if (!auth || !canConnectQuickBooks(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await qboDisconnect();
  return NextResponse.json({ ok: true });
}
