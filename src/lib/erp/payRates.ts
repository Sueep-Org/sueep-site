/**
 * Pay-rate history. Employee only holds current pay, so anything that prices
 * past work (payroll for an old period, job costs, janitorial profit, the
 * Finance tab) looks up what the person earned on that day here instead.
 *
 * Each EmployeePayRate row applies from its effectiveFrom until the next
 * row. A date before the first row uses the first row (the earliest pay on
 * file). An employee with no rows at all falls back to their current
 * Employee fields.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { todayEasternKey, utcDateKey } from "@/lib/erp/dates";

/** A standard full-time year (40 hours x 52 weeks). A salaried or offshore
 * person's time on a job is costed at their yearly pay divided by this. */
export const STANDARD_ANNUAL_HOURS = 2080;

export type PayRate = {
  /** "YYYY-MM-DD" */
  effectiveFrom: string;
  /** HOURLY | SALARY */
  payType: string;
  hourlyPayCents: number | null;
  annualSalaryCents: number | null;
  isOffshore: boolean;
  offshoreMonthlyRateCents: number | null;
};

type CurrentPay = {
  id: string;
  payType: string;
  hourlyPayCents: number | null;
  annualSalaryCents: number | null;
  isOffshore: boolean;
  offshoreMonthlyRateCents: number | null;
};

export type PayHistories = Map<string, PayRate[]>;

/** Every listed employee's pay history, oldest first. Employees with no rows
 * get one synthetic row built from their current pay. */
export async function loadPayHistories(employeeIds: string[]): Promise<PayHistories> {
  const ids = Array.from(new Set(employeeIds));
  const result: PayHistories = new Map();
  if (ids.length === 0) return result;
  const [rows, employees] = await Promise.all([
    prisma.employeePayRate.findMany({ where: { employeeId: { in: ids } }, orderBy: { effectiveFrom: "asc" } }),
    prisma.employee.findMany({
      where: { id: { in: ids } },
      select: { id: true, payType: true, hourlyPayCents: true, annualSalaryCents: true, isOffshore: true, offshoreMonthlyRateCents: true },
    }),
  ]);
  for (const r of rows) {
    const list = result.get(r.employeeId) ?? [];
    list.push({
      effectiveFrom: utcDateKey(r.effectiveFrom),
      payType: r.payType,
      hourlyPayCents: r.hourlyPayCents,
      annualSalaryCents: r.annualSalaryCents,
      isOffshore: r.isOffshore,
      offshoreMonthlyRateCents: r.offshoreMonthlyRateCents,
    });
    result.set(r.employeeId, list);
  }
  for (const e of employees) {
    if (!result.has(e.id)) result.set(e.id, [currentAsRate(e)]);
  }
  return result;
}

function payValuesOf(e: Omit<CurrentPay, "id">): PayValues {
  return {
    payType: e.payType,
    hourlyPayCents: e.hourlyPayCents,
    annualSalaryCents: e.annualSalaryCents,
    isOffshore: e.isOffshore,
    offshoreMonthlyRateCents: e.offshoreMonthlyRateCents,
  };
}

function currentAsRate(e: Omit<CurrentPay, "id">): PayRate {
  return { effectiveFrom: "0000-01-01", ...payValuesOf(e) };
}

/** The pay in effect on a "YYYY-MM-DD" day. */
export function payRateOn(history: PayRate[] | undefined, dateKey: string): PayRate | null {
  if (!history || history.length === 0) return null;
  let found = history[0];
  for (const r of history) {
    if (r.effectiveFrom <= dateKey) found = r;
    else break;
  }
  return found;
}

/** Paid a fixed amount (salary or offshore monthly), not by the hour. */
export function isFixedPay(rate: PayRate | null): boolean {
  return !!rate && (rate.payType === "SALARY" || rate.isOffshore);
}

/** What an hour of a salaried or offshore person's time costs on a job. */
export function fixedPayHourlyCostCents(rate: PayRate): number {
  if (rate.isOffshore) return ((rate.offshoreMonthlyRateCents ?? 0) * 12) / STANDARD_ANNUAL_HOURS;
  return (rate.annualSalaryCents ?? 0) / STANDARD_ANNUAL_HOURS;
}

export type PayValues = Omit<PayRate, "effectiveFrom">;

export function samePay(a: PayValues, b: PayValues): boolean {
  return (
    a.payType === b.payType &&
    (a.hourlyPayCents ?? null) === (b.hourlyPayCents ?? null) &&
    (a.annualSalaryCents ?? null) === (b.annualSalaryCents ?? null) &&
    a.isOffshore === b.isOffshore &&
    (a.offshoreMonthlyRateCents ?? null) === (b.offshoreMonthlyRateCents ?? null)
  );
}

/**
 * Records a pay change effective on `effectiveFrom` ("YYYY-MM-DD", not in the
 * future) and re-syncs the employee's current pay fields to whichever row is
 * in effect today. If the employee has no history yet, their pay before the
 * change is saved first (from their hire date, or the day they were added),
 * so the old rate isn't lost.
 */
export async function recordPayChange(
  tx: Prisma.TransactionClient,
  employee: CurrentPay & { hireDate: Date | null; createdAt: Date },
  next: PayValues,
  effectiveFrom: string,
  changedBy: string | null,
): Promise<void> {
  const existingCount = await tx.employeePayRate.count({ where: { employeeId: employee.id } });
  if (existingCount === 0) {
    const baselineKey = employee.hireDate ? utcDateKey(employee.hireDate) : todayEasternKey(employee.createdAt);
    if (baselineKey < effectiveFrom && !samePay(payValuesOf(employee), next)) {
      await tx.employeePayRate.create({
        data: { employeeId: employee.id, effectiveFrom: new Date(`${baselineKey}T00:00:00.000Z`), ...payValuesOf(employee), changedBy: null },
      });
    }
  }

  const at = new Date(`${effectiveFrom}T00:00:00.000Z`);
  await tx.employeePayRate.upsert({
    where: { employeeId_effectiveFrom: { employeeId: employee.id, effectiveFrom: at } },
    create: { employeeId: employee.id, effectiveFrom: at, ...next, changedBy },
    update: { ...next, changedBy },
  });

  const current = await tx.employeePayRate.findFirst({
    where: { employeeId: employee.id, effectiveFrom: { lte: new Date(`${todayEasternKey()}T00:00:00.000Z`) } },
    orderBy: { effectiveFrom: "desc" },
  });
  if (current) {
    await tx.employee.update({
      where: { id: employee.id },
      data: {
        payType: current.payType,
        hourlyPayCents: current.hourlyPayCents,
        annualSalaryCents: current.annualSalaryCents,
        isOffshore: current.isOffshore,
        offshoreMonthlyRateCents: current.offshoreMonthlyRateCents,
      },
    });
  }
}

/** Starting pay for a brand-new employee. */
export async function recordInitialPay(
  tx: Prisma.TransactionClient,
  employee: CurrentPay & { hireDate: Date | null; createdAt: Date },
  changedBy: string | null,
): Promise<void> {
  const key = employee.hireDate ? utcDateKey(employee.hireDate) : todayEasternKey(employee.createdAt);
  await tx.employeePayRate.create({
    data: { employeeId: employee.id, effectiveFrom: new Date(`${key}T00:00:00.000Z`), ...payValuesOf(employee), changedBy },
  });
}
