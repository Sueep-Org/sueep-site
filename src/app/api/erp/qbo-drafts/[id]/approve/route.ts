import { NextResponse } from "next/server";
import { getErpAuth, canApproveInvoices } from "@/lib/erpAuth";
import { approveQboDraft } from "@/lib/erp/qboInvoiceDrafts";

type Ctx = { params: Promise<{ id: string }> };

/** Creates the invoice in QuickBooks (the sandbox on local dev). */
export async function POST(_req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canApproveInvoices(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const result = await approveQboDraft(id, auth.email);
  return "error" in result ? NextResponse.json(result, { status: 400 }) : NextResponse.json(result);
}
