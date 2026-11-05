import { NextResponse } from "next/server";
import { getErpAuth, canApproveInvoices } from "@/lib/erpAuth";
import { deleteShortPay, saveShortPay } from "@/lib/erp/invoiceShortPays";

/** Save why an invoice was paid short: reason, amount, note. Replaces the one already saved. */
export async function PUT(req: Request) {
  const auth = await getErpAuth();
  if (!auth || !canApproveInvoices(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const res = await saveShortPay({ invoiceNumber: body.invoiceNumber, reason: body.reason, amountCents: body.amountCents, note: body.note }, auth.email);
  if ("error" in res) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const auth = await getErpAuth();
  if (!auth || !canApproveInvoices(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await deleteShortPay(new URL(req.url).searchParams.get("invoiceNumber"));
  return NextResponse.json({ ok: true });
}
