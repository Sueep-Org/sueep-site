import { NextResponse } from "next/server";
import { hubspotFetch } from "@/lib/hubspot/client";

export const runtime = "nodejs";

/**
 * ERP-authenticated helper: returns HubSpot deal pipelines + stage ids (labels only).
 * Use while logged in: GET /api/erp/hubspot/pipelines
 * Lets you build HUBSPOT_PIPELINE_STAGE_MAP without running a local script.
 */
export async function GET() {
  try {
    const res = await hubspotFetch("/crm/v3/pipelines/deals");
    const text = await res.text();
    if (!res.ok) {
      return NextResponse.json(
        { error: `HubSpot ${res.status}`, detail: text.slice(0, 500) },
        { status: 502 },
      );
    }
    const data = JSON.parse(text) as {
      results?: Array<{
        id: string;
        label: string;
        stages?: Array<{ id: string; label: string; displayOrder?: number }>;
      }>;
    };

    const pipelines = (data.results ?? []).map((p) => ({
      pipelineId: p.id,
      label: p.label,
      stages: (p.stages ?? []).map((s) => ({
        stageId: s.id,
        label: s.label,
        displayOrder: s.displayOrder,
      })),
    }));

    return NextResponse.json({
      message: "Match pipelineId + stageIds to HUBSPOT_PIPELINE_STAGE_MAP (see .env.example).",
      pipelines,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}