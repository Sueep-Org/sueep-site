import { NextResponse } from "next/server";
import { getErpAuth, canApproveInvoices } from "@/lib/erpAuth";
import { resubmitDelivery } from "@/lib/erp/invoiceDelivery";
import { readDeliveryProofForm } from "@/lib/erp/deliveryProofForm";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Uploaded again after the client sent it back, with the new portal number or proof. */
export async function POST(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canApproveInvoices(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const form = await readDeliveryProofForm(req);
  if ("error" in form) return NextResponse.json({ error: form.error }, { status: form.status });
  const res = await resubmitDelivery(id, auth.email, form.details);
  if ("error" in res) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
