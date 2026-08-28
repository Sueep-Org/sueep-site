import { prisma } from "@/lib/prisma";

export const TIME_OFF_TYPES = ["VACATION", "SICK", "HALF_DAY", "UNPAID", "OTHER"] as const;
export type TimeOffType = (typeof TIME_OFF_TYPES)[number];

/** Change TIME_OFF_NOTIFICATION_EMAIL env var to update the recipient after testing. */
export const TIME_OFF_NOTIFICATION_EMAIL = process.env.TIME_OFF_NOTIFICATION_EMAIL ?? "contact@sueep.com";

/** Employees only get 15 paid days off per calendar year (VACATION/SICK/
 * HALF_DAY/OTHER share one pool) — UNPAID doesn't count against it and has
 * no cap. Not extended to contractors, who don't get a company PTO benefit. */
export const PAID_TIME_OFF_DAYS_PER_YEAR = 15;

/** Same day-math already shown to users in EmployeeTimeOffSection/
 * ContractorTimeOffSection's running totals: inclusive calendar-day range,
 * HALF_DAY counts as half that range. Centralized here so the server-side
 * paid-day cap (employees only) agrees with what the UI already displays. */
export function timeOffEntryDays(entry: { startDate: Date; endDate: Date; type: string }): number {
  const days = Math.round((entry.endDate.getTime() - entry.startDate.getTime()) / 86_400_000) + 1;
  return entry.type === "HALF_DAY" ? days * 0.5 : days;
}

/** Sums an employee's non-UNPAID time-off days already on file for the
 * given calendar year (keyed by each entry's own startDate year, same
 * grouping EmployeeTimeOffSection's "this year" total already uses).
 * Pass excludeId when checking an edit so the entry doesn't count against
 * itself. */
export async function paidTimeOffDaysUsed(employeeId: string, year: number, excludeId?: string): Promise<number> {
  const entries = await prisma.employeeTimeOff.findMany({
    where: {
      employeeId,
      type: { not: "UNPAID" },
      ...(excludeId ? { id: { not: excludeId } } : {}),
      startDate: {
        gte: new Date(`${year}-01-01T00:00:00.000Z`),
        lt: new Date(`${year + 1}-01-01T00:00:00.000Z`),
      },
    },
    select: { startDate: true, endDate: true, type: true },
  });
  return entries.reduce((sum, e) => sum + timeOffEntryDays(e), 0);
}

/** Null if adding `adding` more paid days wouldn't exceed the year's pool,
 * otherwise a ready-to-return error message. */
export function paidTimeOffLimitError(used: number, adding: number, year: number): string | null {
  if (used + adding <= PAID_TIME_OFF_DAYS_PER_YEAR) return null;
  const remaining = Math.max(0, PAID_TIME_OFF_DAYS_PER_YEAR - used);
  return `This would put them over the ${PAID_TIME_OFF_DAYS_PER_YEAR}-day paid time off limit for ${year} (${remaining} day${remaining === 1 ? "" : "s"} remaining). Mark this Unpaid or shorten the range.`;
}

/** yyyy-mm-dd (or any date-parseable string) -> midnight UTC, same convention
 * as EmployeeTimeOff.startDate/endDate. Returns null for empty/invalid input. */
export function parseTimeOffDate(value: unknown): Date | null {
  if (value === undefined || value === null || value === "") return null;
  const d = new Date(`${String(value)}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Finds an existing time-off row for this employee whose [startDate, endDate]
 * range overlaps the given range (both inclusive), so a supervisor can't log
 * two conflicting entries over the same day(s). Pass `excludeId` when editing
 * an existing entry so it doesn't conflict with itself. */
export async function findOverlappingTimeOff(
  employeeId: string,
  startDate: Date,
  endDate: Date,
  excludeId?: string
) {
  return prisma.employeeTimeOff.findFirst({
    where: {
      employeeId,
      ...(excludeId ? { id: { not: excludeId } } : {}),
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
  });
}

/** Same as findOverlappingTimeOff but for ContractorTimeOff — contractors get
 * their own time-off log (see ContractorTimeOff), not shared with Employee. */
export async function findOverlappingContractorTimeOff(
  contractorId: string,
  startDate: Date,
  endDate: Date,
  excludeId?: string
) {
  return prisma.contractorTimeOff.findFirst({
    where: {
      contractorId,
      ...(excludeId ? { id: { not: excludeId } } : {}),
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
  });
}

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function overlapErrorMessage(overlap: { type: string; startDate: Date; endDate: Date }): string {
  const range =
    dateStr(overlap.startDate) === dateStr(overlap.endDate)
      ? dateStr(overlap.startDate)
      : `${dateStr(overlap.startDate)} to ${dateStr(overlap.endDate)}`;
  return `Overlaps with an existing ${overlap.type.toLowerCase()} entry (${range}).`;
}
