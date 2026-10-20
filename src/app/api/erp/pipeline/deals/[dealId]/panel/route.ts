import { NextResponse } from "next/server";
import { getErpAuth, canViewPipelineBoard } from "@/lib/erpAuth";
import { loadDealPanel } from "@/lib/erp/dealPanel";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ dealId: string }> };

/** The deal side panel's HubSpot activity, line items, GC record and ERP history. Read-only. */
export async function GET(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canViewPipelineBoard(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { dealId } = await ctx.params;
  if (!/^\d+$/.test(dealId)) return NextResponse.json({ error: "Unknown deal." }, { status: 400 });
  const pipeline = new URL(req.url).searchParams.get("pipeline") === "janitorial" ? "janitorial" : "post-con";
  try {
    return NextResponse.json(await loadDealPanel(dealId, pipeline));
  } catch (e) {
    return NextResponse.json({ error: `Couldn't read HubSpot: ${e instanceof Error ? e.message : String(e)}` }, { status: 502 });
  }
}
