import { NextResponse } from "next/server";
import { getErpAuth, canApproveInvoices } from "@/lib/erpAuth";
import { draftDueJanitorialInvoices } from "@/lib/erp/janitorialInvoiceDrafts";

/** "Draft now": the same check the daily run does, optionally for one contract. */
export async function POST(req: Request) {
  const auth = await getErpAuth();
  if (!auth || !canApproveInvoices(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { contractId?: unknown };
  const outcomes = await draftDueJanitorialInvoices(typeof body.contractId === "string" ? body.contractId : undefined);
  return NextResponse.json({ outcomes });
}
