/**
 * Company-wide finance numbers for the dashboard's Finance tab.
 *
 * Revenue is counted in the month the work was completed, not when it was
 * paid: a turnover by turnoverCompletedAt (Eastern), any other project by
 * projectEndDate, and a janitorial contract month by its periodStart. Only
 * COMPLETE projects count; anything still active or upcoming is backlog.
 *
 * Job cost (labor, contractors, material, change orders) is exactly what the
 * Projects table shows, via computeProjectActualsWithChangeOrders, so a job's
 * margin here always matches its margin there. Change orders roll into their
 * parent project's month.
 *
 * Net profit also subtracts overhead: salaries, offshore pay, commission paid
 * out, and reimbursements. Salaried staff also log hours on jobs, and that
 * labor is already in job cost, so only the part of each salary that isn't
 * already in a job that month counts as overhead (otherwise it would be
 * subtracted twice).
 */

import { prisma } from "@/lib/prisma";
import { computeProjectActualsWithChangeOrders } from "@/lib/erp/projectMargin";
import { laborCostByContract, monthBounds } from "@/lib/erp/janitorialProfit";
import { normalizeProjectSegment } from "@/lib/erp/projectSegments";
import { todayEasternAsUtcMidnight, todayEasternKey } from "@/lib/erp/dates";

export type FinanceSegment = "POST_CONSTRUCTION" | "TURNOVERS" | "JANITORIAL_CONTRACTS" | "OTHER";

export const FINANCE_SEGMENT_LABELS: Record<FinanceSegment, string> = {
  POST_CONSTRUCTION: "Post-construction",
  TURNOVERS: "Turnovers",
  JANITORIAL_CONTRACTS: "Janitorial contracts",
  OTHER: "Other",
};

export const FINANCE_SEGMENTS: FinanceSegment[] = ["POST_CONSTRUCTION", "TURNOVERS", "JANITORIAL_CONTRACTS", "OTHER"];

export type SegmentTotals = { revenueCents: number; costCents: number; jobs: number };

export type FinanceMonth = {
  /** "YYYY-MM" */
  key: string;
  revenueCents: number;
  laborCents: number;
  materialCents: number;
  grossProfitCents: number;
  salaryCents: number;
  offshoreCents: number;
  commissionCents: number;
  reimbursementCents: number;
  overheadCents: number;
  netProfitCents: number;
  /** Revenue earned this month that's billed but not marked paid yet. */
  unpaidCents: number;
  segments: Record<FinanceSegment, SegmentTotals>;
};

export type FinanceJob = {
  id: string;
  /** Project id for a job, contract id for a janitorial contract month. */
  href: string;
  title: string;
  monthKey: string;
  segment: FinanceSegment;
  revenueCents: number;
  costCents: number;
  profitCents: number;
};

export type FinanceSummary = {
  months: FinanceMonth[];
  jobs: FinanceJob[];
  /** Current month, "YYYY-MM" (Eastern). */
  currentMonthKey: string;
  /** Contract value of ACTIVE/UPCOMING projects, not yet earned. */
  backlogCents: number;
  backlogJobs: number;
  /** Sum of ACTIVE janitorial contracts' monthly rate. */
  recurringMonthlyCents: number;
  activeContracts: number;
  warnings: {
    /** Completed jobs left out because they have no contract value. */
    noContractValue: number;
    /** Completed jobs left out because they have no end/completion date. */
    noCompletionDate: number;
    /** Salaried employees with no salary on file (counted as $0). */
    salaryMissing: number;
    /** Janitors who worked with no hourly rate set (their hours cost $0). */
    janitorMissingRate: string[];
  };
};

function emptySegments(): Record<FinanceSegment, SegmentTotals> {
  return {
    POST_CONSTRUCTION: { revenueCents: 0, costCents: 0, jobs: 0 },
    TURNOVERS: { revenueCents: 0, costCents: 0, jobs: 0 },
    JANITORIAL_CONTRACTS: { revenueCents: 0, costCents: 0, jobs: 0 },
    OTHER: { revenueCents: 0, costCents: 0, jobs: 0 },
  };
}

function emptyMonth(key: string): FinanceMonth {
  return {
    key, revenueCents: 0, laborCents: 0, materialCents: 0, grossProfitCents: 0,
    salaryCents: 0, offshoreCents: 0, commissionCents: 0, reimbursementCents: 0,
    overheadCents: 0, netProfitCents: 0, unpaidCents: 0, segments: emptySegments(),
  };
}

function segmentOf(rawSegment: string): FinanceSegment {
  const s = normalizeProjectSegment(rawSegment);
  if (s === "JANITORIAL_TURNOVER_REQUESTS") return "TURNOVERS";
  if (s === "COMMERCIAL_CLEANING" || s === "COMMERCIAL_PAINTING" || s === "CHANGE_ORDER") return "POST_CONSTRUCTION";
  return "OTHER";
}

/** "YYYY-MM" of a date-only field stored as UTC midnight. */
function utcMonthKey(d: Date): string {
  return d.toISOString().slice(0, 7);
}

/** "YYYY-MM" of a real timestamp, in Eastern time. */
function easternMonthKey(d: Date): string {
  return todayEasternKey(d).slice(0, 7);
}

function daysInMonth(key: string): number {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function monthKeysBetween(firstKey: string, lastKey: string): string[] {
  const keys: string[] = [];
  let [y, m] = firstKey.split("-").map(Number);
  const [ly, lm] = lastKey.split("-").map(Number);
  while (y < ly || (y === ly && m <= lm)) {
    keys.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return keys;
}

const PAID_PROJECT_STATUSES = new Set(["INVOICE_PAID", "PAID"]);

/** First month shown ("YYYY-MM"). The ERP wasn't fully in use until August
 * 2026, so earlier months are missing jobs and costs and would mislead. */
export const FINANCE_DATA_START = "2026-08";

export async function computeFinanceSummary(): Promise<FinanceSummary> {
  const today = todayEasternAsUtcMidnight();
  const currentMonthKey = utcMonthKey(today);

  const [completedProjects, backlogProjects, periods, contracts, fixedPayEmployees, offshorePaid, commissionPayouts, reimbursements] = await Promise.all([
    prisma.project.findMany({
      where: { status: "COMPLETE" },
      select: {
        id: true, jobTitle: true, segment: true, billingStatus: true,
        projectEndDate: true, turnoverCompletedAt: true,
        recurringContractPeriodId: true, turnoverRequestId: true,
        contractValueCents: true, actualLaborCents: true, actualMaterialCents: true,
        laborEntries: { select: { id: true, employeeId: true, workDate: true, createdAt: true, hours: true, hourlyRateCents: true } },
        materialEntries: { select: { costCents: true } },
        contractorAssignments: { select: { costCents: true } },
        changeOrders: {
          select: {
            status: true, contractValueCents: true, estimatedCostCents: true,
            actualLaborCents: true, actualMaterialCents: true,
            materialEntries: { select: { costCents: true } },
            laborers: { select: { id: true, employeeId: true, workDate: true, createdAt: true, hours: true, hourlyRateCents: true } },
            contractorAssignments: { select: { costCents: true } },
          },
        },
      },
    }),
    prisma.project.findMany({
      where: { status: { in: ["ACTIVE", "UPCOMING", "ON_HOLD"] } },
      select: { contractValueCents: true, recurringContractPeriodId: true, turnoverRequestId: true },
    }),
    prisma.recurringContractPeriod.findMany({
      where: { periodStart: { gte: new Date(`${FINANCE_DATA_START}-01T00:00:00.000Z`), lte: today } },
      select: {
        id: true, periodStart: true, amountCents: true, billingStatus: true, recurringContractId: true,
        charges: { select: { amountCents: true } },
        recurringContract: { select: { building: { select: { name: true } } } },
      },
    }),
    prisma.recurringContract.findMany({ select: { status: true, monthlyRateCents: true, startDate: true } }),
    prisma.employee.findMany({
      where: { OR: [{ payType: "SALARY", isOffshore: false, isJanitorialContract: false }, { isOffshore: true }] },
      select: { id: true, status: true, statusChangedAt: true, payType: true, isOffshore: true, hireDate: true, annualSalaryCents: true, offshoreMonthlyRateCents: true },
    }),
    prisma.offshorePayrollPayment.findMany({
      where: { paidAt: { not: null } },
      select: { employeeId: true, periodStart: true },
    }),
    prisma.commissionPayout.findMany({ select: { amountCents: true, paidAt: true } }),
    prisma.reimbursement.findMany({ select: { amountCents: true, date: true } }),
  ]);

  const months = new Map<string, FinanceMonth>();
  const monthOf = (key: string) => {
    let m = months.get(key);
    if (!m) { m = emptyMonth(key); months.set(key, m); }
    return m;
  };

  const warnings: FinanceSummary["warnings"] = { noContractValue: 0, noCompletionDate: 0, salaryMissing: 0, janitorMissingRate: [] };
  const jobs: FinanceJob[] = [];

  // ── Completed projects ──────────────────────────────────────────────────
  // A recurring contract's own billing placeholder project (older periods
  // only) is left out: that month's revenue is counted from the period below.
  const jobProjects = completedProjects.filter((p) => !(p.recurringContractPeriodId && !p.turnoverRequestId));
  const actuals = await computeProjectActualsWithChangeOrders(jobProjects);

  const salariedIds = new Set(fixedPayEmployees.filter((e) => e.payType === "SALARY" && !e.isOffshore).map((e) => e.id));
  // Straight-time cost of salaried staff's hours inside jobs, per employee
  // per job month, so it can come back out of their salary overhead.
  const salaryInJobs = new Map<string, number>();

  for (const p of jobProjects) {
    const earnedAt = p.turnoverCompletedAt ? easternMonthKey(p.turnoverCompletedAt) : p.projectEndDate ? utcMonthKey(p.projectEndDate) : null;
    if (!earnedAt) { warnings.noCompletionDate++; continue; }
    if (earnedAt < FINANCE_DATA_START || earnedAt > currentMonthKey) continue;
    const a = actuals.get(p.id);
    if (!a || a.contractValueCents == null || a.contractValueCents === 0) { warnings.noContractValue++; continue; }

    const segment = segmentOf(p.segment);
    const costCents = a.actualLaborCents + a.actualMaterialCents;
    const m = monthOf(earnedAt);
    m.revenueCents += a.contractValueCents;
    m.laborCents += a.actualLaborCents;
    m.materialCents += a.actualMaterialCents;
    m.segments[segment].revenueCents += a.contractValueCents;
    m.segments[segment].costCents += costCents;
    m.segments[segment].jobs++;
    if (!p.billingStatus || !PAID_PROJECT_STATUSES.has(p.billingStatus)) m.unpaidCents += a.contractValueCents;
    jobs.push({
      id: p.id, href: `/erp/projects/${p.id}`, title: p.jobTitle, monthKey: earnedAt, segment,
      revenueCents: a.contractValueCents, costCents, profitCents: a.contractValueCents - costCents,
    });

    const qualifyingLaborers = p.changeOrders
      .filter((co) => co.status !== "VOID" && co.status !== "REJECTED")
      .flatMap((co) => co.laborers);
    for (const e of [...p.laborEntries, ...qualifyingLaborers]) {
      if (!e.employeeId || !salariedIds.has(e.employeeId)) continue;
      const key = `${e.employeeId}::${earnedAt}`;
      salaryInJobs.set(key, (salaryInJobs.get(key) ?? 0) + Math.round(e.hours * e.hourlyRateCents));
    }
  }

  // ── Janitorial contract months ──────────────────────────────────────────
  // Labor is costed per calendar month (clamped to today for the month in
  // progress, so scheduled-but-not-worked shifts don't count yet).
  const periodMonthKeys = Array.from(new Set(periods.map((p) => utcMonthKey(p.periodStart)))).sort();
  const laborByMonth = new Map<string, Awaited<ReturnType<typeof laborCostByContract>>>();
  for (const key of periodMonthKeys) {
    const { start, end } = monthBounds(new Date(`${key}-01T00:00:00.000Z`));
    laborByMonth.set(key, await laborCostByContract(start, end > today ? today : end));
  }
  for (const period of periods) {
    const key = utcMonthKey(period.periodStart);
    const revenueCents = period.amountCents + period.charges.reduce((s, c) => s + c.amountCents, 0);
    const labor = laborByMonth.get(key)?.get(period.recurringContractId);
    const costCents = labor?.costCents ?? 0;
    for (const name of labor?.missingRateNames ?? []) {
      if (!warnings.janitorMissingRate.includes(name)) warnings.janitorMissingRate.push(name);
    }
    const m = monthOf(key);
    m.revenueCents += revenueCents;
    m.laborCents += costCents;
    m.segments.JANITORIAL_CONTRACTS.revenueCents += revenueCents;
    m.segments.JANITORIAL_CONTRACTS.costCents += costCents;
    m.segments.JANITORIAL_CONTRACTS.jobs++;
    if (period.billingStatus !== "PAID") m.unpaidCents += revenueCents;
    jobs.push({
      id: period.id, href: `/erp/janitorial/contracts/${period.recurringContractId}`,
      title: `${period.recurringContract.building.name} (contract)`, monthKey: key, segment: "JANITORIAL_CONTRACTS",
      revenueCents, costCents, profitCents: revenueCents - costCents,
    });
  }

  // ── Month range ─────────────────────────────────────────────────────────
  const allKeys = monthKeysBetween(FINANCE_DATA_START, currentMonthKey);
  for (const key of allKeys) monthOf(key);

  // ── Overhead ────────────────────────────────────────────────────────────
  // Salary and offshore pay are counted from the hire month (or from
  // FINANCE_DATA_START when no hire date is on file) while ACTIVE. An
  // inactive offshore employee still counts for any month they were marked
  // paid in Offshore Payroll.
  const offshorePaidKeys = new Set(offshorePaid.map((o) => `${o.employeeId}::${utcMonthKey(o.periodStart)}`));
  for (const e of fixedPayEmployees) {
    const hireKey = e.hireDate ? utcMonthKey(e.hireDate) : null;
    // Someone marked Inactive still counts up to the day they were marked
    // (statusChangedAt, Eastern), with that last month prorated by day.
    const leftOn = e.status === "INACTIVE" && e.statusChangedAt ? todayEasternKey(e.statusChangedAt) : null;
    if (!e.isOffshore && e.status === "ACTIVE" && !e.annualSalaryCents) warnings.salaryMissing++;
    for (const key of allKeys) {
      const m = monthOf(key);
      let share = 0;
      if (hireKey && hireKey > key) share = 0;
      else if (e.status === "ACTIVE") share = 1;
      else if (leftOn && leftOn.slice(0, 7) > key) share = 1;
      else if (leftOn && leftOn.slice(0, 7) === key) share = Number(leftOn.slice(8)) / daysInMonth(key);
      if (e.isOffshore) {
        if (offshorePaidKeys.has(`${e.id}::${key}`)) share = 1;
        m.offshoreCents += Math.round((e.offshoreMonthlyRateCents ?? 0) * share);
      } else if (share > 0 && e.annualSalaryCents) {
        const monthly = Math.round((e.annualSalaryCents / 12) * share);
        m.salaryCents += Math.max(0, monthly - (salaryInJobs.get(`${e.id}::${key}`) ?? 0));
      }
    }
  }
  for (const c of commissionPayouts) {
    const key = easternMonthKey(c.paidAt);
    if (months.has(key)) monthOf(key).commissionCents += c.amountCents;
  }
  for (const r of reimbursements) {
    const key = utcMonthKey(r.date);
    if (months.has(key)) monthOf(key).reimbursementCents += r.amountCents;
  }

  for (const m of months.values()) {
    m.grossProfitCents = m.revenueCents - m.laborCents - m.materialCents;
    m.overheadCents = m.salaryCents + m.offshoreCents + m.commissionCents + m.reimbursementCents;
    m.netProfitCents = m.grossProfitCents - m.overheadCents;
  }

  // ── Snapshot ────────────────────────────────────────────────────────────
  const backlog = backlogProjects.filter((p) => !(p.recurringContractPeriodId && !p.turnoverRequestId) && p.contractValueCents);
  const activeContracts = contracts.filter((c) => c.status === "ACTIVE");

  return {
    months: allKeys.map((k) => months.get(k)!),
    jobs,
    currentMonthKey,
    backlogCents: backlog.reduce((s, p) => s + (p.contractValueCents ?? 0), 0),
    backlogJobs: backlog.length,
    recurringMonthlyCents: activeContracts.reduce((s, c) => s + c.monthlyRateCents, 0),
    activeContracts: activeContracts.length,
    warnings,
  };
}

/** Sum a list of months into one total row. */
export function sumMonths(key: string, list: FinanceMonth[]): FinanceMonth {
  const total = emptyMonth(key);
  for (const m of list) {
    total.revenueCents += m.revenueCents;
    total.laborCents += m.laborCents;
    total.materialCents += m.materialCents;
    total.grossProfitCents += m.grossProfitCents;
    total.salaryCents += m.salaryCents;
    total.offshoreCents += m.offshoreCents;
    total.commissionCents += m.commissionCents;
    total.reimbursementCents += m.reimbursementCents;
    total.overheadCents += m.overheadCents;
    total.netProfitCents += m.netProfitCents;
    total.unpaidCents += m.unpaidCents;
    for (const s of FINANCE_SEGMENTS) {
      total.segments[s].revenueCents += m.segments[s].revenueCents;
      total.segments[s].costCents += m.segments[s].costCents;
      total.segments[s].jobs += m.segments[s].jobs;
    }
  }
  return total;
}
