import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseHubSpotPipelineStageMap } from "@/lib/hubspot/pipelineStages";

const JANITORIAL_SEGMENTS = [
  "JANITORIAL_TURNOVER_REQUESTS",
  "JANITORIAL_GENERAL_WORK_REQUEST",
  "COMMERCIAL_CLEANING",
];

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const startParam = searchParams.get("start");
  const endParam = searchParams.get("end");

  if (!startParam || !endParam) {
    return NextResponse.json(
      { error: "start and end query params required (YYYY-MM-DD)" },
      { status: 400 },
    );
  }

  const start = new Date(`${startParam}T00:00:00Z`);
  const end = new Date(`${endParam}T23:59:59.999Z`);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
  }

  const cfg = parseHubSpotPipelineStageMap();
  const janitorialPipelineId = cfg?.janitorial.pipelineId ?? null;

  const janitorialFilter = [
    ...(janitorialPipelineId ? [{ hubspotPipelineId: janitorialPipelineId }] : []),
    { segment: { in: JANITORIAL_SEGMENTS } },
    { turnoverRequestId: { not: null } },
  ];

  const projects = await prisma.project.findMany({
    where: {
      status: "COMPLETE",
      AND: [
        { OR: janitorialFilter },
        {
          OR: [
            { projectEndDate: { gte: start, lte: end } },
            { projectEndDate: null, updatedAt: { gte: start, lte: end } },
          ],
        },
      ],
    },
    include: {
      building: { select: { id: true, name: true } },
      turnoverRequest: {
        select: {
          id: true,
          unitNumber: true,
          bedrooms: true,
          bathrooms: true,
          priceCents: true,
          approvedPriceCents: true,
          billingStatus: true,
        },
      },
    },
    orderBy: [{ buildingId: "asc" }, { jobTitle: "asc" }],
  });

  type UnitRow = {
    projectId: string;
    turnoverRequestId: string | null;
    jobTitle: string;
    unitNumber: string | null;
    bedrooms: number | null;
    bathrooms: number | null;
    completedAt: string;
    contractCents: number;
    billingStatus: string;
  };

  type BuildingRow = {
    buildingId: string;
    buildingName: string;
    units: UnitRow[];
  };

  const buildingMap = new Map<string, BuildingRow>();

  for (const project of projects) {
    const buildingId = project.building?.id ?? project.buildingId ?? "unknown";
    const buildingName = project.building?.name ?? "Unknown Building";

    if (!buildingMap.has(buildingId)) {
      buildingMap.set(buildingId, { buildingId, buildingName, units: [] });
    }

    const tr = project.turnoverRequest;
    const contractCents =
      tr?.approvedPriceCents ?? tr?.priceCents ?? project.contractValueCents ?? 0;

    buildingMap.get(buildingId)!.units.push({
      projectId: project.id,
      turnoverRequestId: tr?.id ?? null,
      jobTitle: project.jobTitle,
      unitNumber: tr?.unitNumber ?? null,
      bedrooms: tr?.bedrooms ?? null,
      bathrooms: tr?.bathrooms ?? null,
      completedAt: (project.projectEndDate ?? project.updatedAt).toISOString(),
      contractCents,
      billingStatus: tr?.billingStatus ?? "NOT_BILLED",
    });
  }

  const rows = Array.from(buildingMap.values());
  return NextResponse.json({ start: startParam, end: endParam, rows });
}
