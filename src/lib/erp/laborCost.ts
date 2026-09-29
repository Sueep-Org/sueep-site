/**
 * The one rule for what a worker's hours cost. Payroll, job costs (Projects
 * table, project and change order pages, dashboard margins, commission), the
 * Finance tab, and janitorial contract profit all use it, so a job's labor
 * cost adds up to exactly what payroll pays for the same hours.
 *
 * Per worker, per Monday-to-Sunday week, across every kind of work they did
 * (project labor logs, change order labor, janitorial shifts):
 *
 * - Hourly pay: each line costs its hours times its rate. A labor log uses the
 *   rate typed on it; a janitorial shift uses the worker's hourly pay on that
 *   day (see payRates.ts). If the week's hourly hours pass 40, the hours past
 *   40 (in date order) also earn an overtime premium of half the week's
 *   average hourly rate. That's the federal "regular rate" method, and it's
 *   the same as 1.5x when the worker had one rate all week.
 * - Salary or offshore pay on that day: payroll pays them a fixed amount, so
 *   their time on a job costs their yearly pay divided by 2,080 hours, whatever
 *   rate was typed on the log. Hours past 40 in a week cost nothing extra.
 */

import { prisma } from "@/lib/prisma";
import { utcDateKey } from "@/lib/erp/dates";
import { loadJanitorialHours } from "@/lib/erp/janitorialHoursServer";
import type { ResolvedShiftHours } from "@/lib/erp/janitorialHours";
import { fixedPayHourlyCostCents, isFixedPay, loadPayHistories, payRateOn, type PayHistories } from "@/lib/erp/payRates";

export const OT_THRESHOLD_HOURS = 40;
const OT_PREMIUM = 0.5;

export type WorkSource = "project" | "changeOrder" | "janitorial";

export type WorkLine = {
  /** Labor log id, change order laborer id, or `jan:<shift key>` for a janitorial shift. */
  id: string;
  source: WorkSource;
  employeeId: string | null;
  /** Typed-in name, used to group a worker with no employee record. */
  workerName: string | null;
  /** "YYYY-MM-DD" */
  dateKey: string;
  hours: number;
  /** Rate typed on the log, in cents. Null for janitorial shifts (priced from pay history). */
  loggedRateCents: number | null;
  /** Tie-breaker for date order within a day. */
  createdAtMs: number;
};

export type LineCost = {
  regHours: number;
  otHours: number;
  /** Hours times rate, before any overtime premium. */
  straightCents: number;
  premiumCents: number;
  /** straightCents + premiumCents */
  costCents: number;
  /** Paid a salary or offshore rate that day (payroll pays them a fixed amount). */
  fixedPay: boolean;
  /** The hourly rate used, in cents. */
  rateCents: number;
};

function mondayKey(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00.000Z`);
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return utcDateKey(d);
}

function workerKey(line: WorkLine): string {
  if (line.employeeId) return line.employeeId;
  return line.workerName ? `name:${line.workerName.trim().toLowerCase()}` : `line:${line.id}`;
}

/** Costs every line. Pass all of a worker's lines for each week you care
 * about, since overtime depends on the whole week. */
export function costWorkLines(lines: WorkLine[], histories: PayHistories): Map<string, LineCost> {
  const buckets = new Map<string, WorkLine[]>();
  for (const line of lines) {
    const key = `${workerKey(line)}::${mondayKey(line.dateKey)}`;
    const list = buckets.get(key) ?? [];
    list.push(line);
    buckets.set(key, list);
  }

  const result = new Map<string, LineCost>();
  for (const bucket of buckets.values()) {
    bucket.sort((a, b) => (a.dateKey !== b.dateKey ? a.dateKey.localeCompare(b.dateKey) : a.createdAtMs - b.createdAtMs));

    const priced = bucket.map((line) => {
      const rate = line.employeeId ? payRateOn(histories.get(line.employeeId), line.dateKey) : null;
      if (isFixedPay(rate)) return { line, fixed: true, rateCents: fixedPayHourlyCostCents(rate!) };
      return { line, fixed: false, rateCents: line.loggedRateCents ?? rate?.hourlyPayCents ?? 0 };
    });

    const hourly = priced.filter((p) => !p.fixed);
    const hourlyHours = hourly.reduce((s, p) => s + p.line.hours, 0);
    const hourlyStraight = hourly.reduce((s, p) => s + p.line.hours * p.rateCents, 0);
    const premiumPerOtHour = hourlyHours > OT_THRESHOLD_HOURS ? (hourlyStraight / hourlyHours) * OT_PREMIUM : 0;

    let hourlyCumulative = 0;
    let fixedCumulative = 0;
    for (const p of priced) {
      const hours = p.line.hours;
      if (p.fixed) {
        const reg = Math.max(0, Math.min(hours, OT_THRESHOLD_HOURS - fixedCumulative));
        fixedCumulative += hours;
        const straight = reg * p.rateCents;
        result.set(p.line.id, { regHours: reg, otHours: 0, straightCents: straight, premiumCents: 0, costCents: straight, fixedPay: true, rateCents: p.rateCents });
        continue;
      }
      const reg = Math.max(0, Math.min(hours, OT_THRESHOLD_HOURS - hourlyCumulative));
      const ot = hours - reg;
      hourlyCumulative += hours;
      const straight = hours * p.rateCents;
      const premium = ot * premiumPerOtHour;
      result.set(p.line.id, { regHours: reg, otHours: ot, straightCents: straight, premiumCents: premium, costCents: straight + premium, fixedPay: false, rateCents: p.rateCents });
    }
  }
  return result;
}

/** A janitorial shift as a work line. */
export function janitorialWorkLine(r: ResolvedShiftHours): WorkLine {
  return {
    id: `jan:${r.key}`,
    source: "janitorial",
    employeeId: r.employeeId,
    workerName: r.employeeName,
    dateKey: r.date,
    hours: r.hours,
    loggedRateCents: null,
    createdAtMs: 0,
  };
}

type LogLike = {
  id: string;
  employeeId: string | null;
  workDate: Date;
  hours: number;
  hourlyRateCents: number;
  createdAt: Date;
  /** LaborEntry.workerName / ProjectChangeOrderLaborer.name */
  workerName?: string | null;
};

function logLine(e: LogLike, source: WorkSource): WorkLine {
  return {
    id: e.id,
    source,
    employeeId: e.employeeId,
    workerName: e.workerName ?? null,
    dateKey: utcDateKey(e.workDate),
    hours: e.hours,
    loggedRateCents: e.hourlyRateCents,
    createdAtMs: e.createdAt.getTime(),
  };
}

/** Every line of work for these workers in [start, end] (UTC-midnight labels,
 * inclusive): project logs, change order logs, and janitorial shifts. */
async function loadWorkLines(employeeIds: string[], workerNames: string[], start: Date, end: Date, preloadedJanitorial?: ResolvedShiftHours[]): Promise<WorkLine[]> {
  const endOfDay = new Date(end);
  endOfDay.setUTCHours(23, 59, 59, 999);
  const who = [
    ...(employeeIds.length ? [{ employeeId: { in: employeeIds } }] : []),
    ...(workerNames.length ? [{ employeeId: null, workerName: { in: workerNames } }] : []),
  ];
  const coWho = [
    ...(employeeIds.length ? [{ employeeId: { in: employeeIds } }] : []),
    ...(workerNames.length ? [{ employeeId: null, name: { in: workerNames } }] : []),
  ];
  if (who.length === 0) return [];

  const [projectLogs, coLogs, janitorial] = await Promise.all([
    prisma.laborEntry.findMany({
      where: { workDate: { gte: start, lte: endOfDay }, OR: who },
      select: { id: true, employeeId: true, workerName: true, workDate: true, hours: true, hourlyRateCents: true, createdAt: true },
    }),
    prisma.projectChangeOrderLaborer.findMany({
      where: { workDate: { gte: start, lte: endOfDay }, OR: coWho },
      select: { id: true, employeeId: true, name: true, workDate: true, hours: true, hourlyRateCents: true, createdAt: true },
    }),
    preloadedJanitorial ?? loadJanitorialFor(employeeIds, start, end),
  ]);

  const ids = new Set(employeeIds);
  return [
    ...projectLogs.map((e) => logLine(e, "project")),
    ...coLogs.map((e) => logLine({ ...e, workerName: e.name }, "changeOrder")),
    ...janitorial.filter((r) => ids.has(r.employeeId) && r.hours > 0).map(janitorialWorkLine),
  ];
}

/** Janitorial shifts for these employees, skipping the (slower) shift
 * resolution entirely when none of them has janitorial work in the range. */
async function loadJanitorialFor(employeeIds: string[], start: Date, end: Date): Promise<ResolvedShiftHours[]> {
  if (employeeIds.length === 0) return [];
  const [patterns, entries] = await Promise.all([
    prisma.janitorialShiftPattern.count({
      where: { employeeId: { in: employeeIds }, effectiveFrom: { lte: end }, OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: start } }] },
    }),
    prisma.janitorialTimeEntry.count({ where: { employeeId: { in: employeeIds }, date: { gte: start, lte: end } } }),
  ]);
  if (patterns === 0 && entries === 0) return [];
  return loadJanitorialHours(start, end);
}

/** Monday on or before the earliest date, Sunday on or after the latest. */
function weekSpan(dateKeys: string[]): { start: Date; end: Date } {
  const sorted = [...dateKeys].sort();
  const start = new Date(`${mondayKey(sorted[0])}T00:00:00.000Z`);
  const end = new Date(`${mondayKey(sorted[sorted.length - 1])}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 6);
  return { start, end };
}

/**
 * Costs a set of labor logs (project and/or change order) the one shared way.
 * Loads each worker's other work in the same weeks, since overtime depends on
 * the whole week, not just these logs.
 */
export async function costLaborLogs(
  projectLogs: LogLike[],
  changeOrderLogs: LogLike[] = [],
): Promise<Map<string, LineCost>> {
  const view = [...projectLogs.map((e) => logLine(e, "project")), ...changeOrderLogs.map((e) => logLine(e, "changeOrder"))];
  if (view.length === 0) return new Map();
  const employeeIds = Array.from(new Set(view.map((l) => l.employeeId).filter((id): id is string => !!id)));
  const workerNames = Array.from(new Set(view.filter((l) => !l.employeeId && l.workerName).map((l) => l.workerName!)));
  const { start, end } = weekSpan(view.map((l) => l.dateKey));

  const [allLines, histories] = await Promise.all([
    loadWorkLines(employeeIds, workerNames, start, end),
    loadPayHistories(employeeIds),
  ]);
  // Logs from the view that the week query didn't return (a typed-in name
  // with no match, say) still get costed on their own.
  const loadedIds = new Set(allLines.map((l) => l.id));
  const lines = [...allLines, ...view.filter((l) => !loadedIds.has(l.id))];
  return costWorkLines(lines, histories);
}

/** Total cost of some logs, from a costLaborLogs result. */
export function sumLineCosts(logs: { id: string; hours: number; hourlyRateCents: number }[], costs: Map<string, LineCost>): number {
  return Math.round(logs.reduce((s, e) => s + (costs.get(e.id)?.costCents ?? e.hours * e.hourlyRateCents), 0));
}

export type JanitorialLaborByContract = Map<string, { hours: number; costCents: number; missingRateNames: string[] }>;

/**
 * Janitorial labor per contract for [start, end] (UTC-midnight labels,
 * inclusive), priced with the shared rule, so a janitor's overtime is included
 * the same way payroll pays it.
 */
export async function costJanitorialByContract(start: Date, end: Date): Promise<JanitorialLaborByContract> {
  // Overtime depends on the whole week, so price the full weeks around the range.
  const span = weekSpan([utcDateKey(start), utcDateKey(end)]);
  const shifts = (await loadJanitorialHours(span.start, span.end)).filter((r) => r.hours > 0);
  const employeeIds = Array.from(new Set(shifts.map((r) => r.employeeId)));
  const [lines, histories] = await Promise.all([
    loadWorkLines(employeeIds, [], span.start, span.end, shifts),
    loadPayHistories(employeeIds),
  ]);
  const costs = costWorkLines(lines, histories);

  const startKey = utcDateKey(start);
  const endKey = utcDateKey(end);
  const byContract: JanitorialLaborByContract = new Map();
  for (const r of shifts) {
    if (r.date < startKey || r.date > endKey) continue;
    const cost = costs.get(`jan:${r.key}`);
    const entry = byContract.get(r.contractId) ?? { hours: 0, costCents: 0, missingRateNames: [] };
    entry.hours += r.hours;
    entry.costCents += Math.round(cost?.costCents ?? 0);
    if (cost && !cost.fixedPay && cost.rateCents === 0 && !entry.missingRateNames.includes(r.employeeName)) entry.missingRateNames.push(r.employeeName);
    byContract.set(r.contractId, entry);
  }
  return byContract;
}
