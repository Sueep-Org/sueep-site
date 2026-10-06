import { prisma } from "@/lib/prisma";
import type { ErpAuthContext } from "@/lib/erpAuth";

export const TIME_OFF_TYPES = ["VACATION", "SICK", "HALF_DAY", "UNPAID", "OTHER"] as const;
export type TimeOffType = (typeof TIME_OFF_TYPES)[number];

/** Every new entry starts PENDING. Only APPROVED entries block scheduling,
 * zero janitorial shifts, or come off salary. DENIED rows are kept as a record
 * and don't count toward the yearly limit or overlap checks. */
export const TIME_OFF_STATUSES = ["PENDING", "APPROVED", "DENIED"] as const;
export type TimeOffStatus = (typeof TIME_OFF_STATUSES)[number];

/** PAID: an Admin let it go past the limit and it's paid anyway. UNPAID: the
 * days past the limit are unpaid (EmployeeTimeOff.unpaidDays). */
export const LIMIT_OVERRIDES = ["PAID", "UNPAID"] as const;
export type LimitOverride = (typeof LIMIT_OVERRIDES)[number];

/** Employees only get 15 paid days off per calendar year (VACATION/SICK/
 * HALF_DAY/OTHER share one pool) — UNPAID doesn't count against it and has
 * no cap. Not extended to contractors, who don't get a company PTO benefit. */
export const PAID_TIME_OFF_DAYS_PER_YEAR = 15;

/** Same day-math already shown to users in TimeOffSection's running
 * totals: inclusive calendar-day range,
 * HALF_DAY counts as half that range. Centralized here so the server-side
 * paid-day cap (employees only) agrees with what the UI already displays. */
export function timeOffEntryDays(entry: { startDate: Date; endDate: Date; type: string }): number {
  const days = Math.round((entry.endDate.getTime() - entry.startDate.getTime()) / 86_400_000) + 1;
  return entry.type === "HALF_DAY" ? days * 0.5 : days;
}

/** Hours-per-day convention for converting a day-based time-off entry into
 * hours, used by Janitorial Contract payroll (their fixed 40 hrs/week is
 * reduced by logged vacation, but EmployeeTimeOff is stored as calendar
 * days, not hours). */
const HOURS_PER_DAY = 8;

/** Same entry as timeOffEntryDays(), converted to hours (day × 8, HALF_DAY ×
 * 4), optionally clipped to [clipStart, clipEnd] first so an entry that only
 * partially overlaps a pay period only counts the overlapping portion. */
export function timeOffEntryHours(
  entry: { startDate: Date; endDate: Date; type: string },
  range?: { clipStart?: Date; clipEnd?: Date }
): number {
  const start = range?.clipStart && range.clipStart > entry.startDate ? range.clipStart : entry.startDate;
  const end = range?.clipEnd && range.clipEnd < entry.endDate ? range.clipEnd : entry.endDate;
  if (end < start) return 0;
  const days = timeOffEntryDays({ startDate: start, endDate: end, type: entry.type });
  return days * HOURS_PER_DAY;
}

/** Sums an employee's paid time-off days already on file for the given
 * calendar year (keyed by each entry's own startDate year, same grouping
 * TimeOffSection's "this year" total already uses). Pending entries
 * count too, so stacked requests can't each squeeze under the limit. Denied
 * entries, UNPAID entries, and days an Admin made unpaid don't count.
 * Pass excludeId when checking an edit so the entry doesn't count against
 * itself. */
export async function paidTimeOffDaysUsed(employeeId: string, year: number, excludeId?: string): Promise<number> {
  const entries = await prisma.employeeTimeOff.findMany({
    where: {
      employeeId,
      type: { not: "UNPAID" },
      status: { not: "DENIED" },
      ...(excludeId ? { id: { not: excludeId } } : {}),
      startDate: {
        gte: new Date(`${year}-01-01T00:00:00.000Z`),
        lt: new Date(`${year + 1}-01-01T00:00:00.000Z`),
      },
    },
    select: { startDate: true, endDate: true, type: true, unpaidDays: true },
  });
  return entries.reduce((sum, e) => sum + Math.max(0, timeOffEntryDays(e) - e.unpaidDays), 0);
}

/** Null if adding `adding` more paid days wouldn't exceed the year's pool,
 * otherwise a ready-to-return error message. */
export function paidTimeOffLimitError(used: number, adding: number, year: number): string | null {
  if (used + adding <= PAID_TIME_OFF_DAYS_PER_YEAR) return null;
  const remaining = Math.max(0, PAID_TIME_OFF_DAYS_PER_YEAR - used);
  return `This would put them over the ${PAID_TIME_OFF_DAYS_PER_YEAR}-day paid time off limit for ${year} (${remaining} day${remaining === 1 ? "" : "s"} remaining). Mark this Unpaid, shorten the range, or ask an Admin to override.`;
}

export function parseLimitOverride(value: unknown): LimitOverride | null {
  const v = String(value ?? "").toUpperCase();
  return LIMIT_OVERRIDES.includes(v as LimitOverride) ? (v as LimitOverride) : null;
}

/** Shared create/edit check for the yearly paid day limit. Returns the
 * fields to save, or an error response body. Over the limit is refused
 * unless an Admin passes an override; UNPAID makes only the days past the
 * limit unpaid. */
export async function checkPaidTimeOffLimit(params: {
  employeeId: string;
  startDate: Date;
  endDate: Date;
  type: string;
  override: LimitOverride | null;
  role: string | undefined;
  excludeId?: string;
}): Promise<
  | { ok: true; limitOverride: LimitOverride | null; unpaidDays: number }
  | { ok: false; status: number; body: { error: string; overLimit?: { remaining: number; adding: number; overBy: number } } }
> {
  if (params.type === "UNPAID") return { ok: true, limitOverride: null, unpaidDays: 0 };
  const year = params.startDate.getUTCFullYear();
  const used = await paidTimeOffDaysUsed(params.employeeId, year, params.excludeId);
  const adding = timeOffEntryDays(params);
  const limitError = paidTimeOffLimitError(used, adding, year);
  if (!limitError) return { ok: true, limitOverride: null, unpaidDays: 0 };

  const remaining = Math.max(0, PAID_TIME_OFF_DAYS_PER_YEAR - used);
  const overBy = Math.min(adding, used + adding - PAID_TIME_OFF_DAYS_PER_YEAR);
  if (!params.override) {
    return { ok: false, status: 400, body: { error: limitError, overLimit: { remaining, adding, overBy } } };
  }
  if (params.role !== "ADMIN") {
    return { ok: false, status: 403, body: { error: "Only an Admin can go past the paid time off limit." } };
  }
  return { ok: true, limitOverride: params.override, unpaidDays: params.override === "UNPAID" ? overBy : 0 };
}

/** The calendar days of an entry that are unpaid and how much of each day
 * (1, or 0.5 for HALF_DAY), counted back from the entry's last day. */
export function unpaidTimeOffDays(entry: { startDate: Date; endDate: Date; type: string; unpaidDays: number }): { date: Date; fraction: number }[] {
  const perDay = entry.type === "HALF_DAY" ? 0.5 : 1;
  const out: { date: Date; fraction: number }[] = [];
  let left = entry.unpaidDays;
  for (let t = entry.endDate.getTime(); t >= entry.startDate.getTime() && left > 0; t -= 86_400_000) {
    const fraction = Math.min(perDay, left);
    out.push({ date: new Date(t), fraction });
    left -= fraction;
  }
  return out;
}

/** Why `approver` can't approve or deny this person's time off, or null if
 * they can. Admins and PMs can review. Nobody reviews their own time off,
 * and time off for a PM or Admin needs an Admin. The person is matched to
 * their ERP login by email. */
export function timeOffReviewBlock(
  approver: Pick<ErpAuthContext, "email" | "role">,
  subject: { email: string | null; erpRole: string | null }
): string | null {
  if (approver.role !== "ADMIN" && approver.role !== "PROJECT_MANAGER") {
    return "Only an Admin or PM can approve time off.";
  }
  if (subject.email && subject.email.trim().toLowerCase() === approver.email.trim().toLowerCase()) {
    return "You can't approve your own time off. An Admin needs to.";
  }
  if ((subject.erpRole === "PROJECT_MANAGER" || subject.erpRole === "ADMIN") && approver.role !== "ADMIN") {
    return "Time off for a PM or Admin needs an Admin to approve it.";
  }
  return null;
}

/** Looks up the ERP login (if any) for this email, for timeOffReviewBlock. */
export async function erpRoleForEmail(email: string | null): Promise<string | null> {
  if (!email) return null;
  const user = await prisma.erpUser.findFirst({
    where: { email: { equals: email.trim(), mode: "insensitive" } },
    select: { role: true },
  });
  return user?.role ?? null;
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
      status: { not: "DENIED" },
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
      status: { not: "DENIED" },
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
