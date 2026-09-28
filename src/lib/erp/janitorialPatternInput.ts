import { parseDateKey, parseTime } from "@/lib/erp/janitorialSchedule";

export type PatternInput = {
  employeeId?: string;
  daysOfWeek?: number[];
  startTime?: string;
  endTime?: string;
  effectiveFrom?: Date;
  effectiveUntil?: Date | null;
  notes?: string | null;
};

/** Validates a shift-pattern request body. `partial` (PATCH) only checks the
 * fields present; otherwise every required field must be there. */
export function parsePatternInput(
  body: Record<string, unknown>,
  partial: boolean
): { data: PatternInput } | { error: string } {
  const data: PatternInput = {};

  if (body.employeeId !== undefined || !partial) {
    const id = String(body.employeeId ?? "").trim();
    if (!id) return { error: "Pick a janitor" };
    data.employeeId = id;
  }
  if (body.daysOfWeek !== undefined || !partial) {
    const days = Array.isArray(body.daysOfWeek) ? body.daysOfWeek.map(Number) : [];
    const valid = Array.from(new Set(days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))).sort();
    if (valid.length === 0) return { error: "Pick at least one day" };
    data.daysOfWeek = valid;
  }
  if (body.startTime !== undefined || !partial) {
    const t = parseTime(body.startTime);
    if (!t) return { error: "Start time is required" };
    data.startTime = t;
  }
  if (body.endTime !== undefined || !partial) {
    const t = parseTime(body.endTime);
    if (!t) return { error: "End time is required" };
    data.endTime = t;
  }
  if (data.startTime && data.endTime && data.startTime === data.endTime) {
    return { error: "Start and end time can't be the same" };
  }
  if (body.effectiveFrom !== undefined || !partial) {
    const d = parseDateKey(body.effectiveFrom);
    if (!d) return { error: "Start date is required" };
    data.effectiveFrom = d;
  }
  if (body.effectiveUntil !== undefined) {
    if (body.effectiveUntil === null || body.effectiveUntil === "") {
      data.effectiveUntil = null;
    } else {
      const d = parseDateKey(body.effectiveUntil);
      if (!d) return { error: "Invalid end date" };
      data.effectiveUntil = d;
    }
  }
  if (data.effectiveFrom && data.effectiveUntil && data.effectiveUntil < data.effectiveFrom) {
    return { error: "End date can't be before the start date" };
  }
  if (body.notes !== undefined) {
    data.notes = body.notes ? String(body.notes).trim() : null;
  }
  return { data };
}
