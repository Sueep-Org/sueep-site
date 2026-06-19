import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeProjectSegment, PROJECT_SEGMENTS } from "@/lib/erp/projectSegments";
import { parseHubSpotPipelineStageMap } from "@/lib/hubspot/pipelineStages";
import { createProjectFromPayload } from "@/lib/erp/createProject";
import { notifyJanitorialTurnoverCreated } from "@/lib/erp/notifyJanitorialTurnover";

const STATUSES = ["ACTIVE", "ON_HOLD", "COMPLETE", "ARCHIVED"] as const;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const segment = searchParams.get("segment");
  const status = searchParams.get("status");
  const category = searchParams.get("category");
  const cfg = parseHubSpotPipelineStageMap();
  const normalizedSegment = segment ? normalizeProjectSegment(segment) : null;
  const janitorialSegments = cfg?.janitorial.pipelineId
    ? ["JANITORIAL_TURNOVER_REQUESTS"]
    : ["JANITORIAL_TURNOVER_REQUESTS", "COMMERCIAL_CLEANING"];
  const isJanitorialCategory = category === "active-janitorial" || category === "schedule-janitorial";

  const projects = await prisma.project.findMany({
    where: {
      ...(isJanitorialCategory
        ? {
            ...(category === "active-janitorial"
              ? { status: "ACTIVE" }
              : { status: { notIn: ["COMPLETE", "ARCHIVED"] } }),
            // Exclude individual unit projects — they have a turnoverRequestId linking them to a specific unit
            ...(category === "schedule-janitorial" ? { turnoverRequestId: null } : {}),
            OR: [
              { segment: { in: janitorialSegments } },
              ...(cfg?.janitorial.pipelineId ? [{ hubspotPipelineId: cfg.janitorial.pipelineId }] : []),
            ],
          }
        : {}),
      ...(normalizedSegment && PROJECT_SEGMENTS.includes(normalizedSegment) ? { segment: normalizedSegment } : {}),
      ...(status && STATUSES.includes(status as (typeof STATUSES)[number]) ? { status } : {}),
    },
    orderBy: [{ projectDate: "desc" }, { updatedAt: "desc" }],
    include: {
      _count: { select: { laborEntries: true } },
    },
  });

  return NextResponse.json(projects);
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const result = await createProjectFromPayload(body);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    if ("turnoverRequests" in result && result.turnoverRequests && result.building) {
      await notifyJanitorialTurnoverCreated({
        body,
        building: result.building,
        requests: result.turnoverRequests,
      });
      const projectIds = result.projects.map((p) => p.id);
      return NextResponse.json({
        ok: true,
        projectId: projectIds[0] ?? null,
        projectIds,
        buildingId: result.building.id,
        ids: result.turnoverRequests.map((request) => request.id),
      });
    }
    return NextResponse.json(result.project);
  } catch (e) {
    console.error("POST /api/erp/projects", e);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}
