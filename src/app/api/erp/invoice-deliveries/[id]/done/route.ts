import { NextResponse } from "next/server";
import { getErpAuth, canApproveInvoices } from "@/lib/erpAuth";
import { markDeliveryDone } from "@/lib/erp/invoiceDelivery";

type Ctx = { params: Promise<{ id: string }> };

/** Uploaded to the client's portal, or sent by hand: records who and when. */
export async function POST(_req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canApproveInvoices(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  if (!(await markDeliveryDone(id, auth.email))) return NextResponse.json({ error: "This one isn't waiting anymore." }, { status: 400 });
  return NextResponse.json({ ok: true });
}
