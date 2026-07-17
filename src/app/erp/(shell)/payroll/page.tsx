import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canSeeFinancials } from "@/lib/erpAuth";
import { computeProjectMargins } from "@/lib/erp/projectMargin";
import { computeCommissionCentsByDeal, computeRecurringCommissionCents, resolveCommissionEmployeeId } from "@/lib/erp/commission";
import { CommissionByRep, type CommissionChangeOrderRow, type CommissionDealRow, type RecurringCommissionRow, type RepGroup } from "../commission/CommissionByRep";
import { DetailTabs } from "@/app/erp/components/DetailTabs";
import { PayrollView } from "./PayrollView";
import { OffshorePayrollView } from "./OffshorePayrollView";
import { ReimbursementsView, type ReimbursementRow } from "./ReimbursementsView";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ year?: string; view?: string }> };

export default async function PayrollPage({ searchParams }: PageProps) {
  const auth = await getErpAuth();
  if (!auth || !canSeeFinancials(auth.role)) redirect("/erp");

  const [projects, employees, erpUsers, reimbursements, recurringPeriods, completedPaidChangeOrders] = await Promise.all([
    prisma.project.findMany({
      // Only deals that are actually PAID count toward commission — being
      // fully billed/invoiced (percentInvoiced=100) isn't enough on its own,
      // since a project can be fully invoiced and still awaiting payment.
      // "PAID" is accepted alongside the canonical "INVOICE_PAID" since some
      // rows were set outside the normal editor (same vocabulary drift seen
      // on ProjectChangeOrder.billingStatus). Unbilled/unpaid revenue isn't
      // tracked here at all, so it also doesn't count toward the annual
      // accelerator threshold or margin math.
      where: { contractValueCents: { not: null }, billingStatus: { in: ["INVOICE_PAID", "PAID"] } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        jobTitle: true,
        segment: true,
        contractValueCents: true,
        actualLaborCents: true,
        actualMaterialCents: true,
        commissionPaidAt: true,
        commissionEmployeeId: true,
        hubspotOwnerEmail: true,
        hubspotOwnerName: true,
        createdByEmployeeId: true,
        buildingId: true,
        building: { select: { name: true } },
        projectDate: true,
        projectEndDate: true,
        billingCompletedAt: true,
        createdAt: true,
        laborEntries: {
          select: { id: true, employeeId: true, workDate: true, createdAt: true, hours: true, hourlyRateCents: true },
        },
        materialEntries: { select: { costCents: true } },
        contractorAssignments: { select: { costCents: true } },
      },
    }),
    prisma.employee.findMany({ select: { id: true, email: true, firstName: true, lastName: true, status: true } }),
    prisma.erpUser.findMany({ select: { email: true } }),
    prisma.reimbursement.findMany({
      orderBy: { date: "desc" },
      include: { employee: { select: { id: true, firstName: true, lastName: true } } },
    }),
    prisma.recurringContractPeriod.findMany({
      include: {
        recurringContract: {
          select: { buildingId: true, startDate: true, commissionEmployeeId: true, building: { select: { name: true } } },
        },
        projects: { select: { id: true, contractValueCents: true, billingStatus: true } },
      },
    }),
    // A CO only becomes commissionable once it's done AND paid — mirrors the
    // "PAID"/"INVOICE_PAID" vocabulary split, since two different editors
    // write different strings for the same "paid" state (see the CO PATCH route).
    // contractValueCents is only set once a CO's final value is confirmed —
    // plenty of real COs only ever get estimatedCostCents set, so the gate
    // accepts either and the effective value falls back accordingly below.
    prisma.projectChangeOrder.findMany({
      where: {
        status: "COMPLETED",
        billingStatus: { in: ["PAID", "INVOICE_PAID"] },
        OR: [{ contractValueCents: { not: null } }, { estimatedCostCents: { not: null } }],
      },
      select: {
        id: true,
        title: true,
        contractValueCents: true,
        estimatedCostCents: true,
        actualLaborCents: true,
        actualMaterialCents: true,
        actualTravelCents: true,
        commissionPaidAt: true,
        completedAt: true,
        updatedAt: true,
        project: {
          select: {
            id: true,
            jobTitle: true,
            segment: true,
            commissionEmployeeId: true,
            hubspotOwnerEmail: true,
            hubspotOwnerName: true,
            createdByEmployeeId: true,
          },
        },
      },
    }),
  ]);

  const erpUserEmails = new Set(erpUsers.map((u) => u.email.toLowerCase()));
  const eligibleEmployees = employees.filter((e) => e.email && erpUserEmails.has(e.email.toLowerCase()));
  const employeeById = new Map(eligibleEmployees.map((e) => [e.id, e]));

  const margins = await computeProjectMargins(projects);
  const ownerIdByProject = new Map(projects.map((p) => [p.id, resolveCommissionEmployeeId(p, eligibleEmployees)]));
  // A CO has no owner of its own — it inherits commission credit from the
  // project it belongs to, same resolver as the base deal.
  const ownerIdByChangeOrder = new Map(
    completedPaidChangeOrders.map((co) => [co.id, resolveCommissionEmployeeId(co.project, eligibleEmployees)])
  );

  // Recurring janitorial contract commission: 5% of ACV months 1-12, 2%
  // months 13-24, $0 after — a separate schedule from one-time deals, keyed
  // off each period's own snapshotted rate rather than margin. See
  // computeRecurringCommissionCents. Computed before the one-time-deal
  // commission calc below, since recurring revenue also counts toward the
  // $1.5M cumulative threshold that unlocks the accelerator rate on deals.
  // Only counts once that month's invoice is actually paid — mirrors the
  // one-time-deal and change-order gates below, and matches the Billing
  // page's Recurring tab, which is what marks a period's billing project paid.
  const recurringRowsAll: (RecurringCommissionRow & { ownerId: string | null; year: number })[] = recurringPeriods
    .map((period) => {
      const billingProject = period.projects.find((p) => p.id === period.billingProjectId);
      if (!billingProject?.contractValueCents) return null;
      if (!billingProject.billingStatus || !["INVOICE_PAID", "PAID"].includes(billingProject.billingStatus)) return null;
      const monthIndex =
        (period.periodStart.getUTCFullYear() - period.recurringContract.startDate.getUTCFullYear()) * 12 +
        (period.periodStart.getUTCMonth() - period.recurringContract.startDate.getUTCMonth());
      return {
        contractId: period.recurringContractId,
        buildingId: period.recurringContract.buildingId,
        periodId: period.id,
        buildingName: period.recurringContract.building.name,
        periodStart: period.periodStart.toISOString(),
        monthlyRateCents: billingProject.contractValueCents,
        monthIndex,
        commissionCents: computeRecurringCommissionCents(billingProject.contractValueCents, monthIndex),
        paidAt: period.commissionPaidAt ? period.commissionPaidAt.toISOString() : null,
        ownerId: period.recurringContract.commissionEmployeeId,
        year: period.periodStart.getUTCFullYear(),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  // A deal's commission year is based on when billing actually completed,
  // not when the work was scheduled — projectDate/projectEndDate are
  // scheduling dates (e.g. a janitorial unit's move-out date can be set
  // months before the unit is actually billed and paid), so they're only a
  // fallback for older rows that predate billingCompletedAt being tracked.
  const dealDate = (p: { billingCompletedAt: Date | null; projectEndDate: Date | null; projectDate: Date | null; createdAt: Date }) =>
    p.billingCompletedAt ?? p.projectEndDate ?? p.projectDate ?? p.createdAt;

  // Commission rate depends on margin % and is applied to contract value
  // (not margin dollars), plus an accelerator once a rep's cumulative
  // revenue for the calendar year passes $1.5M — see computeCommissionCentsByDeal.
  const dealsForCalc = projects.map((p) => {
    const marginCents = margins.get(p.id)?.marginCents ?? 0;
    return {
      id: p.id,
      contractValueCents: p.contractValueCents!,
      marginPercent: p.contractValueCents === 0 ? 0 : (marginCents / p.contractValueCents!) * 100,
      ownerId: ownerIdByProject.get(p.id) ?? null,
      // Must match the `completedAt` precedence below — otherwise a deal can be
      // bucketed into one year while displaying a date from a different year,
      // which looks like a bug in the UI.
      date: dealDate(p),
    };
  });
  // contractValueCents is only set once a CO's final value is confirmed —
  // plenty of real COs only ever get an estimatedCostCents, so fall back to
  // that rather than skip them.
  const coValueCents = (co: { contractValueCents: number | null; estimatedCostCents: number | null }) =>
    co.contractValueCents ?? co.estimatedCostCents ?? 0;

  // Completed + paid COs are commissioned the same way as one-time deals —
  // their own margin tier off their own actual costs — and their revenue
  // counts toward the same per-owner annual accelerator threshold. Tagged
  // with a "co:" id prefix so they get their own entry in the commission map
  // without colliding with project ids.
  const coDealsForCalc = completedPaidChangeOrders.map((co) => {
    const value = coValueCents(co);
    // Labor + material only, no travel — matches computeProjectMargins (base
    // deals) and the Projects table's CO cost rollup, so margin-based
    // commission tiers agree with what the Projects page displays.
    const costCents = (co.actualLaborCents ?? 0) + (co.actualMaterialCents ?? 0);
    const marginCents = value - costCents;
    return {
      id: `co:${co.id}`,
      contractValueCents: value,
      marginPercent: value === 0 ? 0 : (marginCents / value) * 100,
      ownerId: ownerIdByChangeOrder.get(co.id) ?? null,
      date: co.completedAt ?? co.updatedAt,
    };
  });
  const recurringRevenueForCalc = recurringRowsAll.map((r) => ({
    contractValueCents: r.monthlyRateCents,
    ownerId: r.ownerId,
    date: new Date(r.periodStart),
  }));
  const commissionCentsByDeal = computeCommissionCentsByDeal(
    [...dealsForCalc, ...coDealsForCalc],
    recurringRevenueForCalc
  );
  const yearByDeal = new Map(dealsForCalc.map((d) => [d.id, d.date.getUTCFullYear()]));
  const yearByCo = new Map(coDealsForCalc.map((d) => [d.id, d.date.getUTCFullYear()]));

  const allRows: (CommissionDealRow & { ownerId: string | null; year: number })[] = projects.map((p) => {
    const margin = margins.get(p.id);
    const ownerId = ownerIdByProject.get(p.id) ?? null;
    const owner = ownerId ? employeeById.get(ownerId) : null;
    return {
      projectId: p.id,
      jobTitle: p.jobTitle,
      segment: p.segment,
      ownerId,
      ownerName: owner ? `${owner.firstName} ${owner.lastName}`.trim() : null,
      buildingId: p.buildingId,
      buildingName: p.building?.name ?? null,
      contractValueCents: p.contractValueCents!,
      marginCents: margin?.marginCents ?? null,
      commissionCents: commissionCentsByDeal.get(p.id) ?? 0,
      paidAt: p.commissionPaidAt ? p.commissionPaidAt.toISOString() : null,
      completedAt: dealDate(p).toISOString(),
      year: yearByDeal.get(p.id)!,
    };
  });

  const allCoRows: (CommissionChangeOrderRow & { ownerId: string | null; year: number })[] = completedPaidChangeOrders.map(
    (co) => {
      const value = coValueCents(co);
      const costCents = (co.actualLaborCents ?? 0) + (co.actualMaterialCents ?? 0);
      const ownerId = ownerIdByChangeOrder.get(co.id) ?? null;
      const owner = ownerId ? employeeById.get(ownerId) : null;
      const calcId = `co:${co.id}`;
      return {
        changeOrderId: co.id,
        projectId: co.project.id,
        projectJobTitle: co.project.jobTitle,
        title: co.title,
        segment: co.project.segment,
        ownerId,
        ownerName: owner ? `${owner.firstName} ${owner.lastName}`.trim() : null,
        contractValueCents: value,
        marginCents: value - costCents,
        commissionCents: commissionCentsByDeal.get(calcId) ?? 0,
        paidAt: co.commissionPaidAt ? co.commissionPaidAt.toISOString() : null,
        completedAt: (co.completedAt ?? co.updatedAt).toISOString(),
        year: yearByCo.get(calcId)!,
      };
    }
  );

  const availableYears = [
    ...new Set([...allRows.map((r) => r.year), ...recurringRowsAll.map((r) => r.year), ...allCoRows.map((r) => r.year)]),
  ].sort((a, b) => b - a);
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
      recurringRows: [],
      changeOrders: [],
    };
    group.yearRevenueCents += row.contractValueCents;
    group.totalCommissionCents += row.commissionCents;
    if (row.paidAt) group.paidCommissionCents += row.commissionCents;
    group.deals.push(row);
    groupsByOwner.set(key, group);
  }

  const recurringYearRows = recurringRowsAll.filter((r) => r.year === selectedYear);
  for (const row of recurringYearRows) {
    const key = row.ownerId ?? "unassigned";
    const owner = row.ownerId ? employeeById.get(row.ownerId) : null;
    const group = groupsByOwner.get(key) ?? {
      ownerId: row.ownerId,
      ownerName: owner ? `${owner.firstName} ${owner.lastName}`.trim() : "Unassigned",
      yearRevenueCents: 0,
      totalCommissionCents: 0,
      paidCommissionCents: 0,
      deals: [],
      recurringRows: [],
      changeOrders: [],
    };
    group.yearRevenueCents += row.monthlyRateCents;
    group.totalCommissionCents += row.commissionCents;
    if (row.paidAt) group.paidCommissionCents += row.commissionCents;
    group.recurringRows.push(row);
    groupsByOwner.set(key, group);
  }

  const coYearRows = allCoRows.filter((r) => r.year === selectedYear);
  for (const row of coYearRows) {
    const key = row.ownerId ?? "unassigned";
    const group = groupsByOwner.get(key) ?? {
      ownerId: row.ownerId,
      ownerName: row.ownerName ?? "Unassigned",
      yearRevenueCents: 0,
      totalCommissionCents: 0,
      paidCommissionCents: 0,
      deals: [],
      recurringRows: [],
      changeOrders: [],
    };
    group.yearRevenueCents += row.contractValueCents;
    group.totalCommissionCents += row.commissionCents;
    if (row.paidAt) group.paidCommissionCents += row.commissionCents;
    group.changeOrders.push(row);
    groupsByOwner.set(key, group);
  }

  const repGroups = [...groupsByOwner.values()].sort((a, b) => b.totalCommissionCents - a.totalCommissionCents);

  const activeEmployeeOptions = employees
    .filter((e) => e.status === "ACTIVE")
    .map((e) => ({ id: e.id, name: `${e.firstName} ${e.lastName}`.trim() }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const reimbursementRows: ReimbursementRow[] = reimbursements.map((r) => ({
    id: r.id,
    date: r.date.toISOString(),
    employeeId: r.employeeId,
    employeeName: `${r.employee.firstName} ${r.employee.lastName}`.trim(),
    companyOrTeam: r.companyOrTeam,
    description: r.description,
    amountCents: r.amountCents,
    receiptUrl: r.receiptUrl,
    paidAt: r.paidAt ? r.paidAt.toISOString() : null,
  }));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-gray-900">Compensation</h1>
      <DetailTabs
        paramName="view"
        tabs={[
          { label: "Payroll", content: <PayrollView /> },
          { label: "Offshore Payroll", content: <OffshorePayrollView /> },
          {
            label: "Commission",
            // key={selectedYear} forces a full remount on year-tab switches —
            // CommissionByRep's paid-toggle state (dealsByOwner/recurringByOwner/
            // coByOwner) is only initialized once from the `reps` prop, so
            // without a fresh mount it kept showing the first-loaded year's
            // rows even after navigating to a different year.
            content: <CommissionByRep key={selectedYear} years={availableYears} selectedYear={selectedYear} reps={repGroups} />,
          },
          {
            label: "Reimbursements",
            content: <ReimbursementsView employees={activeEmployeeOptions} reimbursements={reimbursementRows} />,
          },
        ]}
      />
    </div>
  );
}
