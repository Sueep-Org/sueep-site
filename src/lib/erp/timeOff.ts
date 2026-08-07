import { prisma } from "@/lib/prisma";

export const TIME_OFF_TYPES = ["VACATION", "SICK", "HALF_DAY", "UNPAID", "OTHER"] as const;
export type TimeOffType = (typeof TIME_OFF_TYPES)[number];

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
