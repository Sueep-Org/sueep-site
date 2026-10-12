/**
 * An employee's worked janitorial shifts, shaped for the Labor list on their
 * profile. Hours come from the same resolver payroll and Janitorial > Hours
 * use (clock times, admin corrections, scheduled hours when nobody clocked),
 * and the rate is their pay on that day, so the profile and payroll agree.
 *
 * Only work that happened: nothing upcoming, and no zero-hour rows (time
 * off, cancelled days, no-shows).
 */

import { prisma } from "@/lib/prisma";
import { todayEasternAsUtcMidnight } from "@/lib/erp/dates";
import { loadJanitorialHours } from "@/lib/erp/janitorialHoursServer";
import { formatTime12 } from "@/lib/erp/janitorialSchedule";
import { fixedPayHourlyCostCents, isFixedPay, loadPayHistories, payRateOn } from "@/lib/erp/payRates";

export type JanitorialLaborRow = {
  id: string;
  contractId: string;
  buildingName: string;
  /** Midnight UTC date label, like LaborEntry.workDate */
  workDate: Date;
  hours: number;
  hourlyRateCents: number;
  /** The times worked, e.g. "6pm to 10pm" */
  taskDescription: string | null;
};

export async function loadEmployeeJanitorialLabor(
  employeeId: string,
  range: { start?: Date | null; end?: Date | null } = {},
): Promise<JanitorialLaborRow[]> {
  // Most employees have never worked a janitorial shift; find that out
  // cheaply, and otherwise learn how far back to look.
  const [firstPattern, firstException, firstEntry] = await Promise.all([
    prisma.janitorialShiftPattern.findFirst({ where: { employeeId }, orderBy: { effectiveFrom: "asc" }, select: { effectiveFrom: true } }),
    prisma.janitorialShiftException.findFirst({ where: { employeeId }, orderBy: { date: "asc" }, select: { date: true } }),
    prisma.janitorialTimeEntry.findFirst({ where: { employeeId }, orderBy: { date: "asc" }, select: { date: true } }),
  ]);
  const firstDates = [firstPattern?.effectiveFrom, firstException?.date, firstEntry?.date].filter((d): d is Date => !!d);
  if (firstDates.length === 0) return [];
  const earliest = new Date(Math.min(...firstDates.map((d) => d.getTime())));

  const today = todayEasternAsUtcMidnight();
  const start = range.start && range.start > earliest ? range.start : earliest;
  const end = range.end && range.end < today ? range.end : today;
  if (start > end) return [];

  const [shifts, histories] = await Promise.all([loadJanitorialHours(start, end), loadPayHistories([employeeId])]);
  const history = histories.get(employeeId);

  return shifts
    .filter((s) => s.employeeId === employeeId && s.hours > 0 && s.source !== "UPCOMING")
    .map((s) => {
      const rate = payRateOn(history, s.date);
      const from = s.actualStart ?? s.scheduledStart;
      const to = s.actualEnd ?? s.scheduledEnd;
      return {
        id: `jan:${s.key}`,
        contractId: s.contractId,
        buildingName: s.buildingName,
        workDate: new Date(`${s.date}T00:00:00.000Z`),
        hours: s.hours,
        hourlyRateCents: !rate ? 0 : isFixedPay(rate) ? fixedPayHourlyCostCents(rate) : (rate.hourlyPayCents ?? 0),
        taskDescription: from && to ? `${formatTime12(from)} to ${formatTime12(to)}` : null,
      };
    });
}
