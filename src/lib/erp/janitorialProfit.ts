/**
 * Janitorial contract profit: labor cost per building from the same resolved
 * hours payroll pays (clocked, corrected, or scheduled fallback, after the
 * unpaid break), priced at each janitor's current hourly rate. Overtime
 * premium isn't split across buildings, so this is straight-time cost.
 */

import { prisma } from "@/lib/prisma";
import { loadJanitorialHours } from "@/lib/erp/janitorialHoursServer";

export type ContractLabor = {
  hours: number;
  costCents: number;
  /** Janitors who worked here with no hourly rate set, so their hours cost $0 here. */
  missingRateNames: string[];
};

/** Labor per contract for [start, end] (UTC-midnight labels, inclusive, up to 31 days). */
export async function laborCostByContract(start: Date, end: Date): Promise<Map<string, ContractLabor>> {
  const rows = (await loadJanitorialHours(start, end)).filter((r) => r.hours > 0);
  const employeeIds = Array.from(new Set(rows.map((r) => r.employeeId)));
  const employees = employeeIds.length
    ? await prisma.employee.findMany({ where: { id: { in: employeeIds } }, select: { id: true, hourlyPayCents: true } })
    : [];
  const rateById = new Map(employees.map((e) => [e.id, e.hourlyPayCents ?? 0]));

  const byContract = new Map<string, ContractLabor>();
  for (const r of rows) {
    const entry = byContract.get(r.contractId) ?? { hours: 0, costCents: 0, missingRateNames: [] };
    const rate = rateById.get(r.employeeId) ?? 0;
    entry.hours += r.hours;
    entry.costCents += Math.round(r.hours * rate);
    if (rate === 0 && !entry.missingRateNames.includes(r.employeeName)) entry.missingRateNames.push(r.employeeName);
    byContract.set(r.contractId, entry);
  }
  return byContract;
}

/** First and last day (UTC-midnight labels) of the month containing `d`. */
export function monthBounds(d: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return { start, end };
}
