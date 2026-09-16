import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseHubSpotPipelineStageMap } from "@/lib/hubspot/pipelineStages";
import { contractedTurnoverScope, turnoverScopeLabel } from "@/lib/erp/turnoverScope";

const JANITORIAL_SEGMENTS = [
  "JANITORIAL_TURNOVER_REQUESTS",
  "COMMERCIAL_CLEANING",
];

const turnoverRequestSelect = {
  id: true,
  unitNumber: true,
  bedrooms: true,
  bathrooms: true,
  priceCents: true,
  approvedPriceCents: true,
  billingStatus: true,
  building: { select: { id: true, name: true } },
  fullClean: true,
  fullPaint: true,
  touchUpPaint: true,
  carpetCleaning: true,
  ceilingPaint: true,
  materialsAdditional: true,
  compounding: true,
  otherWork: true,
} as const;

type ProjectForUnitRow = {
  id: string;
  jobTitle: string;
  buildingId: string | null;
  billingStatus: string | null;
  contractValueCents: number | null;
  turnoverCompletedAt: Date | null;
  projectEndDate: Date | null;
  updatedAt: Date;
  building: { id: string; name: string } | null;
  turnoverRequest: {
    id: string;
    unitNumber: string | null;
    bedrooms: number | null;
    bathrooms: number | null;
    priceCents: number | null;
    approvedPriceCents: number | null;
    billingStatus: string | null;
    building: { id: string; name: string } | null;
    fullClean: boolean;
    fullPaint: boolean;
    touchUpPaint: number | null;
    carpetCleaning: boolean;
    ceilingPaint: boolean;
    materialsAdditional: boolean;
    compounding: number | null;
    otherWork: boolean;
  } | null;
};

function buildingKeyFor(project: { id: string; buildingId: string | null; building: { id: string; name: string } | null; turnoverRequest: { building: { id: string; name: string } | null } | null; jobTitle: string }) {
  const buildingId = project.building?.id ?? project.turnoverRequest?.building?.id ?? project.buildingId ?? `project:${project.id}`;
  const buildingName = project.building?.name ?? project.turnoverRequest?.building?.name ?? project.jobTitle;
  return { buildingId, buildingName };
}

function buildUnitRow(project: ProjectForUnitRow) {
  const tr = project.turnoverRequest;
  const contractCents = tr?.approvedPriceCents ?? tr?.priceCents ?? project.contractValueCents ?? 0;
  const scope = tr ? contractedTurnoverScope(tr).map(turnoverScopeLabel).join(", ") : "";

  return {
    projectId: project.id,
    turnoverRequestId: tr?.id ?? null,
    jobTitle: project.jobTitle,
    unitNumber: tr?.unitNumber ?? null,
    bedrooms: tr?.bedrooms ?? null,
    bathrooms: tr?.bathrooms ?? null,
    completedAt: (project.turnoverCompletedAt ?? project.projectEndDate ?? project.updatedAt).toISOString(),
    contractCents,
    billingStatus: tr?.billingStatus ?? project.billingStatus ?? "NOT_BILLED",
    scope,
    changeOrders: [] as CORow[],
  };
}

type UnitRow = ReturnType<typeof buildUnitRow>;

type CORow = {
  id: string;
  projectId: string;
  title: string;
  contractValueCents: number;
  billingStatus: string;
  completedAt: string;
};

type BuildingRow = {
  buildingId: string;
  buildingName: string;
  units: UnitRow[];
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const startParam = searchParams.get("start");
  const endParam = searchParams.get("end");
  const q = searchParams.get("q")?.trim() || "";

  if (!q && (!startParam || !endParam)) {
    return NextResponse.json(
      { error: "start and end query params required (YYYY-MM-DD)" },
      { status: 400 },
    );
  }

  let start: Date | null = null;
  let end: Date | null = null;
  if (!q) {
    start = new Date(`${startParam}T00:00:00Z`);
    end = new Date(`${endParam}T23:59:59.999Z`);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
    }
  }

  const cfg = parseHubSpotPipelineStageMap();
  const janitorialPipelineId = cfg?.janitorial.pipelineId ?? null;
  const postConstructionPipelineId = cfg?.postConstruction.pipelineId ?? null;

  const janitorialFilter = [
    ...(janitorialPipelineId ? [{ hubspotPipelineId: janitorialPipelineId }] : []),
    { segment: { in: JANITORIAL_SEGMENTS } },
  ];

  // Shared by both the units query below and the change-orders query further
  // down, so a CO's parent project is recognized as "janitorial" the exact
  // same way its unit is.
  const janitorialProjectFilter = [
    { OR: janitorialFilter },
    // COMMERCIAL_CLEANING is shared between the janitorial pipeline and
    // post-construction cleaning jobs — segment alone can't tell them
    // apart, so explicitly exclude anything actually synced from the
    // post-construction pipeline even if its segment matches. Written as
    // an explicit "null or not-equal" OR rather than `NOT: {
    // hubspotPipelineId: postConstructionPipelineId }` — that block-level
    // NOT compiles to a plain SQL `<>`, which per SQL's null semantics
    // silently drops every row where hubspotPipelineId IS NULL (i.e.
    // every project never synced from HubSpot at all) instead of
    // keeping them. That wiped every manually-created janitorial unit
    // (an entire building's worth, confirmed: Avery Philly Apartments)
    // out of this list regardless of date range.
    ...(postConstructionPipelineId
      ? [{ OR: [{ hubspotPipelineId: null }, { hubspotPipelineId: { not: postConstructionPipelineId } }] }]
      : []),
  ];

  const projects = await prisma.project.findMany({
    where: {
      status: "COMPLETE",
      AND: [
        ...janitorialProjectFilter,
        // Searching bypasses the date range entirely (that's the point of a
        // search), it doesn't bypass "is this actually billing-eligible."
        q
          ? {
              OR: [
                { jobTitle: { contains: q, mode: "insensitive" as const } },
                { building: { name: { contains: q, mode: "insensitive" as const } } },
                { turnoverRequest: { unitNumber: { contains: q, mode: "insensitive" as const } } },
                { turnoverRequest: { building: { name: { contains: q, mode: "insensitive" as const } } } },
              ],
            }
          : {
              // Same three-tier fallback as the displayed/exported date
              // below (turnoverCompletedAt, then projectEndDate, then
              // updatedAt) so this filter and that value can never disagree
              // about which day a unit counts as completed on.
              OR: [
                { turnoverCompletedAt: { gte: start!, lte: end! } },
                { turnoverCompletedAt: null, projectEndDate: { gte: start!, lte: end! } },
                { turnoverCompletedAt: null, projectEndDate: null, updatedAt: { gte: start!, lte: end! } },
              ],
            },
      ],
    },
    include: {
      building: { select: { id: true, name: true } },
      turnoverRequest: { select: turnoverRequestSelect },
    },
    orderBy: [{ buildingId: "asc" }, { jobTitle: "asc" }],
  });

  const buildingMap = new Map<string, BuildingRow>();
  const unitByProjectId = new Map<string, UnitRow>();

  for (const project of projects) {
    const { buildingId, buildingName } = buildingKeyFor(project);
    if (!buildingMap.has(buildingId)) {
      buildingMap.set(buildingId, { buildingId, buildingName, units: [] });
    }
    const unit = buildUnitRow(project);
    buildingMap.get(buildingId)!.units.push(unit);
    unitByProjectId.set(project.id, unit);
  }

  // Change orders don't carry their own Project.status, so unlike the units
  // above they're filtered on the CO's own billing-relevant status instead —
  // same status set and date fallback (completedAt, else updatedAt) as the
  // post-construction billing route uses for its COs. Each CO nests under
  // the unit (project) it belongs to; if that unit's own date/status fell
  // outside the query above (e.g. the CO finished later than the unit
  // itself), a unit row is synthesized here from the same project data so
  // the CO still has somewhere to attach.
  const changeOrders = await prisma.projectChangeOrder.findMany({
    where: {
      status: { in: ["BILLING", "COMPLETED"] },
      project: { AND: janitorialProjectFilter },
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" as const } },
              { project: { jobTitle: { contains: q, mode: "insensitive" as const } } },
              { project: { building: { name: { contains: q, mode: "insensitive" as const } } } },
            ],
          }
        : {
            OR: [
              { completedAt: { gte: start!, lte: end! } },
              { completedAt: null, updatedAt: { gte: start!, lte: end! } },
            ],
          }),
    },
    select: {
      id: true,
      title: true,
      contractValueCents: true,
      billingStatus: true,
      completedAt: true,
      updatedAt: true,
      projectId: true,
      project: {
        select: {
          id: true,
          jobTitle: true,
          buildingId: true,
          billingStatus: true,
          contractValueCents: true,
          turnoverCompletedAt: true,
          projectEndDate: true,
          updatedAt: true,
          building: { select: { id: true, name: true } },
          turnoverRequest: { select: turnoverRequestSelect },
        },
      },
    },
    orderBy: { completedAt: "asc" },
  });

  for (const co of changeOrders) {
    let unit = unitByProjectId.get(co.projectId);
    if (!unit) {
      const { buildingId, buildingName } = buildingKeyFor(co.project);
      if (!buildingMap.has(buildingId)) {
        buildingMap.set(buildingId, { buildingId, buildingName, units: [] });
      }
      unit = buildUnitRow(co.project);
      buildingMap.get(buildingId)!.units.push(unit);
      unitByProjectId.set(co.projectId, unit);
    }

    unit.changeOrders.push({
      id: co.id,
      projectId: co.projectId,
      title: co.title,
      contractValueCents: co.contractValueCents ?? 0,
      billingStatus: co.billingStatus ?? "NOT_BILLED",
      completedAt: (co.completedAt ?? co.updatedAt).toISOString(),
    });
  }

  const rows = Array.from(buildingMap.values());
  return NextResponse.json({ start: startParam ?? "", end: endParam ?? "", rows });
}
