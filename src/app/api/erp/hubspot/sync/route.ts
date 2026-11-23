import { NextResponse } from "next/server";
import { syncHubSpotDealsToProjects } from "@/lib/hubspot/syncDealsToProjects";
import { searchDealsInConfiguredStages } from "@/lib/hubspot/dealSearch";
import { classifyHubSpotDealStage } from "@/lib/hubspot/pipelineStages";
import { getErpAuth } from "@/lib/erpAuth";
import { isPmLevel } from "@/lib/erpRoles";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST — sync HubSpot deals (configured stages) → ERP projects (schedule / Gantt).
 * PM, Business Manager and Admin only.
 * GET — preview only (no DB writes): { deals: [...] } with classification.
 */
export async function POST() {
  const auth = await getErpAuth();
  if (!auth || !isPmLevel(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const result = await syncHubSpotDealsToProjects();
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET() {
  const auth = await getErpAuth();
  if (!auth || !isPmLevel(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const deals = await searchDealsInConfiguredStages(100);
    const preview = deals.map((d) => {
      const pipeline = d.properties.pipeline ?? null;
      const dealstage = d.properties.dealstage ?? null;
      const classified = classifyHubSpotDealStage(
        pipeline != null ? String(pipeline) : null,
        dealstage != null ? String(dealstage) : null,
      );
      return {
        id: d.id,
        dealname: d.properties.dealname,
        pipeline,
        dealstage,
        classified,
      };
    });
    return NextResponse.json({ count: preview.length, deals: preview });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
