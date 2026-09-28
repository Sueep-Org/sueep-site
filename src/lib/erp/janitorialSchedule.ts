/**
 * Janitorial contract schedule: turns weekly JanitorialShiftPattern rows plus
 * one-day JanitorialShiftException rows into dated shifts for the Schedule
 * page's Janitorial tab (and, later, pre-filled timesheet hours).
 *
 * All dates are "YYYY-MM-DD" labels / UTC-midnight Dates, same convention as
 * the rest of the schedule (see dates.ts). Times are "HH:MM" Eastern
 * wall-clock strings and are never converted.
 *
 * Pure (no DB access) so client components can share these helpers; the
 * loader lives in janitorialScheduleServer.ts.
 */

import { utcDateKey } from "@/lib/erp/dates";

export const SHIFT_EXCEPTION_KINDS = ["CANCELLED", "CHANGED", "EXTRA"] as const;
export type ShiftExceptionKind = (typeof SHIFT_EXCEPTION_KINDS)[number];

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Valid "HH:MM" 24h time, or null. */
export function parseTime(value: unknown): string | null {
  const s = String(value ?? "").trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

/** "YYYY-MM-DD" to a UTC-midnight Date, or null. */
export function parseDateKey(value: unknown): Date | null {
  const s = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Shift length in hours. An end at or before the start is an overnight shift. */
export function shiftHours(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  let minutes = eh * 60 + em - (sh * 60 + sm);
  if (minutes <= 0) minutes += 24 * 60;
  return Math.round((minutes / 60) * 100) / 100;
}

/** "18:00" to "6pm", "18:30" to "6:30pm". */
export function formatTime12(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, "0")}${suffix}`;
}

export type JanitorialShift = {
  /** Stable per calendar slot: `${patternId}:${date}` or `extra:${exceptionId}`. */
  key: string;
  date: string;
  contractId: string;
  buildingName: string;
  employeeId: string;
  employeeName: string;
  startTime: string;
  endTime: string;
  hours: number;
  /** REGULAR = straight from the pattern. CANCELLED shifts are still returned so they can be restored. */
  status: "REGULAR" | "CHANGED" | "EXTRA" | "CANCELLED";
  patternId: string | null;
  exceptionId: string | null;
  /** The pattern's own janitor, when a CHANGED shift is being covered by someone else. */
  regularEmployeeName: string | null;
  /** The weekly shift this came from (null for extra visits), for "this and following weeks" edits. */
  pattern: { employeeId: string; daysOfWeek: number[]; startTime: string; endTime: string; notes: string | null } | null;
  notes: string | null;
  /** Set when the assigned janitor has logged time off covering this date. */
  timeOffType: string | null;
};

type PatternRow = {
  id: string;
  recurringContractId: string;
  employeeId: string;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
  notes: string | null;
};

type ExceptionRow = {
  id: string;
  recurringContractId: string;
  patternId: string | null;
  date: Date;
  kind: string;
  employeeId: string | null;
  startTime: string | null;
  endTime: string | null;
  notes: string | null;
};

type ContractInfo = { name: string; status: string; startDate: Date; endDate: Date | null };
type TimeOffRow = { employeeId: string; startDate: Date; endDate: Date; type: string };

/** Pure expansion, no DB access. `start`/`end` are inclusive UTC-midnight dates. */
export function expandJanitorialShifts(input: {
  start: Date;
  end: Date;
  patterns: PatternRow[];
  exceptions: ExceptionRow[];
  contracts: Map<string, ContractInfo>;
  employeeNames: Map<string, string>;
  timeOff: TimeOffRow[];
}): JanitorialShift[] {
  const { start, end, patterns, exceptions, contracts, employeeNames, timeOff } = input;
  const nameOf = (id: string) => employeeNames.get(id) ?? "Unknown";

  const exceptionBySlot = new Map<string, ExceptionRow>();
  for (const ex of exceptions) {
    if (ex.patternId) exceptionBySlot.set(`${ex.patternId}:${utcDateKey(ex.date)}`, ex);
  }

  const timeOffTypeFor = (employeeId: string, date: Date): string | null =>
    timeOff.find((t) => t.employeeId === employeeId && t.startDate <= date && t.endDate >= date)?.type ?? null;

  // Paused contracts are off the calendar entirely; ended ones still show
  // shifts up to their end date.
  const contractCovers = (c: ContractInfo | undefined, date: Date) =>
    !!c && c.status !== "PAUSED" && c.startDate <= date && (!c.endDate || c.endDate >= date);

  const shifts: JanitorialShift[] = [];

  for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 86_400_000)) {
    const date = utcDateKey(d);
    for (const p of patterns) {
      if (!p.daysOfWeek.includes(d.getUTCDay())) continue;
      if (p.effectiveFrom > d || (p.effectiveUntil && p.effectiveUntil < d)) continue;
      const contract = contracts.get(p.recurringContractId);
      if (!contractCovers(contract, d)) continue;

      const ex = exceptionBySlot.get(`${p.id}:${date}`);
      const changed = ex?.kind === "CHANGED";
      const employeeId = changed && ex.employeeId ? ex.employeeId : p.employeeId;
      const startTime = changed && ex.startTime ? ex.startTime : p.startTime;
      const endTime = changed && ex.endTime ? ex.endTime : p.endTime;

      shifts.push({
        key: `${p.id}:${date}`,
        date,
        contractId: p.recurringContractId,
        buildingName: contract!.name,
        employeeId,
        employeeName: nameOf(employeeId),
        startTime,
        endTime,
        hours: shiftHours(startTime, endTime),
        status: ex?.kind === "CANCELLED" ? "CANCELLED" : changed ? "CHANGED" : "REGULAR",
        patternId: p.id,
        exceptionId: ex?.id ?? null,
        regularEmployeeName: employeeId !== p.employeeId ? nameOf(p.employeeId) : null,
        pattern: { employeeId: p.employeeId, daysOfWeek: p.daysOfWeek, startTime: p.startTime, endTime: p.endTime, notes: p.notes },
        notes: ex?.notes ?? p.notes,
        timeOffType: timeOffTypeFor(employeeId, d),
      });
    }
  }

  for (const ex of exceptions) {
    if (ex.kind !== "EXTRA" || !ex.employeeId || !ex.startTime || !ex.endTime) continue;
    if (ex.date < start || ex.date > end) continue;
    const contract = contracts.get(ex.recurringContractId);
    if (!contract) continue;
    shifts.push({
      key: `extra:${ex.id}`,
      date: utcDateKey(ex.date),
      contractId: ex.recurringContractId,
      buildingName: contract.name,
      employeeId: ex.employeeId,
      employeeName: nameOf(ex.employeeId),
      startTime: ex.startTime,
      endTime: ex.endTime,
      hours: shiftHours(ex.startTime, ex.endTime),
      status: "EXTRA",
      patternId: null,
      exceptionId: ex.id,
      regularEmployeeName: null,
      pattern: null,
      notes: ex.notes,
      timeOffType: timeOffTypeFor(ex.employeeId, ex.date),
    });
  }

  shifts.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.buildingName.localeCompare(b.buildingName));
  return shifts;
}

/** "HH:MM" to minutes after midnight. */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Minutes after midnight to "HH:MM" (wraps past midnight). */
export function minutesToTime(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
