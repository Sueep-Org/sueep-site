/**
 * Company-wide finance numbers for the dashboard's Finance tab.
 *
 * By default revenue is counted in the month the work was completed: a
 * turnover by turnoverCompletedAt (Eastern), any other project by
 * projectEndDate, and a janitorial contract month by its periodStart. The
 * "paid" anchor instead counts only paid work, in the month it was marked
 * paid (Project.billingCompletedAt, RecurringContractPeriod.paidAt), falling
 * back to the completion month when that date wasn't saved.
 *
 * A project's original contract counts when the whole project is COMPLETE.
 * Each change order counts on its own: on its completion day once it's done
 * (even while the project is still open), in the Paid view on its own paid
 * day. A change order that isn't done counts with its project once the
 * project is COMPLETE; until then it's Future, with the open contract.
 *
 * A project with a Schedule of Values counts line by line instead: each SOV
 * line on the day it was marked done (in the Paid view, the day it was marked
 * paid), worth its share of the contract (a line that's 10% of the SOV total
 * is 10% of the contract value, so the lines always add up to the contract).
 * Lines not done yet count when the project is COMPLETE, and until then are
 * Future. Its job costs count on the day they happen (labor on its work day,
 * material on its used-on day, a contractor on its end date), so a month's
 * finished lines sit next to that month's spend. Typed-in totals with no
 * date count when the project is COMPLETE.
 *
 * Job cost (labor, contractors, material) is priced exactly the way the
 * Projects table prices it (projectMargin.ts), so a project's contract and
 * change orders always add up to its total there.
 *
 * Net profit also subtracts overhead: salaries, offshore pay, commission paid
 * out, and reimbursements. Salaried staff also log hours on jobs, and that
 * labor is already in job cost, so only the part of each salary that isn't
 * already in a job that month counts as overhead (otherwise it would be
 * subtracted twice).
 */

import { prisma } from "@/lib/prisma";
import { changeOrderActuals, computeProjectActualsWithChangeOrders, isQualifyingChangeOrder } from "@/lib/erp/projectMargin";
import { costLaborLogs, costManualHours } from "@/lib/erp/laborCost";
import { loadPayHistories, payRateOn } from "@/lib/erp/payRates";
import { laborCostByContract, monthBounds, type ContractLabor } from "@/lib/erp/janitorialProfit";
import { normalizeProjectSegment } from "@/lib/erp/projectSegments";
import { todayEasternAsUtcMidnight, todayEasternKey, utcDateKey } from "@/lib/erp/dates";
import { normalizeBillingStatus } from "@/lib/erp/billingStatus";
import { loadCommissionRows } from "@/lib/erp/commissionRows";

export type FinanceSegment = "POST_CONSTRUCTION" | "TURNOVERS" | "JANITORIAL_CONTRACTS" | "OTHER";

export const FINANCE_SEGMENT_LABELS: Record<FinanceSegment, string> = {
  POST_CONSTRUCTION: "Post-construction",
  TURNOVERS: "Turnovers",
  JANITORIAL_CONTRACTS: "Janitorial contracts",
  OTHER: "Other",
};

export const FINANCE_SEGMENTS: FinanceSegment[] = ["POST_CONSTRUCTION", "TURNOVERS", "JANITORIAL_CONTRACTS", "OTHER"];

export type SegmentTotals = {
  revenueCents: number;
  /** Part of revenueCents from change orders (the rest is the original contract). */
  changeOrderCents: number;
  costCents: number;
  jobs: number;
};

/** Which date puts a job's money in a month: the day the work was finished,
 * or the day it was marked paid. */
export type FinanceAnchor = "completed" | "paid";

export type FinanceMonth = {
  /** "YYYY-MM" */
  key: string;
  revenueCents: number;
  /** Job labor, contractors included. */
  laborCents: number;
  /** Part of laborCents: contractor assignments. */
  contractorCents: number;
  /** Part of laborCents: salaried and offshore staff's time on jobs. */
  salaryInJobsCents: number;
  offshoreInJobsCents: number;
  /** Materials and travel. */
  materialCents: number;
  grossProfitCents: number;
  /** Salary not already in job costs (overhead). */
  salaryCents: number;
  /** Offshore pay not already in job costs (overhead). */
  offshoreCents: number;
  /** Hourly hours added by hand on the Payroll page, not on any job (overhead). */
  manualHourlyCents: number;
  commissionCents: number;
  reimbursementCents: number;
  overheadCents: number;
  netProfitCents: number;
  /** Work finished this month (always by completion month, whatever the
   * anchor), split by where its billing stands today. */
  paidCents: number;
  billedCents: number;
  notBilledCents: number;
  segments: Record<FinanceSegment, SegmentTotals>;
};

/** Where the month's money went, every cost in one list. Adds up to job
 * costs plus overhead. Hourly payroll includes janitorial hours and labor
 * typed on a project with no logs. */
export function costBreakdown(m: FinanceMonth): { label: string; cents: number; hint: string }[] {
  return [
    { label: "Hourly payroll", cents: m.laborCents - m.contractorCents - m.salaryInJobsCents - m.offshoreInJobsCents + m.manualHourlyCents, hint: "Hourly workers on jobs and janitorial shifts, plus hours added by hand on Payroll, overtime included" },
    { label: "Salaries", cents: m.salaryCents + m.salaryInJobsCents, hint: "Salaried staff, including their time on jobs" },
    { label: "Offshore", cents: m.offshoreCents + m.offshoreInJobsCents, hint: "Offshore staff monthly pay" },
    { label: "Commission", cents: m.commissionCents, hint: "Commission and bid bonuses, when marked paid" },
    { label: "Contractors", cents: m.contractorCents, hint: "Contractor assignments on jobs" },
    { label: "Materials and travel", cents: m.materialCents, hint: "Material logs and travel typed on projects" },
    { label: "Reimbursements", cents: m.reimbursementCents, hint: "Expenses, in the month of the expense" },
  ];
}

/** A sold project not finished yet: Active, Upcoming, or On Hold. */
export type FutureJob = {
  id: string;
  title: string;
  status: "ACTIVE" | "UPCOMING" | "ON_HOLD";
  /** Start date, "YYYY-MM-DD", when one is set. */
  startKey: string | null;
  /** Contract value plus change orders that aren't done yet. */
  valueCents: number;
  /** Part of valueCents from change orders that aren't done yet. */
  changeOrderCents: number;
  /** Why it looks finished or stale (dates passed, no recent work), or null. */
  reviewReason: string | null;
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
  /** What was counted for a project in this bucket (absent for a janitorial
   * contract month): its whole contract, how many SOV lines, how many change
   * orders. All zero/false means only costs landed here. */
  parts?: { contract: boolean; sovLines: number; changeOrders: number };
};

/** One commission amount for one person on one day (a deal, a contract
 * month, a bid bonus week, or a payout). */
export type CommissionItem = { personId: string | null; personName: string | null; cents: number; dayKey: string; paid: boolean };

/** Something missing that affects the numbers, with where to fix it. */
export type GapItem = { id: string; label: string; href: string; detail?: string };

/** How far an SOV total can be from its contract value before it's flagged. */
const SOV_MISMATCH_CENTS = 100_000;

export type FinanceSummary = {
  months: FinanceMonth[];
  jobs: FinanceJob[];
  /** Today, "YYYY-MM-DD" (Eastern). */
  todayKey: string;
  /** Current month, "YYYY-MM" (Eastern). */
  currentMonthKey: string;
  /** Contract value of ACTIVE/UPCOMING projects, not yet earned. */
  backlogCents: number;
  backlogJobs: number;
  /** The backlog projects themselves, biggest first (the Future revenue list). */
  futureJobs: FutureJob[];
  /** Sum of ACTIVE janitorial contracts' monthly rate. */
  recurringMonthlyCents: number;
  activeContracts: number;
  /** Earliest start ("YYYY-MM-DD") of an Active janitorial contract that hasn't started yet. */
  nextContractStartKey: string | null;
  /** Commission items, all dates (the Finance tab filters them to its dates). */
  commission: { earned: CommissionItem[]; paid: CommissionItem[] };
  warnings: {
    /** Completed jobs left out because they have no contract value. */
    noContractValue: GapItem[];
    /** Completed jobs left out because they have no end/completion date. */
    noCompletionDate: GapItem[];
    /** Projects whose SOV lines add up to more than $1,000 away from the
     * contract value (each line is scaled to its share of the contract). */
    sovMismatch: GapItem[];
    /** Salaried employees with no salary on file (counted as $0). */
    salaryMissing: GapItem[];
    /** Janitors who worked with no hourly rate set (their hours cost $0). */
    janitorMissingRate: string[];
  };
};

function emptySegments(): Record<FinanceSegment, SegmentTotals> {
  return {
    POST_CONSTRUCTION: { revenueCents: 0, changeOrderCents: 0, costCents: 0, jobs: 0 },
    TURNOVERS: { revenueCents: 0, changeOrderCents: 0, costCents: 0, jobs: 0 },
    JANITORIAL_CONTRACTS: { revenueCents: 0, changeOrderCents: 0, costCents: 0, jobs: 0 },
    OTHER: { revenueCents: 0, changeOrderCents: 0, costCents: 0, jobs: 0 },
  };
}

function emptyMonth(key: string): FinanceMonth {
  return {
    key, revenueCents: 0, laborCents: 0, contractorCents: 0, salaryInJobsCents: 0, offshoreInJobsCents: 0,
    materialCents: 0, grossProfitCents: 0,
    salaryCents: 0, offshoreCents: 0, manualHourlyCents: 0, commissionCents: 0, reimbursementCents: 0,
    overheadCents: 0, netProfitCents: 0, paidCents: 0, billedCents: 0, notBilledCents: 0, segments: emptySegments(),
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

/** Projects that are sold but not finished (Future). */
const FUTURE_STATUSES = ["ACTIVE", "UPCOMING", "ON_HOLD"] as const;

/** How long an Active project can go with no labor logged before it's
 * flagged for review. */
const STALE_DAYS = 60;

/** Why an open project looks finished or stale, or null when it looks fine:
 * its end date has passed, it's Upcoming but its start date has passed, or
 * it's Active with no work logged in STALE_DAYS days. */
function futureReviewReason(
  p: {
    status: string; projectDate: Date | null; projectEndDate: Date | null;
    laborEntries: { workDate: Date }[];
    changeOrders: { completedAt: Date | null; laborers: { workDate: Date }[] }[];
  },
  todayKey: string,
): string | null {
  if (p.projectEndDate && utcDateKey(p.projectEndDate) < todayKey) return "end date passed";
  if (p.status === "UPCOMING" && p.projectDate && utcDateKey(p.projectDate) < todayKey) return "start date passed";
  if (p.status === "ACTIVE") {
    const staleBefore = utcDateKey(new Date(Date.parse(`${todayKey}T00:00:00.000Z`) - STALE_DAYS * 86_400_000));
    // Work on the project or any of its change orders counts as activity.
    const workDays = [
      ...p.laborEntries.map((e) => e.workDate),
      ...p.changeOrders.flatMap((co) => [...co.laborers.map((l) => l.workDate), ...(co.completedAt ? [co.completedAt] : [])]),
    ];
    const lastWork = workDays.reduce<string | null>((max, d) => {
      const k = utcDateKey(d);
      return max == null || k > max ? k : max;
    }, null);
    const since = lastWork ?? (p.projectDate ? utcDateKey(p.projectDate) : null);
    if (since && since < staleBefore) return lastWork ? `no work logged in ${STALE_DAYS}+ days` : "no work logged yet";
  }
  return null;
}

/** Change order statuses that mean the work is done. */
const CHANGE_ORDER_DONE = ["COMPLETED", "BILLING"];

/** The day ("YYYY-MM-DD") of a stored date: a date picked in a form is saved
 * as UTC midnight, an automatic stamp is a real moment (read in Eastern time). */
export function dayKeyOf(d: Date | null): string | null {
  if (!d) return null;
  return d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 ? utcDateKey(d) : todayEasternKey(d);
}

/** The day ("YYYY-MM-DD") a project's work was finished: a turnover by
 * turnoverCompletedAt (Eastern), anything else by projectEndDate. */
function completionDayKey(p: { turnoverCompletedAt: Date | null; projectEndDate: Date | null }): string | null {
  return p.turnoverCompletedAt ? todayEasternKey(p.turnoverCompletedAt) : p.projectEndDate ? utcDateKey(p.projectEndDate) : null;
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


/** First month shown ("YYYY-MM"). The ERP wasn't fully in use until August
 * 2026, so earlier months are missing jobs and costs and would mislead. */
export const FINANCE_DATA_START = "2026-08";

/** Every "YYYY-MM-DD" from `from` to `to`, inclusive. */
function dayKeysBetween(from: string, to: string): string[] {
  const keys: string[] = [];
  for (let d = new Date(`${from}T00:00:00.000Z`); utcDateKey(d) <= to; d = new Date(d.getTime() + 86_400_000)) keys.push(utcDateKey(d));
  return keys;
}

/** The key of the one bucket a custom date range is summed into. */
export const FINANCE_RANGE_KEY = "range";

export type FinanceSummaryOptions = {
  /** First month counted ("YYYY-MM"): FINANCE_DATA_START unless someone
   * picks an earlier month on purpose. */
  startKey?: string;
  /** A custom date range ("YYYY-MM-DD", inclusive). Everything in it is
   * summed into one bucket (FINANCE_RANGE_KEY) instead of months, and days
   * after today are left out. */
  range?: { from: string; to: string };
};

export async function computeFinanceSummary(anchor: FinanceAnchor = "completed", options: FinanceSummaryOptions = {}): Promise<FinanceSummary> {
  const today = todayEasternAsUtcMidnight();
  const todayKey = utcDateKey(today);
  const currentMonthKey = utcMonthKey(today);
  const range = options.range ? { from: options.range.from, to: options.range.to < todayKey ? options.range.to : todayKey } : null;
  const startKey = range ? range.from.slice(0, 7) : (options.startKey ?? FINANCE_DATA_START);
  const dataStart = new Date(`${startKey}-01T00:00:00.000Z`);
  const inRange = (key: string) => key >= startKey && key <= currentMonthKey;
  /** Which bucket a day ("YYYY-MM-DD") belongs to, or null when it's outside the view. */
  const bucketOf = (dayKey: string): string | null =>
    range ? (dayKey >= range.from && dayKey <= range.to ? FINANCE_RANGE_KEY : null) : inRange(dayKey.slice(0, 7)) ? dayKey.slice(0, 7) : null;

  const [allProjects, periods, contracts, fixedPayEmployees, offshorePaid, commissionPayouts, commissionRows, reimbursements] = await Promise.all([
    // Complete projects (their contracts count) plus open ones (their
    // finished change orders count now, the rest is Future).
    prisma.project.findMany({
      where: { status: { in: ["COMPLETE", ...FUTURE_STATUSES] } },
      select: {
        id: true, jobTitle: true, segment: true, status: true, projectDate: true, billingStatus: true, billingCompletedAt: true,
        projectEndDate: true, turnoverCompletedAt: true,
        recurringContractPeriodId: true, turnoverRequestId: true,
        contractValueCents: true, actualLaborCents: true, actualMaterialCents: true, actualTravelCents: true,
        laborEntries: { select: { id: true, employeeId: true, workerName: true, workDate: true, createdAt: true, hours: true, hourlyRateCents: true } },
        materialEntries: { select: { costCents: true, usedOn: true } },
        contractorAssignments: { select: { costCents: true, endDate: true, startDate: true, assignedDate: true, createdAt: true } },
        sov: { select: { items: { select: { id: true, scheduledValueCents: true, completed: true, completedAt: true, billingStatus: true, paidAt: true }, orderBy: [{ order: "asc" }, { createdAt: "asc" }] } } },
        changeOrders: {
          select: {
            id: true, status: true, billingStatus: true, completedAt: true, endDate: true, paidAt: true,
            contractValueCents: true, estimatedCostCents: true,
            actualLaborCents: true, actualMaterialCents: true, actualTravelCents: true,
            materialEntries: { select: { costCents: true } },
            laborers: { select: { id: true, employeeId: true, name: true, workDate: true, createdAt: true, hours: true, hourlyRateCents: true } },
            contractorAssignments: { select: { costCents: true } },
          },
        },
      },
    }),
    // Months that started in range, plus (for the Paid view) earlier months paid in range.
    prisma.recurringContractPeriod.findMany({
      where: anchor === "paid"
        ? { periodStart: { lte: today }, OR: [{ periodStart: { gte: dataStart } }, { paidAt: { gte: range ? new Date(Date.parse(`${range.from}T00:00:00.000Z`) - 86_400_000) : dataStart } }] }
        : { periodStart: { gte: dataStart, lte: range ? new Date(`${range.to}T00:00:00.000Z`) : today } },
      select: {
        id: true, periodStart: true, amountCents: true, billingStatus: true, paidAt: true, recurringContractId: true,
        charges: { select: { amountCents: true } },
        recurringContract: { select: { building: { select: { name: true } } } },
      },
    }),
    prisma.recurringContract.findMany({ select: { status: true, monthlyRateCents: true, startDate: true } }),
    // Anyone paid a salary or offshore rate now or at any point in their pay history.
    prisma.employee.findMany({
      where: {
        OR: [
          { payType: "SALARY", isOffshore: false, isJanitorialContract: false },
          { isOffshore: true },
          { payRates: { some: { OR: [{ payType: "SALARY" }, { isOffshore: true }] } } },
        ],
      },
      select: { id: true, firstName: true, lastName: true, status: true, statusChangedAt: true, payType: true, isOffshore: true, hireDate: true, annualSalaryCents: true },
    }),
    prisma.offshorePayrollPayment.findMany({
      where: { paidAt: { not: null } },
      select: { employeeId: true, periodStart: true },
    }),
    prisma.commissionPayout.findMany({ select: { amountCents: true, paidAt: true, employeeId: true, employee: { select: { firstName: true, lastName: true } } } }),
    loadCommissionRows(),
    prisma.reimbursement.findMany({ select: { amountCents: true, date: true } }),
  ]);

  const months = new Map<string, FinanceMonth>();
  const monthOf = (key: string) => {
    let m = months.get(key);
    if (!m) { m = emptyMonth(key); months.set(key, m); }
    return m;
  };

  const warnings: FinanceSummary["warnings"] = { noContractValue: [], noCompletionDate: [], sovMismatch: [], salaryMissing: [], janitorMissingRate: [] };
  const jobs: FinanceJob[] = [];

  // ── Projects ────────────────────────────────────────────────────────────
  // A recurring contract's own billing placeholder project (older periods
  // only) is left out: that month's revenue is counted from the period below.
  const jobProjects = allProjects
    .filter((p) => !(p.recurringContractPeriodId && !p.turnoverRequestId))
    .map((p) => ({ ...p, changeOrders: p.changeOrders.map((co) => ({ ...co, laborers: co.laborers.map((l) => ({ ...l, workerName: l.name })) })) }));
  const lineCosts = await costLaborLogs(
    jobProjects.flatMap((p) => p.laborEntries),
    jobProjects.flatMap((p) => p.changeOrders.flatMap((co) => co.laborers)),
  );
  const actuals = await computeProjectActualsWithChangeOrders(jobProjects, lineCosts);

  // What salaried and offshore staff's hours already cost inside jobs, per
  // employee per job month, so that part comes back out of their overhead.
  const fixedPayInJobs = new Map<string, number>();
  // One job-list row per project per bucket (its contract and change orders
  // counted there, added together).
  const jobRows = new Map<string, FinanceJob>();

  /** Count one piece of a project: its original contract, one change order,
   * one SOV line, or (with `spent`) one cost on an SOV project, which counts
   * on the day it happened in both views. Each piece has its own billing
   * status and its own dates. */
  const addPiece = (piece: {
    project: (typeof jobProjects)[number];
    isChangeOrder: boolean;
    isSovLine?: boolean;
    valueCents: number;
    laborCents: number;
    contractorCents: number;
    materialCents: number;
    billingStatus: string | null;
    completedDay: string;
    paidDay: string | null;
    laborLogs: { id: string; employeeId: string | null }[];
    spent?: boolean;
  }) => {
    const { project: p, valueCents } = piece;
    const status = normalizeBillingStatus(piece.billingStatus);

    // Billing status buckets always sit on the completion day, whatever the anchor.
    const completedBucket = bucketOf(piece.completedDay);
    if (valueCents && completedBucket) {
      const sm = monthOf(completedBucket);
      if (status === "PAID") sm.paidCents += valueCents;
      else if (status === "BILLED") sm.billedCents += valueCents;
      else sm.notBilledCents += valueCents;
    }

    // Paid view: unpaid pieces aren't counted yet; one paid before its paid
    // date was saved falls back to its completion day.
    if (anchor === "paid" && status !== "PAID" && !piece.spent) return;
    const anchorDay = anchor === "paid" && piece.paidDay && !piece.spent ? piece.paidDay : piece.completedDay;
    const anchorKey = bucketOf(anchorDay);
    if (!anchorKey) return;

    const segment = segmentOf(p.segment);
    const costCents = piece.laborCents + piece.materialCents;
    const m = monthOf(anchorKey);
    m.revenueCents += valueCents;
    m.laborCents += piece.laborCents;
    m.contractorCents += piece.contractorCents;
    m.materialCents += piece.materialCents;
    m.segments[segment].revenueCents += valueCents;
    if (piece.isChangeOrder) m.segments[segment].changeOrderCents += valueCents;
    m.segments[segment].costCents += costCents;

    const rowKey = `${p.id}::${anchorKey}`;
    let row = jobRows.get(rowKey);
    if (!row) {
      row = {
        id: rowKey, href: `/erp/projects/${p.id}`, title: p.jobTitle, monthKey: anchorDay.slice(0, 7), segment,
        revenueCents: 0, costCents: 0, profitCents: 0, parts: { contract: false, sovLines: 0, changeOrders: 0 },
      };
      jobRows.set(rowKey, row);
      m.segments[segment].jobs++;
    }
    row.revenueCents += valueCents;
    row.costCents += costCents;
    if (!piece.spent) {
      if (piece.isChangeOrder) row.parts!.changeOrders++;
      else if (piece.isSovLine) row.parts!.sovLines++;
      else row.parts!.contract = true;
    }
    row.profitCents = row.revenueCents - row.costCents;

    for (const e of piece.laborLogs) {
      const cost = lineCosts.get(e.id);
      if (!e.employeeId || !cost?.fixedPay) continue;
      const key = `${e.employeeId}::${anchorKey}`;
      fixedPayInJobs.set(key, (fixedPayInJobs.get(key) ?? 0) + Math.round(cost.costCents));
    }
  };

  const futureJobs: FutureJob[] = [];
  for (const p of jobProjects) {
    const a = actuals.get(p.id);
    if (!a) continue;
    const isComplete = p.status === "COMPLETE";
    const completedDay = isComplete ? completionDayKey(p) : null;
    let futureChangeOrderCents = 0;
    let futureContractCents = p.contractValueCents ?? 0;
    const sovLines = (p.sov?.items ?? []).filter((l) => l.scheduledValueCents > 0);
    const sovTotal = sovLines.reduce((s, l) => s + l.scheduledValueCents, 0);

    if (sovTotal > 0) {
      // SOV project: each line on its own day, worth its share of the
      // contract (or its own value when there's no contract value). Shares
      // are rounded so they add up to the contract exactly.
      const contractCents = p.contractValueCents ?? sovTotal;
      if (Math.abs(contractCents - sovTotal) > SOV_MISMATCH_CENTS) {
        const usd = (c: number) => `$${Math.round(c / 100).toLocaleString("en-US")}`;
        warnings.sovMismatch.push({ id: p.id, label: p.jobTitle, href: `/erp/projects/${p.id}`, detail: `SOV ${usd(sovTotal)}, contract ${usd(contractCents)}` });
      }
      let runningLines = 0;
      let runningShare = 0;
      let missingDay = false;
      futureContractCents = 0;
      for (const line of sovLines) {
        runningLines += line.scheduledValueCents;
        const upTo = Math.round((contractCents * runningLines) / sovTotal);
        const share = upTo - runningShare;
        runningShare = upTo;
        const day = (line.completed ? dayKeyOf(line.completedAt) : null) ?? completedDay;
        if (!day) {
          if (isComplete) missingDay = true;
          else futureContractCents += share;
          continue;
        }
        addPiece({
          project: p, isChangeOrder: false, isSovLine: true, valueCents: share,
          laborCents: 0, contractorCents: 0, materialCents: 0,
          billingStatus: line.billingStatus, completedDay: day, paidDay: dayKeyOf(line.paidAt),
          laborLogs: [],
        });
      }
      if (missingDay) warnings.noCompletionDate.push({ id: p.id, label: p.jobTitle, href: `/erp/projects/${p.id}` });

      // Its costs, each on the day it happened. Typed-in totals have no
      // date, so they count when the project is Complete.
      const spend = (day: string | null, cents: { labor?: number; contractor?: number; material?: number }, laborLogs: { id: string; employeeId: string | null }[] = []) => {
        const contractorCents = cents.contractor ?? 0;
        if (!day || (cents.labor ?? 0) + contractorCents + (cents.material ?? 0) === 0) return;
        addPiece({
          project: p, isChangeOrder: false, valueCents: 0,
          laborCents: (cents.labor ?? 0) + contractorCents, contractorCents, materialCents: cents.material ?? 0,
          billingStatus: null, completedDay: day, paidDay: null, laborLogs, spent: true,
        });
      };
      if (a.base.laborFromLogs) {
        for (const e of p.laborEntries) {
          spend(dayKeyOf(e.workDate), { labor: Math.round(lineCosts.get(e.id)?.costCents ?? e.hours * e.hourlyRateCents) }, [e]);
        }
      } else {
        spend(completedDay, { labor: a.base.laborCents });
      }
      for (const c of p.contractorAssignments) {
        spend(dayKeyOf(c.endDate ?? c.startDate ?? c.assignedDate ?? c.createdAt), { contractor: c.costCents ?? 0 });
      }
      if (a.base.materialFromLogs) {
        for (const m of p.materialEntries) spend(dayKeyOf(m.usedOn), { material: m.costCents });
      } else {
        spend(completedDay, { material: a.base.materialCents });
      }
      spend(completedDay, { material: a.base.travelCents });
    } else if (isComplete) {
      // The original contract counts when the whole project is finished.
      const gap = { id: p.id, label: p.jobTitle, href: `/erp/projects/${p.id}` };
      if (!a.contractValueCents) warnings.noContractValue.push(gap);
      else if (!completedDay) warnings.noCompletionDate.push(gap);
      else {
        addPiece({
          project: p, isChangeOrder: false, valueCents: p.contractValueCents ?? 0,
          laborCents: a.base.laborCents + a.base.contractorCents, contractorCents: a.base.contractorCents,
          materialCents: a.base.materialCents + a.base.travelCents,
          billingStatus: p.billingStatus, completedDay,
          paidDay: p.billingCompletedAt ? todayEasternKey(p.billingCompletedAt) : null,
          laborLogs: a.base.laborFromLogs ? p.laborEntries : [],
        });
      }
    }

    // Each change order counts on its own completion day, even while its
    // project is still open. One that isn't done counts with its project
    // once the project is Complete, and until then it's Future.
    for (const co of p.changeOrders.filter(isQualifyingChangeOrder)) {
      const c = changeOrderActuals(co, lineCosts);
      const ownDay = CHANGE_ORDER_DONE.includes(co.status) ? dayKeyOf(co.completedAt ?? co.endDate) : null;
      const day = ownDay ?? completedDay;
      if (!day) {
        if (!isComplete) futureChangeOrderCents += c.valueCents;
        continue;
      }
      addPiece({
        project: p, isChangeOrder: true, valueCents: c.valueCents,
        laborCents: c.laborCents, contractorCents: c.contractorCents, materialCents: c.materialCents + c.travelCents,
        billingStatus: co.billingStatus, completedDay: day,
        paidDay: co.paidAt ? todayEasternKey(co.paidAt) : null,
        laborLogs: c.laborFromLogs ? co.laborers : [],
      });
    }

    if (!isComplete) {
      const valueCents = futureContractCents + futureChangeOrderCents;
      if (valueCents > 0) {
        futureJobs.push({
          id: p.id, title: p.jobTitle, status: p.status as FutureJob["status"],
          startKey: p.projectDate ? utcDateKey(p.projectDate) : null,
          valueCents, changeOrderCents: futureChangeOrderCents,
          reviewReason: futureReviewReason(p, todayKey),
        });
      }
    }
  }
  jobs.push(...jobRows.values());
  futureJobs.sort((a, b) => b.valueCents - a.valueCents);

  // ── Janitorial contract months ──────────────────────────────────────────
  // Labor is costed per calendar month (clamped to today for the month in
  // progress, so scheduled-but-not-worked shifts don't count yet, and its
  // revenue counts by days so far to match). With a
  // custom range, a contract month counts only for the days of it inside
  // the range (7 of 31 days is 7/31 of the amount), with labor for just
  // those days. In the Paid view a paid month counts in full on its paid day.
  const laborCache = new Map<string, Awaited<ReturnType<typeof laborCostByContract>>>();
  const laborFor = async (fromDay: string, toDay: string) => {
    const k = `${fromDay}..${toDay}`;
    let v = laborCache.get(k);
    if (!v) {
      v = await laborCostByContract(new Date(`${fromDay}T00:00:00.000Z`), new Date(`${toDay}T00:00:00.000Z`));
      laborCache.set(k, v);
    }
    return v;
  };
  for (const period of periods) {
    const key = utcMonthKey(period.periodStart);
    const { start, end } = monthBounds(period.periodStart);
    const monthFrom = utcDateKey(start);
    const monthTo = utcDateKey(end > today ? today : end);
    const fullCents = period.amountCents + period.charges.reduce((s, c) => s + c.amountCents, 0);
    const status = normalizeBillingStatus(period.billingStatus);

    // The part of this contract month inside the view, and its share of the month.
    let partFrom = monthFrom;
    let partTo = monthTo;
    let share = 1;
    if (range) {
      partFrom = range.from > monthFrom ? range.from : monthFrom;
      partTo = range.to < utcDateKey(end) ? range.to : utcDateKey(end);
      share = partFrom <= partTo ? dayKeysBetween(partFrom, partTo).length / daysInMonth(key) : 0;
      if (partTo > monthTo) partTo = monthTo;
    } else if (!inRange(key)) {
      share = 0;
    } else if (key === currentMonthKey) {
      // The month in progress counts by days so far (10 days into a 31 day
      // month is 10/31), to match its labor, which only counts up to today.
      share = Number(todayKey.slice(8)) / daysInMonth(key);
    }
    const partCents = Math.round(fullCents * share);

    if (partCents > 0) {
      const sm = monthOf(range ? FINANCE_RANGE_KEY : key);
      if (status === "PAID") sm.paidCents += partCents;
      else if (status === "BILLED") sm.billedCents += partCents;
      else sm.notBilledCents += partCents;
    }

    // Paid view: a month paid before paidAt existed falls back to its own month.
    if (anchor === "paid" && status !== "PAID") continue;
    let anchorKey: string | null;
    let revenueCents: number;
    let labor: ContractLabor | undefined;
    if (anchor === "paid") {
      anchorKey = bucketOf(period.paidAt ? todayEasternKey(period.paidAt) : monthFrom);
      revenueCents = fullCents;
      labor = anchorKey ? (await laborFor(monthFrom, monthTo)).get(period.recurringContractId) : undefined;
    } else {
      anchorKey = share > 0 ? (range ? FINANCE_RANGE_KEY : key) : null;
      revenueCents = partCents;
      labor = anchorKey && partFrom <= partTo ? (await laborFor(partFrom, partTo)).get(period.recurringContractId) : undefined;
    }
    if (!anchorKey) continue;

    const costCents = labor?.costCents ?? 0;
    for (const name of labor?.missingRateNames ?? []) {
      if (!warnings.janitorMissingRate.includes(name)) warnings.janitorMissingRate.push(name);
    }
    const m = monthOf(anchorKey);
    m.revenueCents += revenueCents;
    m.laborCents += costCents;
    m.segments.JANITORIAL_CONTRACTS.revenueCents += revenueCents;
    m.segments.JANITORIAL_CONTRACTS.costCents += costCents;
    m.segments.JANITORIAL_CONTRACTS.jobs++;
    jobs.push({
      id: period.id, href: `/erp/janitorial/contracts/${period.recurringContractId}`,
      title: `${period.recurringContract.building.name} (contract)`, monthKey: range ? range.from.slice(0, 7) : anchorKey, segment: "JANITORIAL_CONTRACTS",
      revenueCents, costCents, profitCents: revenueCents - costCents,
    });
  }

  // ── Buckets ─────────────────────────────────────────────────────────────
  // Each month in view with its days (the month in progress only up to
  // today, like its revenue and labor), or the one custom range bucket.
  const bucketDays: [string, string[]][] = range
    ? [[FINANCE_RANGE_KEY, range.from <= range.to ? dayKeysBetween(range.from, range.to) : []]]
    : monthKeysBetween(startKey, currentMonthKey).map((k) => {
        const lastDay = `${k}-${String(daysInMonth(k)).padStart(2, "0")}`;
        return [k, dayKeysBetween(`${k}-01`, lastDay < todayKey ? lastDay : todayKey)];
      });
  const allKeys = bucketDays.map(([k]) => k);
  for (const key of allKeys) monthOf(key);

  // ── Overhead ────────────────────────────────────────────────────────────
  // Salary and offshore pay, day by day from each person's pay history (so a
  // raise or a switch from hourly only counts from when it happened), from
  // their hire date while they're Active. Someone marked Inactive still
  // counts up to the day their status changed. An offshore month marked paid
  // in Offshore Payroll always counts in full. The part already in job costs
  // (fixedPayInJobs) comes back out so it isn't counted twice.
  const histories = await loadPayHistories(fixedPayEmployees.map((e) => e.id));
  const offshorePaidKeys = new Set(offshorePaid.map((o) => `${o.employeeId}::${utcMonthKey(o.periodStart)}`));
  for (const e of fixedPayEmployees) {
    const history = histories.get(e.id);
    const hireKey = e.hireDate ? utcDateKey(e.hireDate) : null;
    const leftOn = e.status === "INACTIVE" && e.statusChangedAt ? todayEasternKey(e.statusChangedAt) : null;
    if (!e.isOffshore && e.payType === "SALARY" && e.status === "ACTIVE" && !e.annualSalaryCents) {
      warnings.salaryMissing.push({ id: e.id, label: `${e.firstName} ${e.lastName}`.trim(), href: `/erp/employees/${e.id}` });
    }
    for (const [key, dayKeys] of bucketDays) {
      const m = monthOf(key);
      let salary = 0;
      let offshore = 0;
      for (const dayKey of dayKeys) {
        const days = daysInMonth(dayKey.slice(0, 7));
        const paidOffshoreMonth = offshorePaidKeys.has(`${e.id}::${dayKey.slice(0, 7)}`);
        const rate = payRateOn(history, dayKey);
        if (!rate) continue;
        const employed = (!hireKey || hireKey <= dayKey) && (e.status === "ACTIVE" || (leftOn != null && dayKey <= leftOn));
        if (rate.isOffshore) {
          if (employed || paidOffshoreMonth) offshore += (rate.offshoreMonthlyRateCents ?? 0) / days;
        } else if (rate.payType === "SALARY" && employed) {
          salary += (rate.annualSalaryCents ?? 0) / 12 / days;
        }
      }
      const inJobs = fixedPayInJobs.get(`${e.id}::${key}`) ?? 0;
      const salaryLeft = Math.max(0, salary - inJobs);
      const offshoreLeft = Math.max(0, offshore - Math.max(0, inJobs - salary));
      m.salaryCents += Math.round(salaryLeft);
      m.offshoreCents += Math.round(offshoreLeft);
      // The same split for the part that's inside job costs.
      m.offshoreInJobsCents += Math.round(Math.min(Math.max(0, inJobs - salary), offshore));
    }
  }
  // Every other cent of salaried/offshore time on jobs counts as salary, so
  // the cost breakdown adds up to exactly job costs plus overhead.
  const fixedPayInJobsByMonth = new Map<string, number>();
  for (const [k, cents] of fixedPayInJobs) {
    const month = k.split("::")[1];
    fixedPayInJobsByMonth.set(month, (fixedPayInJobsByMonth.get(month) ?? 0) + cents);
  }
  for (const m of months.values()) {
    m.salaryInJobsCents = (fixedPayInJobsByMonth.get(m.key) ?? 0) - m.offshoreInJobsCents;
  }
  // Commission paid: payouts (deals and contract months) plus weekly bid
  // bonuses, on the day each was marked paid. The Commission section lists
  // the same items by person.
  const commissionPaid: CommissionItem[] = [
    ...commissionPayouts.map((c) => ({
      personId: c.employeeId, personName: `${c.employee.firstName} ${c.employee.lastName}`.trim(),
      cents: c.amountCents, dayKey: todayEasternKey(c.paidAt), paid: true,
    })),
    ...commissionRows.bidBonuses.filter((b) => b.paidAt && b.bonusCents > 0).map((b) => ({
      personId: b.employeeId, personName: b.employeeName,
      cents: b.bonusCents, dayKey: todayEasternKey(new Date(b.paidAt!)), paid: true,
    })),
  ];
  for (const c of commissionPaid) {
    const key = bucketOf(c.dayKey);
    if (key) monthOf(key).commissionCents += c.cents;
  }
  // Commission earned, on the day it became due (a deal once it and its
  // change orders are paid, a contract month once it's paid, a bid bonus
  // for its week), whether or not it's been paid out yet.
  const commissionEarned: CommissionItem[] = [
    ...commissionRows.deals.filter((d) => d.commissionCents > 0).map((d) => ({
      personId: d.ownerId, personName: d.ownerName, cents: d.commissionCents,
      dayKey: dayKeyOf(new Date(d.completedAt))!, paid: d.paidAt != null,
    })),
    ...commissionRows.recurring.filter((r) => r.commissionCents > 0).map((r) => ({
      personId: r.ownerId, personName: r.ownerName, cents: r.commissionCents,
      dayKey: r.periodStart.slice(0, 10), paid: r.paidAt != null,
    })),
    ...commissionRows.bidBonuses.filter((b) => b.bonusCents > 0).map((b) => ({
      personId: b.employeeId, personName: b.employeeName, cents: b.bonusCents,
      dayKey: b.weekStart.slice(0, 10), paid: b.paidAt != null,
    })),
  ];
  // Hourly work added by hand on Payroll (not on any job), on its work day.
  const manualHours = await costManualHours(dataStart, range ? new Date(`${range.to}T00:00:00.000Z`) : today);
  for (const h of manualHours) {
    const key = bucketOf(h.dateKey);
    if (key) monthOf(key).manualHourlyCents += h.costCents;
  }
  for (const r of reimbursements) {
    const key = bucketOf(utcDateKey(r.date));
    if (key) monthOf(key).reimbursementCents += r.amountCents;
  }

  for (const m of months.values()) {
    m.grossProfitCents = m.revenueCents - m.laborCents - m.materialCents;
    m.overheadCents = m.salaryCents + m.offshoreCents + m.manualHourlyCents + m.commissionCents + m.reimbursementCents;
    m.netProfitCents = m.grossProfitCents - m.overheadCents;
  }

  // ── Snapshot ────────────────────────────────────────────────────────────
  const activeContracts = contracts.filter((c) => c.status === "ACTIVE");

  return {
    months: allKeys.map((k) => months.get(k)!),
    jobs,
    todayKey,
    currentMonthKey,
    backlogCents: futureJobs.reduce((s, j) => s + j.valueCents, 0),
    backlogJobs: futureJobs.length,
    futureJobs,
    recurringMonthlyCents: activeContracts.reduce((s, c) => s + c.monthlyRateCents, 0),
    activeContracts: activeContracts.length,
    nextContractStartKey: activeContracts
      .map((c) => (c.startDate ? utcDateKey(c.startDate) : null))
      .filter((k): k is string => k != null && k > todayKey)
      .sort()[0] ?? null,
    warnings,
    commission: { earned: commissionEarned, paid: commissionPaid },
  };
}

/** Sum a list of months into one total row. */
export function sumMonths(key: string, list: FinanceMonth[]): FinanceMonth {
  const total = emptyMonth(key);
  for (const m of list) {
    total.revenueCents += m.revenueCents;
    total.laborCents += m.laborCents;
    total.contractorCents += m.contractorCents;
    total.salaryInJobsCents += m.salaryInJobsCents;
    total.offshoreInJobsCents += m.offshoreInJobsCents;
    total.materialCents += m.materialCents;
    total.grossProfitCents += m.grossProfitCents;
    total.salaryCents += m.salaryCents;
    total.offshoreCents += m.offshoreCents;
    total.manualHourlyCents += m.manualHourlyCents;
    total.commissionCents += m.commissionCents;
    total.reimbursementCents += m.reimbursementCents;
    total.overheadCents += m.overheadCents;
    total.netProfitCents += m.netProfitCents;
    total.paidCents += m.paidCents;
    total.billedCents += m.billedCents;
    total.notBilledCents += m.notBilledCents;
    for (const s of FINANCE_SEGMENTS) {
      total.segments[s].revenueCents += m.segments[s].revenueCents;
      total.segments[s].costCents += m.segments[s].costCents;
      total.segments[s].jobs += m.segments[s].jobs;
      total.segments[s].changeOrderCents += m.segments[s].changeOrderCents;
    }
  }
  return total;
}
