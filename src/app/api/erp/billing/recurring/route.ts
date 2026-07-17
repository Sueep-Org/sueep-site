import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

  const periods = await prisma.recurringContractPeriod.findMany({
    where: { periodStart: { gte: start, lte: end } },
    include: {
      recurringContract: {
        select: { building: { select: { id: true, name: true } } },
      },
      projects: { select: { id: true, contractValueCents: true, billingStatus: true } },
    },
    orderBy: [{ periodStart: "asc" }],
  });

  type PeriodRow = {
    periodId: string;
    projectId: string;
    periodStart: string;
    monthlyRateCents: number;
    billingStatus: string;
  };

  type BuildingRow = {
    buildingId: string;
    buildingName: string;
    periods: PeriodRow[];
  };

  const buildingMap = new Map<string, BuildingRow>();

  for (const period of periods) {
    const billingProject = period.projects.find((p) => p.id === period.billingProjectId);
    if (!billingProject) continue;

    const buildingId = period.recurringContract.building.id;
    const buildingName = period.recurringContract.building.name;

    if (!buildingMap.has(buildingId)) {
      buildingMap.set(buildingId, { buildingId, buildingName, periods: [] });
    }

    buildingMap.get(buildingId)!.periods.push({
      periodId: period.id,
      projectId: billingProject.id,
      periodStart: period.periodStart.toISOString(),
      monthlyRateCents: billingProject.contractValueCents ?? 0,
      billingStatus: billingProject.billingStatus ?? "NOT_BILLED",
    });
  }

  const rows = Array.from(buildingMap.values());
  return NextResponse.json({ start: startParam, end: endParam, rows });
}
