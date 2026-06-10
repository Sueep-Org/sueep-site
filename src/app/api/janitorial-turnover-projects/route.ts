import { NextResponse } from "next/server";
import { parseHubSpotPipelineStageMap } from "@/lib/hubspot/pipelineStages";
import { createProjectFromPayload } from "@/lib/erp/createProject";
import { notifyJanitorialTurnoverCreated } from "@/lib/erp/notifyJanitorialTurnover";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const cfg = parseHubSpotPipelineStageMap();
  const notifyEmployeeIds = Array.isArray(body.notifyEmployeeIds) ? (body.notifyEmployeeIds as string[]) : [];
  
  const payload = {
    ...body,
    segment: "JANITORIAL_TURNOVER_REQUESTS",
    ...(cfg?.janitorial.pipelineId ? { hubspotPipelineId: cfg.janitorial.pipelineId } : {}),
  };

  try {
    const result = await createProjectFromPayload(payload);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    if ("turnoverRequests" in result && result.turnoverRequests && result.building) {
      await notifyJanitorialTurnoverCreated({
        body: payload,
        building: result.building,
        requests: result.turnoverRequests,
        notifyEmployeeIds,
      });
      const projectIds = result.projects.map((p) => p.id);
      return NextResponse.json({
        projectId: projectIds[0] ?? null,
        projectIds,
        buildingId: result.building.id,
        ids: result.turnoverRequests.map((request) => request.id),
      });
    }
    return NextResponse.json({ id: result.project.id });
  } catch (e) {
    console.error("POST /api/janitorial-turnover-projects", e);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}
