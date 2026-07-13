import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canSeeFinancials } from "@/lib/erpAuth";
import { computeProjectMargins } from "@/lib/erp/projectMargin";
import { computeCommissionCentsByDeal, resolveCommissionEmployeeId } from "@/lib/erp/commission";
import { CommissionByRep, type CommissionDealRow, type RepGroup } from "./CommissionByRep";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ year?: string }> };

export default async function CommissionPage({ searchParams }: PageProps) {
  const auth = await getErpAuth();
  if (!auth || !canSeeFinancials(auth.role)) redirect("/erp");

  const [projects, employees, erpUsers] = await Promise.all([
    prisma.project.findMany({
      // Only fully-billed deals count toward commission — unbilled revenue
      // isn't tracked here at all, so it also doesn't count toward the
      // annual accelerator threshold or margin math.
      where: { contractValueCents: { not: null }, percentInvoiced: { gte: 100 } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        jobTitle: true,
        contractValueCents: true,
        actualLaborCents: true,
        actualMaterialCents: true,
        commissionPaidAt: true,
        commissionEmployeeId: true,
        hubspotOwnerEmail: true,
        hubspotOwnerName: true,
        projectDate: true,
        createdAt: true,
        laborEntries: {
          select: { id: true, employeeId: true, workDate: true, createdAt: true, hours: true, hourlyRateCents: true },
        },
        materialEntries: { select: { costCents: true } },
        contractorAssignments: { select: { costCents: true } },
      },
    }),
    prisma.employee.findMany({ select: { id: true, email: true, firstName: true, lastName: true } }),
    prisma.erpUser.findMany({ select: { email: true } }),
  ]);

  const erpUserEmails = new Set(erpUsers.map((u) => u.email.toLowerCase()));
  const eligibleEmployees = employees.filter((e) => e.email && erpUserEmails.has(e.email.toLowerCase()));
  const employeeById = new Map(eligibleEmployees.map((e) => [e.id, e]));

  const margins = await computeProjectMargins(projects);
  const ownerIdByProject = new Map(projects.map((p) => [p.id, resolveCommissionEmployeeId(p, eligibleEmployees)]));

  // Commission rate depends on margin % and is applied to contract value
  // (not margin dollars), plus an accelerator once a rep's cumulative
  // revenue for the calendar year passes $1.5M — see computeCommissionCentsByDeal.
  const dealsForCalc = projects.map((p) => {
    const marginCents = margins.get(p.id)?.marginCents ?? 0;
    return {
      id: p.id,
      contractValueCents: p.contractValueCents!,
      marginPercent: (marginCents / p.contractValueCents!) * 100,
      ownerId: ownerIdByProject.get(p.id) ?? null,
      date: p.projectDate ?? p.createdAt,
    };
  });
  const commissionCentsByDeal = computeCommissionCentsByDeal(dealsForCalc);
  const yearByDeal = new Map(dealsForCalc.map((d) => [d.id, d.date.getUTCFullYear()]));

  const allRows: (CommissionDealRow & { ownerId: string | null; year: number })[] = projects.map((p) => {
    const margin = margins.get(p.id);
    const ownerId = ownerIdByProject.get(p.id) ?? null;
    const owner = ownerId ? employeeById.get(ownerId) : null;
    return {
      projectId: p.id,
      jobTitle: p.jobTitle,
      ownerId,
      ownerName: owner ? `${owner.firstName} ${owner.lastName}`.trim() : null,
      contractValueCents: p.contractValueCents!,
      marginCents: margin?.marginCents ?? null,
      commissionCents: commissionCentsByDeal.get(p.id) ?? 0,
      paidAt: p.commissionPaidAt ? p.commissionPaidAt.toISOString() : null,
      year: yearByDeal.get(p.id)!,
    };
  });

  const availableYears = [...new Set(allRows.map((r) => r.year))].sort((a, b) => b - a);
  const { year: yearParam } = await searchParams;
  const selectedYear = yearParam && availableYears.includes(Number(yearParam))
    ? Number(yearParam)
    : (availableYears[0] ?? new Date().getUTCFullYear());

  const yearRows = allRows.filter((r) => r.year === selectedYear);
  const groupsByOwner = new Map<string, RepGroup>();
  for (const row of yearRows) {
    const key = row.ownerId ?? "unassigned";
    const group = groupsByOwner.get(key) ?? {
      ownerId: row.ownerId,
      ownerName: row.ownerName ?? "Unassigned",
      yearRevenueCents: 0,
      totalCommissionCents: 0,
      paidCommissionCents: 0,
      deals: [],
    };
    group.yearRevenueCents += row.contractValueCents;
    group.totalCommissionCents += row.commissionCents;
    if (row.paidAt) group.paidCommissionCents += row.commissionCents;
    group.deals.push(row);
    groupsByOwner.set(key, group);
  }
  const repGroups = [...groupsByOwner.values()].sort((a, b) => b.totalCommissionCents - a.totalCommissionCents);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Commission</h1>
      </div>
      <CommissionByRep years={availableYears} selectedYear={selectedYear} reps={repGroups} />
    </div>
  );
}
