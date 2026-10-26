/**
 * Employer payroll tax for each row of a pay period on the Payroll page,
 * and day by day for the Finance dashboard.
 *
 * Taxed: employees on ADP payroll (Employee.onAdpPayroll), on their gross
 * pay plus commission. Not taxed: contractors, typed-in workers with no
 * employee profile, and offshore workers (who never get payroll rows).
 *
 * The yearly caps need what each person was paid earlier in the year, so
 * the periods before this one are added up live from ERP payroll. "The
 * year" starts with the pay period holding January 1st, so a period
 * running over New Year counts toward the year it's paid in.
 */

import { prisma } from "@/lib/prisma";
import { computePayrollRows, endOfDay, type PayrollRow } from "@/lib/erp/payrollRows";
import { DEFAULT_PAYROLL_ANCHOR, TWO_WEEKS_MS, payPeriodForDay } from "@/lib/erp/payPeriods";
import { fillRepeatingManualHours } from "@/lib/erp/manualHoursRepeat";
import { EMPLOYER_TAX_SETTING_KEY, employerTaxOn, parseEmployerTaxRates, type EmployerTax } from "@/lib/erp/employerTax";

const DAY_MS = 24 * 60 * 60 * 1000;

function taxablePay(row: PayrollRow): number {
  return row.grossPayCents + (row.commissionCents ?? 0);
}

/** Employer tax per employeeId for the given rows of [periodStart, periodEnd]. */
export async function employerTaxByEmployee(
  rows: PayrollRow[],
  periodStart: Date,
  periodEnd: Date,
): Promise<Map<string, EmployerTax>> {
  const ids = Array.from(new Set(rows.filter((r) => !r.isContractor && r.employeeId).map((r) => r.employeeId as string)));
  if (ids.length === 0) return new Map();

  const [rateSetting, anchorSetting, taxedEmployees] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: EMPLOYER_TAX_SETTING_KEY } }),
    prisma.appSetting.findUnique({ where: { key: "payrollAnchor" } }),
    prisma.employee.findMany({ where: { id: { in: ids }, onAdpPayroll: true, isOffshore: false }, select: { id: true } }),
  ]);
  const rates = parseEmployerTaxRates(rateSetting?.value);
  const taxed = new Set(taxedEmployees.map((e) => e.id));
  if (taxed.size === 0) return new Map();

  // W2 pay earlier this year: every period from the one holding Jan 1 up to this one.
  const year = periodEnd.getUTCFullYear();
  const yearStart = payPeriodForDay(`${year}-01-01`, anchorSetting?.value ?? DEFAULT_PAYROLL_ANCHOR).start;
  const paidBefore = new Map<string, number>();
  if (yearStart < periodStart) {
    const earlier = await computePayrollRows(yearStart, endOfDay(new Date(periodStart.getTime() - DAY_MS)));
    for (const r of earlier) {
      if (r.isContractor || !r.employeeId || !taxed.has(r.employeeId)) continue;
      paidBefore.set(r.employeeId, (paidBefore.get(r.employeeId) ?? 0) + taxablePay(r));
    }
  }

  const out = new Map<string, EmployerTax>();
  for (const r of rows) {
    if (r.isContractor || !r.employeeId || !taxed.has(r.employeeId)) continue;
    out.set(r.employeeId, employerTaxOn(taxablePay(r), paidBefore.get(r.employeeId) ?? 0, rates));
  }
  return out;
}

/** The rows with each person's employer tax attached (employerTax is null when none applies). */
export async function withEmployerTax(rows: PayrollRow[], periodStart: Date, periodEnd: Date) {
  const taxes = await employerTaxByEmployee(rows, periodStart, periodEnd);
  return rows.map((r) => ({ ...r, employerTax: (r.employeeId && taxes.get(r.employeeId)) || null }));
}

/**
 * Employer tax for every pay period touching [fromKey, toKey], spread evenly
 * over each period's days up to todayKey (like salaries on Finance), as
 * cents per "YYYY-MM-DD". The period in progress counts what's been paid so
 * far over the days so far. Each period is priced like the Payroll page,
 * with the yearly caps carried from one period to the next.
 */
export async function employerTaxByDay(fromKey: string, toKey: string, todayKey: string): Promise<Map<string, number>> {
  const byDay = new Map<string, number>();
  if (fromKey > toKey) return byDay;
  const [rateSetting, anchorSetting, taxedEmployees] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: EMPLOYER_TAX_SETTING_KEY } }),
    prisma.appSetting.findUnique({ where: { key: "payrollAnchor" } }),
    prisma.employee.findMany({ where: { onAdpPayroll: true, isOffshore: false }, select: { id: true } }),
  ]);
  const rates = parseEmployerTaxRates(rateSetting?.value);
  const anchor = anchorSetting?.value ?? DEFAULT_PAYROLL_ANCHOR;
  const taxed = new Set(taxedEmployees.map((e) => e.id));
  const lastKey = toKey < todayKey ? toKey : todayKey;

  const periods: { start: Date; end: Date }[] = [];
  for (let p = payPeriodForDay(fromKey, anchor); p.start.toISOString().slice(0, 10) <= lastKey; ) {
    periods.push(p);
    p = { start: new Date(p.start.getTime() + TWO_WEEKS_MS), end: new Date(p.end.getTime() + TWO_WEEKS_MS) };
  }
  if (periods.length === 0) return byDay;

  const addPay = (into: Map<string, number>, rows: PayrollRow[]) => {
    for (const r of rows) {
      if (r.isContractor || !r.employeeId || !taxed.has(r.employeeId)) continue;
      into.set(r.employeeId, (into.get(r.employeeId) ?? 0) + taxablePay(r));
    }
  };

  // W2 pay earlier in the first period's year, before the view starts.
  let year = periods[0].end.getUTCFullYear();
  let paidBefore = new Map<string, number>();
  const yearStart = payPeriodForDay(`${year}-01-01`, anchor).start;
  if (yearStart < periods[0].start) {
    addPay(paidBefore, await computePayrollRows(yearStart, endOfDay(new Date(periods[0].start.getTime() - DAY_MS))));
  }

  // A few periods at a time, so Finance doesn't open dozens of queries at once.
  // Repeating manual hours are filled once first: each payroll run fills
  // them too, and parallel fills could move a repeat's filled-through date
  // back and bring back a repeat someone removed.
  await fillRepeatingManualHours(periods[periods.length - 1].end);
  const rowsByPeriod: PayrollRow[][] = [];
  for (let i = 0; i < periods.length; i += 3) {
    rowsByPeriod.push(...(await Promise.all(periods.slice(i, i + 3).map((p) => computePayrollRows(p.start, endOfDay(p.end))))));
  }

  periods.forEach((p, i) => {
    if (p.end.getUTCFullYear() !== year) {
      year = p.end.getUTCFullYear();
      paidBefore = new Map();
    }
    let total = 0;
    for (const r of rowsByPeriod[i]) {
      if (r.isContractor || !r.employeeId || !taxed.has(r.employeeId)) continue;
      total += employerTaxOn(taxablePay(r), paidBefore.get(r.employeeId) ?? 0, rates).totalCents;
    }
    addPay(paidBefore, rowsByPeriod[i]);
    const days: string[] = [];
    for (let d = new Date(p.start); d <= p.end; d = new Date(d.getTime() + DAY_MS)) {
      const key = d.toISOString().slice(0, 10);
      if (key <= todayKey) days.push(key);
    }
    for (const key of days) byDay.set(key, (byDay.get(key) ?? 0) + total / days.length);
  });
  return byDay;
}
