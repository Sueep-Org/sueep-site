import { NextResponse } from "next/server";
import { getErpAuth, canViewPipelineBoard } from "@/lib/erpAuth";
import { createRebid } from "@/lib/erp/dealRebids";
import { dealUrl, loadDealBundle } from "@/lib/erp/postConDeals";

type Ctx = { params: Promise<{ dealId: string }> };

/** Re-bid a GC Not Awarded loss with the winning GC: creates a new HubSpot deal in Lead. */
export async function POST(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canViewPipelineBoard(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { dealId } = await ctx.params;
  if (!/^\d+$/.test(dealId)) return NextResponse.json({ error: "Unknown deal." }, { status: 400 });
  const body = (await req.json().catch(() => null)) as { ownerId?: unknown; dealName?: unknown } | null;
  const result = await createRebid({
    fromDealId: dealId,
    ownerId: typeof body?.ownerId === "string" && body.ownerId ? body.ownerId : null,
    dealName: typeof body?.dealName === "string" ? body.dealName : "",
    byEmail: auth.email,
  });
  if ("error" in result) return NextResponse.json(result, { status: 400 });
  const hubId = (await loadDealBundle().catch(() => null))?.hubId ?? null;
  return NextResponse.json({ ...result, url: dealUrl(hubId, result.newDealId) });
}
