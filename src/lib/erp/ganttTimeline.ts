/** Pure helpers for the Schedule page's project timeline (Gantt): which
 * stage a project is in, and which data problems to flag on its row. No
 * runtime imports, so it can be unit tested directly with `node --test`. */

export type GanttStage = "ACTIVE" | "UPCOMING" | "ON_HOLD";

/** Ordered most to least serious, the row shows them in this order. */
export type GanttFlag = "DONE_NOT_CLOSED" | "PAST_END" | "START_PASSED" | "NO_START_DATE" | "NO_END_DATE";

export const GANTT_FLAG_LABELS: Record<GanttFlag, string> = {
  DONE_NOT_CLOSED: "100% done but not marked complete",
  PAST_END: "Past its end date",
  START_PASSED: "Start date passed but still Upcoming",
  NO_START_DATE: "No start date, using the date it was created",
  NO_END_DATE: "No end date, bar length is an estimate",
};

/** Real problems that need someone to act (close it out, extend it, start
 * it), as opposed to dates that just haven't been filled in yet. */
const SERIOUS_FLAGS = new Set<GanttFlag>(["DONE_NOT_CLOSED", "PAST_END", "START_PASSED"]);

export function isSeriousFlag(f: GanttFlag): boolean {
  return SERIOUS_FLAGS.has(f);
}

export type GanttInput = {
  status: string;
  projectDate: string | null;
  projectEndDate: string | null;
  percentDone: number;
};

// Date-only fields are stored as literal UTC midnight (see dates.ts), so the
// ISO string's first 10 characters are the calendar day.
function isoDayKey(iso: string): string {
  return iso.slice(0, 10);
}

/** Where a project sits on the timeline, or null when it doesn't belong on
 * it (complete, archived, anything unrecognized). An ACTIVE project whose
 * start date is still in the future reads as Upcoming, same as
 * deriveProjectLifecycle. */
export function ganttStage(p: GanttInput, todayKey: string): GanttStage | null {
  const s = p.status.toUpperCase();
  if (s === "UPCOMING") return "UPCOMING";
  if (s === "ON_HOLD") return "ON_HOLD";
  if (s !== "ACTIVE") return null;
  if (p.projectDate && isoDayKey(p.projectDate) > todayKey) return "UPCOMING";
  return "ACTIVE";
}

export function ganttFlags(p: GanttInput, todayKey: string): GanttFlag[] {
  const stage = ganttStage(p, todayKey);
  const flags: GanttFlag[] = [];
  if (p.percentDone >= 100) {
    flags.push("DONE_NOT_CLOSED");
  } else if (stage === "ACTIVE" && p.projectEndDate && isoDayKey(p.projectEndDate) < todayKey) {
    flags.push("PAST_END");
  }
  if (p.status.toUpperCase() === "UPCOMING" && p.projectDate && isoDayKey(p.projectDate) < todayKey) {
    flags.push("START_PASSED");
  }
  if (!p.projectDate) flags.push("NO_START_DATE");
  if (!p.projectEndDate) flags.push("NO_END_DATE");
  return flags;
}

/** Whole days from one YYYY-MM-DD key to another, positive when toKey is later. */
export function daysBetweenKeys(fromKey: string, toKey: string): number {
  const from = Date.parse(`${fromKey}T00:00:00.000Z`);
  const to = Date.parse(`${toKey}T00:00:00.000Z`);
  return Math.round((to - from) / 86400000);
}
