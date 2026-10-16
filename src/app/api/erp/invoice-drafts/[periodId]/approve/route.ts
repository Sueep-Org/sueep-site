import { NextResponse } from "next/server";
import { getErpAuth, canApproveInvoices } from "@/lib/erpAuth";
import { approveDraft } from "@/lib/erp/janitorialInvoiceDrafts";

type Ctx = { params: Promise<{ periodId: string }> };

/** Opens the draft in HubSpot, which sends it to QuickBooks, and marks the month Billed. */
export async function POST(_req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canApproveInvoices(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { periodId } = await ctx.params;
  const result = await approveDraft(periodId, auth.email);
  return "error" in result ? NextResponse.json(result, { status: 400 }) : NextResponse.json(result);
}
