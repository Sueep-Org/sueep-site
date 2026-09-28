import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { periodTotalCents } from "@/lib/erp/recurringContracts";

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

  // Searching bypasses the date range entirely, matching by building name
  // across every period rather than only the ones in the visible window.
  const periods = await prisma.recurringContractPeriod.findMany({
    where: q
      ? { recurringContract: { building: { name: { contains: q, mode: "insensitive" } } } }
      : { periodStart: { gte: start!, lte: end! } },
    include: {
      recurringContract: {
        select: { id: true, building: { select: { id: true, name: true } } },
      },
      charges: { select: { description: true, amountCents: true } },
    },
    orderBy: [{ periodStart: "asc" }],
  });

  type PeriodRow = {
    periodId: string;
    periodStart: string;
    /** Flat amount plus any one-off extras for the month. */
    totalCents: number;
    extras: string[];
    billingStatus: string;
  };

  type BuildingRow = {
    contractId: string;
    buildingId: string;
    buildingName: string;
    periods: PeriodRow[];
  };

  const buildingMap = new Map<string, BuildingRow>();

  for (const period of periods) {
    const { id: contractId, building } = period.recurringContract;

    if (!buildingMap.has(contractId)) {
      buildingMap.set(contractId, { contractId, buildingId: building.id, buildingName: building.name, periods: [] });
    }

    buildingMap.get(contractId)!.periods.push({
      periodId: period.id,
      periodStart: period.periodStart.toISOString(),
      totalCents: periodTotalCents(period),
      extras: period.charges.map((c) => c.description),
      billingStatus: period.billingStatus,
    });
  }

  const rows = Array.from(buildingMap.values());
  return NextResponse.json({ start: startParam ?? "", end: endParam ?? "", rows });
}
