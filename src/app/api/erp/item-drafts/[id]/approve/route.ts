import { NextResponse } from "next/server";
import { getErpAuth, canApproveInvoices } from "@/lib/erpAuth";
import { approveItemDraft } from "@/lib/erp/itemInvoiceDrafts";

type Ctx = { params: Promise<{ id: string }> };

/** Opens the draft in HubSpot (QuickBooks) and marks its items Billed. */
export async function POST(_req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canApproveInvoices(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const result = await approveItemDraft(id, auth.email);
  return "error" in result ? NextResponse.json(result, { status: 400 }) : NextResponse.json(result);
}
