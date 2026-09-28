/**
 * Janitorial hours: what each shift actually counts for. Pure (no DB), so
 * the review page, payroll, and tests all share one rule set.
 *
 * Per scheduled shift, first match wins:
 *   1. Admin correction                      -> corrected hours (or 0 if "didn't work")
 *   2. Clocked in and out                    -> actual clocked hours
 *   3. Clocked in, never out, shift is over  -> clock-in to scheduled end, flagged
 *   4. Time off logged                       -> 0
 *   5. Skipped on the calendar               -> 0
 *   6. Nothing, shift is over                -> scheduled hours ("from schedule")
 *   7. Nothing, shift not over yet           -> upcoming, 0 for now
 * Clock-ins with no matching shift count as unscheduled work, flagged.
 */

import { shiftHours, timeToMinutes, type JanitorialShift } from "@/lib/erp/janitorialSchedule";

const EASTERN = "America/New_York";
/** Clocking this far off the schedule gets flagged for review. */
export const LATE_EARLY_FLAG_MINUTES = 15;
/** An unscheduled clock-in still open after this long is treated as a missed clock-out. */
const UNSCHEDULED_OPEN_LIMIT_HOURS = 16;

// ---------------------------------------------------------------------------
// Eastern wall-clock <-> instant helpers
// ---------------------------------------------------------------------------

function easternParts(instant: Date): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: EASTERN,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

/** "YYYY-MM-DD" Eastern calendar day of an instant. */
export function easternDateKey(instant: Date): string {
  return easternParts(instant).date;
}

/** "HH:MM" Eastern wall-clock time of an instant. */
export function easternTime(instant: Date): string {
  return easternParts(instant).time;
}

/** The instant an Eastern wall-clock date + "HH:MM" happens (handles EST/EDT). */
export function easternWallToInstant(dateKey: string, time: string): Date {
  const [y, mo, d] = dateKey.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const p = easternParts(new Date(guess));
  const [py, pmo, pd] = p.date.split("-").map(Number);
  const [ph, pmi] = p.time.split(":").map(Number);
  const offset = guess - Date.UTC(py, pmo - 1, pd, ph, pmi);
  return new Date(guess + offset);
}

/** When a shift on `dateKey` from start to end finishes (next day if it ends at/before it starts). */
export function scheduledEndInstant(dateKey: string, startTime: string, endTime: string): Date {
  const end = easternWallToInstant(dateKey, endTime);
  return timeToMinutes(endTime) <= timeToMinutes(startTime) ? new Date(end.getTime() + 86_400_000) : end;
}

function hoursBetween(a: Date, b: Date): number {
  return Math.max(0, Math.round(((b.getTime() - a.getTime()) / 3_600_000) * 100) / 100);
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

export type TimeEntryInput = {
  id: string;
  employeeId: string;
  contractId: string;
  shiftKey: string | null;
  date: string;
  clockInAt: Date | null;
  clockOutAt: Date | null;
  manualStartTime: string | null;
  manualEndTime: string | null;
  manualNoShow: boolean;
  notes: string | null;
  hasLocation: boolean;
};

export type HoursSource =
  | "CLOCKED"
  | "NO_CLOCK_OUT"
  | "IN_PROGRESS"
  | "CORRECTED"
  | "DIDNT_WORK"
  | "FROM_SCHEDULE"
  | "TIME_OFF"
  | "SKIPPED"
  | "UPCOMING";

export type ResolvedShiftHours = {
  /** Shift key, or `entry:${id}` for unscheduled work. */
  key: string;
  shiftKey: string | null;
  date: string;
  contractId: string;
  buildingName: string;
  employeeId: string;
  employeeName: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  scheduledHours: number;
  /** What the hours are based on, "HH:MM" Eastern. */
  actualStart: string | null;
  actualEnd: string | null;
  hours: number;
  source: HoursSource;
  unscheduled: boolean;
  /** Plain-language reasons this needs a look. Empty = nothing to review. */
  flags: string[];
  entryId: string | null;
  hasLocation: boolean;
  notes: string | null;
};

function resolveEntry(
  entry: TimeEntryInput,
  scheduled: { start: string; end: string; endsAt: Date } | null,
  now: Date
): Pick<ResolvedShiftHours, "actualStart" | "actualEnd" | "hours" | "source" | "flags"> | null {
  if (entry.manualNoShow) return { actualStart: null, actualEnd: null, hours: 0, source: "DIDNT_WORK", flags: [] };
  if (entry.manualStartTime && entry.manualEndTime) {
    return {
      actualStart: entry.manualStartTime,
      actualEnd: entry.manualEndTime,
      hours: shiftHours(entry.manualStartTime, entry.manualEndTime),
      source: "CORRECTED",
      flags: [],
    };
  }
  if (!entry.clockInAt) return null;

  const inTime = easternTime(entry.clockInAt);
  const flags: string[] = [];
  if (scheduled) {
    const scheduledStartAt = easternWallToInstant(entry.date, scheduled.start);
    const lateMinutes = (entry.clockInAt.getTime() - scheduledStartAt.getTime()) / 60_000;
    if (lateMinutes > LATE_EARLY_FLAG_MINUTES) flags.push(`Clocked in ${Math.round(lateMinutes)} min late`);
  }

  if (entry.clockOutAt) {
    if (scheduled) {
      const earlyMinutes = (scheduled.endsAt.getTime() - entry.clockOutAt.getTime()) / 60_000;
      if (earlyMinutes > LATE_EARLY_FLAG_MINUTES) flags.push(`Left ${Math.round(earlyMinutes)} min early`);
      if (-earlyMinutes > LATE_EARLY_FLAG_MINUTES) flags.push(`Stayed ${Math.round(-earlyMinutes)} min past schedule`);
    }
    return { actualStart: inTime, actualEnd: easternTime(entry.clockOutAt), hours: hoursBetween(entry.clockInAt, entry.clockOutAt), source: "CLOCKED", flags };
  }

  // Clocked in, not out.
  if (scheduled) {
    if (now < scheduled.endsAt) return { actualStart: inTime, actualEnd: null, hours: 0, source: "IN_PROGRESS", flags };
    return {
      actualStart: inTime,
      actualEnd: scheduled.end,
      hours: hoursBetween(entry.clockInAt, scheduled.endsAt),
      source: "NO_CLOCK_OUT",
      flags: [...flags, "No clock-out, used scheduled end time"],
    };
  }
  if (now.getTime() - entry.clockInAt.getTime() < UNSCHEDULED_OPEN_LIMIT_HOURS * 3_600_000) {
    return { actualStart: inTime, actualEnd: null, hours: 0, source: "IN_PROGRESS", flags };
  }
  return { actualStart: inTime, actualEnd: null, hours: 0, source: "NO_CLOCK_OUT", flags: [...flags, "No clock-out, enter the end time"] };
}

export function resolveJanitorialHours(input: {
  shifts: JanitorialShift[];
  entries: TimeEntryInput[];
  contractNames: Map<string, string>;
  employeeNames: Map<string, string>;
  now?: Date;
}): ResolvedShiftHours[] {
  const now = input.now ?? new Date();
  const entryByShiftKey = new Map(input.entries.filter((e) => e.shiftKey).map((e) => [e.shiftKey!, e]));
  const matchedEntryIds = new Set<string>();
  const rows: ResolvedShiftHours[] = [];

  for (const s of input.shifts) {
    const entry = entryByShiftKey.get(s.key) ?? null;
    if (entry) matchedEntryIds.add(entry.id);
    const endsAt = scheduledEndInstant(s.date, s.startTime, s.endTime);
    const base = {
      key: s.key,
      shiftKey: s.key,
      date: s.date,
      contractId: s.contractId,
      buildingName: s.buildingName,
      employeeId: s.employeeId,
      employeeName: s.employeeName,
      scheduledStart: s.startTime,
      scheduledEnd: s.endTime,
      scheduledHours: s.status === "CANCELLED" ? 0 : s.hours,
      unscheduled: false,
      entryId: entry?.id ?? null,
      hasLocation: entry?.hasLocation ?? false,
      notes: entry?.notes ?? null,
    };

    const fromEntry = entry ? resolveEntry(entry, { start: s.startTime, end: s.endTime, endsAt }, now) : null;
    if (fromEntry) {
      const flags = s.status === "CANCELLED" && fromEntry.hours > 0 ? [...fromEntry.flags, "Worked on a skipped day"] : fromEntry.flags;
      rows.push({ ...base, ...fromEntry, flags });
    } else if (s.timeOffType) {
      rows.push({ ...base, actualStart: null, actualEnd: null, hours: 0, source: "TIME_OFF", flags: [] });
    } else if (s.status === "CANCELLED") {
      rows.push({ ...base, actualStart: null, actualEnd: null, hours: 0, source: "SKIPPED", flags: [] });
    } else if (now < endsAt) {
      rows.push({ ...base, actualStart: null, actualEnd: null, hours: 0, source: "UPCOMING", flags: [] });
    } else {
      rows.push({ ...base, actualStart: s.startTime, actualEnd: s.endTime, hours: s.hours, source: "FROM_SCHEDULE", flags: [] });
    }
  }

  // Clock-ins with no shift on the schedule (or whose shift was since removed).
  for (const e of input.entries) {
    if (matchedEntryIds.has(e.id)) continue;
    const resolved = resolveEntry(e, null, now);
    if (!resolved) continue;
    rows.push({
      key: `entry:${e.id}`,
      shiftKey: e.shiftKey,
      date: e.date,
      contractId: e.contractId,
      buildingName: input.contractNames.get(e.contractId) ?? "Unknown building",
      employeeId: e.employeeId,
      employeeName: input.employeeNames.get(e.employeeId) ?? "Unknown",
      scheduledStart: null,
      scheduledEnd: null,
      scheduledHours: 0,
      ...resolved,
      unscheduled: true,
      flags: resolved.source === "CORRECTED" || resolved.source === "DIDNT_WORK" ? resolved.flags : ["Not on the schedule", ...resolved.flags],
      entryId: e.id,
      hasLocation: e.hasLocation,
      notes: e.notes,
    });
  }

  rows.sort((a, b) => a.date.localeCompare(b.date) || (a.actualStart ?? a.scheduledStart ?? "").localeCompare(b.actualStart ?? b.scheduledStart ?? ""));
  return rows;
}
