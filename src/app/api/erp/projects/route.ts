import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeProjectSegment, PROJECT_SEGMENTS } from "@/lib/erp/projectSegments";
import { parseHubSpotPipelineStageMap } from "@/lib/hubspot/pipelineStages";
import { createProjectFromPayload } from "@/lib/erp/createProject";
import { notifyJanitorialTurnoverCreated } from "@/lib/erp/notifyJanitorialTurnover";
import { getErpAuth } from "@/lib/erpAuth";

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

  const auth = await getErpAuth();
  const creator = auth?.email
    ? await prisma.employee.findFirst({ where: { email: { equals: auth.email, mode: "insensitive" } }, select: { id: true } })
    : null;

  // A supervisor may only add a janitorial unit to a building that already
  // exists, specifying scope of work — never any other project type, and
  // never anything that touches the building's own record or its pricing.
  // Stripped rather than rejected outright so a form that simply omits these
  // fields (as the supervisor-facing Add Unit form does) still works; this is
  // defense in depth against a tampered request, not the primary UI gate.
  if (auth?.role === "SUPERVISOR") {
    const segment = normalizeProjectSegment(String(body.segment || ""));
    if (segment !== "JANITORIAL_TURNOVER_REQUESTS") {
      return NextResponse.json({ error: "Not authorized to create this project type" }, { status: 403 });
    }
    if (typeof body.buildingId !== "string" || !body.buildingId.trim()) {
      return NextResponse.json({ error: "buildingId is required" }, { status: 400 });
    }
    delete body.pricing;
    delete body.buildingName;
    delete body.buildingAddress;
    delete body.buildingHubspotDealId;
    delete body.pmName;
    delete body.pmEmail;
    delete body.pmPhone;
    if (Array.isArray(body.unitScopes)) {
      body.unitScopes = body.unitScopes.map((unit) => {
        if (!unit || typeof unit !== "object") return unit;
        const rest = { ...(unit as Record<string, unknown>) };
        delete rest.otherPrice;
        delete rest.recurringContractUnit;
        return rest;
      });
    }

    // Notification recipients aren't a supervisor's call to make — force the
    // same people a PM's "notify" picker defaults to (Sergio, Nick, David),
    // regardless of what (if anything) the request supplied. This overrides
    // rather than merely defaults, so it can't be widened or narrowed by a
    // tampered request either.
    const alwaysNotify = await prisma.employee.findMany({
      where: {
        OR: [
          { firstName: { equals: "Sergio", mode: "insensitive" } },
          { firstName: { equals: "Nick", mode: "insensitive" } },
          { firstName: { equals: "David", mode: "insensitive" }, lastName: { equals: "Rodriguez", mode: "insensitive" } },
        ],
      },
      select: { id: true },
    });
    body.notifyEmployeeIds = alwaysNotify.map((e) => e.id);
  }

  // Read after the supervisor block above, which may have just overwritten
  // this — reading it earlier would silently keep whatever the client sent.
  const notifyEmployeeIds = Array.isArray(body.notifyEmployeeIds) ? (body.notifyEmployeeIds as string[]) : [];

  try {
    const result = await createProjectFromPayload(body, { createdByEmployeeId: creator?.id ?? null });
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    if ("turnoverRequests" in result && result.turnoverRequests && result.building) {
      await notifyJanitorialTurnoverCreated({
        body,
        building: result.building,
        requests: result.turnoverRequests,
        notifyEmployeeIds,
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
