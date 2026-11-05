import { NextResponse } from "next/server";
import { getErpAuth, canApproveInvoices } from "@/lib/erpAuth";
import { addFollowUp } from "@/lib/erp/invoiceFollowUps";

/** Log a follow-up on an unpaid invoice: how, who, what they said, promised date. */
export async function POST(req: Request) {
  const auth = await getErpAuth();
  if (!auth || !canApproveInvoices(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const res = await addFollowUp(
    { invoiceNumber: body.invoiceNumber, method: body.method, contactName: body.contactName, note: body.note, promisedDate: body.promisedDate },
    auth.email,
  );
  if ("error" in res) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
