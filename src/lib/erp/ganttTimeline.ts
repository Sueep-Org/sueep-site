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
  /** A submitted/approved/billing change order makes the job active. */
  hasActiveChangeOrder?: boolean;
  /** Last day of the job's change orders (see changeOrderBounds). The job
   * isn't late while its change-order work is still scheduled. */
  coEndKey?: string | null;
};

// Date-only fields are stored as literal UTC midnight (see dates.ts), so the
// ISO string's first 10 characters are the calendar day.
function isoDayKey(iso: string): string {
  return iso.slice(0, 10);
}

/** Where a project sits on the timeline, or null when it's complete or
 * archived. Same rule as deriveProjectLifecycle (projectLifecycle.ts), so the
 * Gantt agrees with WIP/Upcoming everywhere else in the ERP: an active change
 * order makes a job active even when its own status says Upcoming or On
 * hold, and an otherwise active job whose start date is still ahead reads as
 * Upcoming. */
export function ganttStage(p: GanttInput, todayKey: string): GanttStage | null {
  const s = p.status.toUpperCase();
  const co = p.hasActiveChangeOrder === true;
  if (s === "COMPLETE" || s === "ARCHIVED") return null;
  if (s === "UPCOMING" && !co) return "UPCOMING";
  if (s === "ON_HOLD" && !co) return "ON_HOLD";
  if (p.projectDate && !co && isoDayKey(p.projectDate) > todayKey) return "UPCOMING";
  return "ACTIVE";
}

export function ganttFlags(p: GanttInput, todayKey: string): GanttFlag[] {
  const stage = ganttStage(p, todayKey);
  const flags: GanttFlag[] = [];
  if (p.percentDone >= 100) {
    flags.push("DONE_NOT_CLOSED");
  } else if (stage === "ACTIVE" && p.projectEndDate && effectiveEndKey(p) < todayKey) {
    flags.push("PAST_END");
  }
  if (stage === "UPCOMING" && p.projectDate && isoDayKey(p.projectDate) < todayKey) {
    flags.push("START_PASSED");
  }
  if (!p.projectDate) flags.push("NO_START_DATE");
  if (!p.projectEndDate) flags.push("NO_END_DATE");
  return flags;
}

/** The job's own end date, or its last change-order day when that's later. */
export function effectiveEndKey(p: GanttInput): string {
  const own = p.projectEndDate ? isoDayKey(p.projectEndDate) : "";
  return p.coEndKey && p.coEndKey > own ? p.coEndKey : own;
}

/** A change order's scheduled days, as YYYY-MM-DD keys. */
export type CoSpan = { startKey: string; endKey: string };

/** First and last day across a job's change orders, or null with none. */
export function changeOrderBounds(spans: CoSpan[]): CoSpan | null {
  if (spans.length === 0) return null;
  let startKey = spans[0]!.startKey;
  let endKey = spans[0]!.endKey;
  for (const s of spans) {
    if (s.startKey < startKey) startKey = s.startKey;
    if (s.endKey > endKey) endKey = s.endKey;
  }
  return { startKey, endKey };
}

/** Whole days from one YYYY-MM-DD key to another, positive when toKey is later. */
export function daysBetweenKeys(fromKey: string, toKey: string): number {
  const from = Date.parse(`${fromKey}T00:00:00.000Z`);
  const to = Date.parse(`${toKey}T00:00:00.000Z`);
  return Math.round((to - from) / 86400000);
}

/** Which part of a bar is being dragged on the Timeline: the body (moves the
 * whole job) or one edge (changes just the start or end date). */
export type BarDragKind = "move" | "start" | "end";

/** Day offsets after dragging by `days`. Resizing an edge stops at the other
 * edge, so a job is always at least one day long. */
export function draggedSpan(kind: BarDragKind, startOff: number, endOff: number, days: number): { startOff: number; endOff: number } {
  if (kind === "move") return { startOff: startOff + days, endOff: endOff + days };
  if (kind === "start") return { startOff: Math.min(startOff + days, endOff), endOff };
  return { startOff, endOff: Math.max(endOff + days, startOff) };
}

/** The fields a drag saves. A job with no end date keeps having none when
 * it's moved (its bar length stays an estimate); dragging its right edge is
 * how one gets set. */
export function rescheduleChange(
  kind: BarDragKind,
  newStartKey: string,
  newEndKey: string,
  hasEndDate: boolean,
): { projectDate?: string; projectEndDate?: string } {
  if (kind === "start") return { projectDate: newStartKey };
  if (kind === "end") return { projectEndDate: newEndKey };
  return hasEndDate ? { projectDate: newStartKey, projectEndDate: newEndKey } : { projectDate: newStartKey };
}

/** The groups the Timeline's By project view is split into, top to bottom. */
export type GanttSection = "IN_PROGRESS" | "ATTENTION" | "UPCOMING" | "ON_HOLD";

export const GANTT_SECTION_ORDER: GanttSection[] = ["IN_PROGRESS", "ATTENTION", "UPCOMING", "ON_HOLD"];

export const GANTT_SECTION_LABELS: Record<GanttSection, string> = {
  IN_PROGRESS: "In progress",
  ATTENTION: "Needs attention",
  UPCOMING: "Upcoming",
  ON_HOLD: "On hold",
};

/** On hold stays on hold; otherwise a real problem (done but open, late,
 * start passed) wins over the stage, so those jobs gather in one place
 * instead of scattering empty rows through the active list. */
export function ganttSection(stage: GanttStage, flags: GanttFlag[]): GanttSection {
  if (stage === "ON_HOLD") return "ON_HOLD";
  if (flags.some(isSeriousFlag)) return "ATTENTION";
  return stage === "ACTIVE" ? "IN_PROGRESS" : "UPCOMING";
}
