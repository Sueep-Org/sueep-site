import { NextResponse } from "next/server";
import { getErpAuth, canApproveInvoices } from "@/lib/erpAuth";
import { discardQboDraft } from "@/lib/erp/qboInvoiceDrafts";

type Ctx = { params: Promise<{ id: string }> };

/** Discard a QuickBooks draft; picked items go back on Ready to bill. */
export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canApproveInvoices(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const result = await discardQboDraft(id, auth.email);
  return "error" in result ? NextResponse.json(result, { status: 400 }) : NextResponse.json(result);
}
