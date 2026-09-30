/**
 * Every commission row, worked out one way for both the Payroll page's
 * Commission tab and the dashboard's Finance tab, so they can't disagree:
 * one-time deals (with their change orders), janitorial contract months,
 * and weekly bid bonuses.
 */

import { prisma } from "@/lib/prisma";
import { computeProjectActualsWithChangeOrders } from "@/lib/erp/projectMargin";
import { computeCommissionCentsByDeal, computeRecurringCommissionCents, resolveCommissionEmployeeId } from "@/lib/erp/commission";
import { bidBonusCentsForCount, mondayOf, type BidBonusRow } from "@/lib/erp/bidBonus";
import { isPaidStatus } from "@/lib/erp/billingStatus";
import type { CommissionDealRow, RecurringCommissionRow } from "@/app/erp/(shell)/commission/CommissionByRep";

export type CommissionDeal = CommissionDealRow & { ownerId: string | null; year: number };
export type CommissionRecurring = RecurringCommissionRow & { ownerId: string | null; ownerName: string | null; year: number };

/** Commission is scoped to 2026 onward, deals and recurring periods are
 * excluded entirely rather than just hidden behind the year selector,
 * since the accelerator threshold resets independently per (owner,
 * calendar year) anyway, so dropping older years can't change what 2026+
 * commission looks like. */
const COMMISSION_MIN_YEAR = 2026;

export async function loadCommissionRows(): Promise<{
  deals: CommissionDeal[];
  recurring: CommissionRecurring[];
  bidBonuses: BidBonusRow[];
}> {
  const [projects, employees, erpUsers, recurringPeriods, bidBonusEntries, salesBidEntries] = await Promise.all([
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
    prisma.recurringContractPeriod.findMany({
      include: {
        recurringContract: {
          select: { buildingId: true, startDate: true, commissionEmployeeId: true, building: { select: { name: true } } },
        },
      },
    }),
    prisma.bidBonusEntry.findMany({ orderBy: { weekStart: "desc" } }),
    prisma.salesBidEntry.findMany({ select: { employeeId: true, sent: true, date: true } }),
  ]);

  const erpUserEmails = new Set(erpUsers.map((u) => u.email.toLowerCase()));
  const eligibleEmployees = employees.filter((e) => e.email && erpUserEmails.has(e.email.toLowerCase()));
  const employeeById = new Map(eligibleEmployees.map((e) => [e.id, e]));
  const nameOf = (id: string | null) => {
    const e = id ? employeeById.get(id) : null;
    return e ? `${e.firstName} ${e.lastName}`.trim() : null;
  };

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
    return co.status === "COMPLETED" && isPaidStatus(co.billingStatus);
  }

  // A project only becomes commissionable once its own billing is fully paid
  // (isPaidStatus accepts old and new spellings, see billingStatus.ts) AND
  // every real change order on it is done and
  // paid too. Unbilled/unpaid revenue isn't tracked here at all, so it also
  // doesn't count toward the annual accelerator threshold.
  function isCommissionEligible(p: {
    contractValueCents: number | null;
    billingStatus: string | null;
    changeOrders: { status: string; billingStatus: string | null }[];
  }): boolean {
    if (!p.contractValueCents) return false;
    if (!isPaidStatus(p.billingStatus)) return false;
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
  // which is what marks a period paid. Commission is on the flat monthly
  // amount only, one-off extras (RecurringContractCharge) aren't commissioned.
  const recurring: CommissionRecurring[] = commissionRecurringPeriods
    .map((period) => {
      if (!period.amountCents) return null;
      if (period.billingStatus !== "PAID") return null;
      const monthIndex =
        (period.periodStart.getUTCFullYear() - period.recurringContract.startDate.getUTCFullYear()) * 12 +
        (period.periodStart.getUTCMonth() - period.recurringContract.startDate.getUTCMonth());
      return {
        contractId: period.recurringContractId,
        buildingId: period.recurringContract.buildingId,
        periodId: period.id,
        buildingName: period.recurringContract.building.name,
        periodStart: period.periodStart.toISOString(),
        monthlyRateCents: period.amountCents,
        monthIndex,
        // No salesperson means nobody earns commission on it (e.g. a contract
        // the owner sold himself), the same as a one-time deal with no owner
        // in computeCommissionCentsByDeal.
        commissionCents: period.recurringContract.commissionEmployeeId ? computeRecurringCommissionCents(period.amountCents, monthIndex) : 0,
        paidAt: period.commissionPaidAt ? period.commissionPaidAt.toISOString() : null,
        ownerId: period.recurringContract.commissionEmployeeId,
        ownerName: nameOf(period.recurringContract.commissionEmployeeId),
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
  const recurringRevenueForCalc = recurring.map((r) => ({
    contractValueCents: r.monthlyRateCents,
    ownerId: r.ownerId,
    date: new Date(r.periodStart),
  }));
  const commissionCentsByDeal = computeCommissionCentsByDeal(dealsForCalc, recurringRevenueForCalc);
  const yearByDeal = new Map(dealsForCalc.map((d) => [d.id, d.date.getUTCFullYear()]));

  const deals: CommissionDeal[] = commissionProjects.map((p) => {
    const a = actuals.get(p.id)!;
    const ownerId = ownerIdByProject.get(p.id) ?? null;
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
      ownerName: nameOf(ownerId),
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
  const bidBonuses: BidBonusRow[] = [...bidBonusRowKeys].map((key) => {
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

  return { deals, recurring, bidBonuses };
}
