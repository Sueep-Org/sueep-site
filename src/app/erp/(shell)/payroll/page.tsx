import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canSeeFinancials } from "@/lib/erpAuth";
import { computeProjectActualsWithChangeOrders } from "@/lib/erp/projectMargin";
import { computeCommissionCentsByDeal, computeRecurringCommissionCents, resolveCommissionEmployeeId } from "@/lib/erp/commission";
import { bidBonusCentsForCount, mondayOf, type BidBonusRow } from "@/lib/erp/bidBonus";
import { CommissionByRep, type CommissionDealRow, type RecurringCommissionRow, type RepGroup } from "../commission/CommissionByRep";
import { BidsView, type BidRow } from "../commission/BidsView";
import { BidCommissionView } from "../commission/BidCommissionView";
import { DetailTabs } from "@/app/erp/components/DetailTabs";
import { PayrollView } from "./PayrollView";
import { OffshorePayrollView } from "./OffshorePayrollView";
import { ReimbursementsView, type ReimbursementRow } from "./ReimbursementsView";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ year?: string; view?: string }> };

export default async function PayrollPage({ searchParams }: PageProps) {
  const auth = await getErpAuth();
  if (!auth || !canSeeFinancials(auth.role)) redirect("/erp");

  const [projects, employees, erpUsers, reimbursements, recurringPeriods, bidBonusEntries, salesBidEntries] = await Promise.all([
    prisma.project.findMany({
      // Commission eligibility (is this project's own billing paid, AND is
      // every one of its change orders done and paid too) is decided in
      // memory below, not in this where clause, it needs to look at the
      // change orders included here, not just the project's own billingStatus.
      where: { contractValueCents: { not: null } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        jobTitle: true,
        segment: true,
        contractValueCents: true,
        actualLaborCents: true,
        actualMaterialCents: true,
        billingStatus: true,
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
        // Change orders roll into the same combined commission row as their
        // parent project (revenue, cost, and the "is this all paid yet" gate
        // below) rather than showing as their own separate row.
        changeOrders: {
          select: {
            id: true,
            title: true,
            status: true,
            billingStatus: true,
            contractValueCents: true,
            estimatedCostCents: true,
            actualLaborCents: true,
            actualMaterialCents: true,
            commissionPaidAt: true,
            completedAt: true,
            updatedAt: true,
            materialEntries: { select: { costCents: true } },
            laborers: {
              select: { id: true, employeeId: true, workDate: true, createdAt: true, hours: true, hourlyRateCents: true },
            },
            contractorAssignments: { select: { costCents: true } },
          },
        },
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
    prisma.bidBonusEntry.findMany({
      orderBy: { weekStart: "desc" },
      include: { employee: { select: { id: true, firstName: true, lastName: true } } },
    }),
    prisma.salesBidEntry.findMany({
      orderBy: { createdAt: "desc" },
      include: { employee: { select: { id: true, firstName: true, lastName: true } } },
    }),
  ]);

  const erpUserEmails = new Set(erpUsers.map((u) => u.email.toLowerCase()));
  const eligibleEmployees = employees.filter((e) => e.email && erpUserEmails.has(e.email.toLowerCase()));
  const employeeById = new Map(eligibleEmployees.map((e) => [e.id, e]));

  // Commission is scoped to 2026 onward, deals and recurring periods are
  // excluded entirely rather than just hidden behind the year selector,
  // since the accelerator threshold resets independently per (owner,
  // calendar year) anyway, so dropping older years can't change what 2026+
  // commission looks like.
  const COMMISSION_MIN_YEAR = 2026;

  // A change order that's VOID/REJECTED never happened, it's excluded from
  // consideration entirely, matching computeProjectActualsWithChangeOrders'
  // own "qualifying" filter. Anything else still open (DRAFT/SUBMITTED/
  // APPROVED/BILLING, or COMPLETED but not yet paid) means the deal isn't
  // fully settled yet, so the whole project's commission row waits rather
  // than showing the base project while a change order is still pending.
  function qualifyingChangeOrders<T extends { status: string }>(p: { changeOrders: T[] }): T[] {
    return p.changeOrders.filter((co) => co.status !== "VOID" && co.status !== "REJECTED");
  }

  function isFullyPaidCo(co: { status: string; billingStatus: string | null }): boolean {
    return co.status === "COMPLETED" && !!co.billingStatus && ["INVOICE_PAID", "PAID"].includes(co.billingStatus);
  }

  // A project only becomes commissionable once its own billing is fully paid
  // (mirrors the "PAID"/"INVOICE_PAID" vocabulary split, some rows were set
  // outside the normal editor) AND every real change order on it is done and
  // paid too. Unbilled/unpaid revenue isn't tracked here at all, so it also
  // doesn't count toward the annual accelerator threshold.
  function isCommissionEligible(p: {
    contractValueCents: number | null;
    billingStatus: string | null;
    changeOrders: { status: string; billingStatus: string | null }[];
  }): boolean {
    if (!p.contractValueCents) return false;
    if (!p.billingStatus || !["INVOICE_PAID", "PAID"].includes(p.billingStatus)) return false;
    return qualifyingChangeOrders(p).every(isFullyPaidCo);
  }

  // A deal's commission date is based on when billing actually completed,
  // not when the work was scheduled, projectDate/projectEndDate are
  // scheduling dates, so billingCompletedAt (when set) is the real signal.
  // When a project has change orders, the combined row is dated to whichever
  // closed last (the project's own billing, or its latest paid CO), that's
  // when it actually became fully commissionable.
  function dealDate(p: {
    billingCompletedAt: Date | null;
    projectEndDate: Date | null;
    projectDate: Date | null;
    createdAt: Date;
    changeOrders: { status: string; completedAt: Date | null; updatedAt: Date }[];
  }): Date {
    const base = p.billingCompletedAt ?? p.projectEndDate ?? p.projectDate ?? p.createdAt;
    const coDates = qualifyingChangeOrders(p).map((co) => co.completedAt ?? co.updatedAt);
    return coDates.length === 0 ? base : new Date(Math.max(base.getTime(), ...coDates.map((d) => d.getTime())));
  }

  const eligibleProjects = projects.filter(isCommissionEligible);
  const commissionProjects = eligibleProjects.filter((p) => dealDate(p).getUTCFullYear() >= COMMISSION_MIN_YEAR);
  const commissionRecurringPeriods = recurringPeriods.filter(
    (period) => period.periodStart.getUTCFullYear() >= COMMISSION_MIN_YEAR
  );

  // Combined revenue + cost across each project and its (already-verified-
  // paid, by isCommissionEligible above) change orders, same shared
  // methodology the Projects table and dashboard margin widgets use, so this
  // page never quietly disagrees with them on what a project's real value is.
  const actuals = await computeProjectActualsWithChangeOrders(commissionProjects);
  const ownerIdByProject = new Map(commissionProjects.map((p) => [p.id, resolveCommissionEmployeeId(p, eligibleEmployees)]));

  // Recurring janitorial contract commission: 5% of ACV months 1-12, 2%
  // months 13-24, $0 after — a separate schedule from one-time deals, keyed
  // off each period's own snapshotted rate rather than margin. See
  // computeRecurringCommissionCents. Computed before the one-time-deal
  // commission calc below, since recurring revenue also counts toward the
  // $1.5M cumulative threshold that unlocks the accelerator rate on deals.
  // Only counts once that month's invoice is actually paid — mirrors the
  // one-time-deal gate above, and matches the Billing page's Recurring tab,
  // which is what marks a period's billing project paid.
  const recurringRowsAll: (RecurringCommissionRow & { ownerId: string | null; year: number })[] = commissionRecurringPeriods
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

  // Commission rate depends on margin % and is applied to contract value
  // (not margin dollars), plus an accelerator once a rep's cumulative
  // revenue for the calendar year passes $1.5M — see computeCommissionCentsByDeal.
  // One event per project, combining its own value with every qualifying
  // change order's (already rolled into contractValueCents/marginCents by
  // computeProjectActualsWithChangeOrders above), since a project that
  // reached this point already has all its change orders finished and paid.
  const dealsForCalc = commissionProjects.map((p) => {
    const a = actuals.get(p.id)!;
    const contractValueCents = a.contractValueCents ?? p.contractValueCents!;
    const marginCents = a.marginCents ?? 0;
    return {
      id: p.id,
      contractValueCents,
      marginPercent: contractValueCents === 0 ? 0 : (marginCents / contractValueCents) * 100,
      ownerId: ownerIdByProject.get(p.id) ?? null,
      // Must match the `completedAt` precedence below — otherwise a deal can be
      // bucketed into one year while displaying a date from a different year,
      // which looks like a bug in the UI.
      date: dealDate(p),
    };
  });
  const recurringRevenueForCalc = recurringRowsAll.map((r) => ({
    contractValueCents: r.monthlyRateCents,
    ownerId: r.ownerId,
    date: new Date(r.periodStart),
  }));
  const commissionCentsByDeal = computeCommissionCentsByDeal(dealsForCalc, recurringRevenueForCalc);
  const yearByDeal = new Map(dealsForCalc.map((d) => [d.id, d.date.getUTCFullYear()]));

  const allRows: (CommissionDealRow & { ownerId: string | null; year: number })[] = commissionProjects.map((p) => {
    const a = actuals.get(p.id)!;
    const ownerId = ownerIdByProject.get(p.id) ?? null;
    const owner = ownerId ? employeeById.get(ownerId) : null;
    const qualifyingCOs = qualifyingChangeOrders(p);
    // The combined row only shows as Paid once the project's own commission
    // AND every included change order's have all been marked paid together
    // (see the single combined toggle in CommissionByRep), a partial state
    // (e.g. data from before this was combined) reads as unpaid rather than
    // falsely paid.
    const fullyPaid = !!p.commissionPaidAt && qualifyingCOs.every((co) => !!co.commissionPaidAt);
    return {
      projectId: p.id,
      jobTitle: p.jobTitle,
      segment: p.segment,
      ownerId,
      ownerName: owner ? `${owner.firstName} ${owner.lastName}`.trim() : null,
      buildingId: p.buildingId,
      buildingName: p.building?.name ?? null,
      contractValueCents: a.contractValueCents ?? p.contractValueCents!,
      marginCents: a.marginCents,
      commissionCents: commissionCentsByDeal.get(p.id) ?? 0,
      paidAt: fullyPaid ? p.commissionPaidAt!.toISOString() : null,
      completedAt: dealDate(p).toISOString(),
      includedChangeOrders: qualifyingCOs.map((co) => ({
        id: co.id,
        title: co.title,
        contractValueCents: co.contractValueCents ?? co.estimatedCostCents ?? 0,
      })),
      year: yearByDeal.get(p.id)!,
    };
  });

  // The manual bid-pipeline log — a separate comp track from deal/CO/recurring
  // commission, shown as its own flat page ("Bids") rather than nested
  // per-rep, and not scoped to the Commission tab's selected year.
  const bidRows: BidRow[] = salesBidEntries.map((entry) => ({
    id: entry.id,
    employeeId: entry.employeeId,
    employeeName: `${entry.employee.firstName} ${entry.employee.lastName}`.trim(),
    date: entry.date ? entry.date.toISOString() : null,
    projectStartDate: entry.projectStartDate ? entry.projectStartDate.toISOString() : null,
    company: entry.company,
    deal: entry.deal,
    description: entry.description,
    drawings: entry.drawings as "YES" | "NO" | "ASKED" | null,
    payoutCents: entry.payoutCents,
    sent: entry.sent,
  }));

  // Weekly verified-bid bonus ("Bid Commission") is derived from the Bids
  // log, not manually entered: count each employee's sent bids per week
  // (bucketed by the bid's own date, not the week it was later marked sent)
  // and look up the tier. Bids with no date can't be bucketed into a week,
  // so they don't count. Paid status is the only thing actually stored
  // (BidBonusEntry), keyed by (employeeId, weekStart) — union in any paid
  // weeks that currently have zero sent bids so a paid record never
  // silently disappears if its bids are later unmarked or deleted.
  const sentBidCountByKey = new Map<string, number>();
  const employeeNameById = new Map(employees.map((e) => [e.id, `${e.firstName} ${e.lastName}`.trim()]));
  for (const entry of salesBidEntries) {
    if (!entry.sent || !entry.date) continue;
    const key = `${entry.employeeId}::${mondayOf(entry.date)}`;
    sentBidCountByKey.set(key, (sentBidCountByKey.get(key) ?? 0) + 1);
  }
  const paidAtByKey = new Map(
    bidBonusEntries.map((e) => [`${e.employeeId}::${mondayOf(e.weekStart)}`, e.paidAt])
  );
  const bidBonusRowKeys = new Set([...sentBidCountByKey.keys(), ...paidAtByKey.keys()]);
  const bidBonusRows: BidBonusRow[] = [...bidBonusRowKeys].map((key) => {
    const [employeeId, weekStartDate] = key.split("::");
    const verifiedBids = sentBidCountByKey.get(key) ?? 0;
    const paidAt = paidAtByKey.get(key) ?? null;
    return {
      employeeId,
      employeeName: employeeNameById.get(employeeId) ?? "Unknown",
      weekStart: new Date(`${weekStartDate}T00:00:00Z`).toISOString(),
      verifiedBids,
      bonusCents: bidBonusCentsForCount(verifiedBids),
      paidAt: paidAt ? paidAt.toISOString() : null,
    };
  });

  const availableYears = [
    ...new Set([...allRows.map((r) => r.year), ...recurringRowsAll.map((r) => r.year)]),
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
    };
    group.yearRevenueCents += row.monthlyRateCents;
    group.totalCommissionCents += row.commissionCents;
    if (row.paidAt) group.paidCommissionCents += row.commissionCents;
    group.recurringRows.push(row);
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
            children: [
              {
                label: "Sales",
                // key={selectedYear} forces a full remount on year-tab switches —
                // CommissionByRep's paid-toggle state (dealsByOwner/recurringByOwner)
                // is only initialized once from the `reps` prop, so without a fresh
                // mount it kept showing the first-loaded year's rows even after
                // navigating to a different year.
                content: (
                  <CommissionByRep key={selectedYear} years={availableYears} selectedYear={selectedYear} reps={repGroups} />
                ),
              },
              {
                label: "Bids",
                content: (
                  <div className="space-y-6">
                    <section className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
                      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Bid Commission</h2>
                      <BidCommissionView rows={bidBonusRows} />
                    </section>
                    <section className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
                      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Bids</h2>
                      <BidsView employees={activeEmployeeOptions} rows={bidRows} />
                    </section>
                  </div>
                ),
              },
            ],
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
