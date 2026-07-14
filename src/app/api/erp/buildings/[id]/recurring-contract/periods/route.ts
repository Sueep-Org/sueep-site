import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canSeeFinancials } from "@/lib/erpAuth";
import { computeProjectMargins } from "@/lib/erp/projectMargin";

type Ctx = { params: Promise<{ id: string }> };

const projectSelect = {
  id: true,
  turnoverRequestId: true,
  contractValueCents: true,
  actualLaborCents: true,
  actualMaterialCents: true,
  laborEntries: {
    select: { id: true, employeeId: true, workDate: true, createdAt: true, hours: true, hourlyRateCents: true },
  },
  materialEntries: { select: { costCents: true } },
  contractorAssignments: { select: { costCents: true } },
} as const;

export async function GET(_req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canSeeFinancials(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;

  const contract = await prisma.recurringContract.findUnique({ where: { buildingId: id }, select: { id: true } });
  if (!contract) return NextResponse.json({ error: "No recurring contract for this building" }, { status: 404 });

  const periods = await prisma.recurringContractPeriod.findMany({
    where: { recurringContractId: contract.id },
    orderBy: { periodStart: "desc" },
    include: { projects: { select: projectSelect } },
  });

  const rows = await Promise.all(
    periods.map(async (period) => {
      const billingProject = period.projects.find((p) => p.id === period.billingProjectId);
      const unitProjects = period.projects.filter((p) => p.turnoverRequestId != null);

      const margins = await computeProjectMargins(unitProjects);
      let costCents = 0;
      for (const m of margins.values()) costCents += m.actualLaborCents + m.actualMaterialCents;

      const revenueCents = billingProject?.contractValueCents ?? 0;

      return {
        id: period.id,
        periodStart: period.periodStart.toISOString(),
        unitCount: unitProjects.length,
        revenueCents,
        costCents,
        marginCents: revenueCents - costCents,
      };
    })
  );

  return NextResponse.json(rows);
}
