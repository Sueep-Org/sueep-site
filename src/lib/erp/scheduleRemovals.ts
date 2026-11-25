// Why a planned day was taken off the schedule. MISTAKE just deletes it,
// every other reason leaves a grayed-out ScheduleDayRemoval on the calendar.
// The reasons are an editable list on Settings, Lists (AppLists.removalReasons).

import type { ListItem } from "./appLists";

export type ScheduleRemovalReason = string;

/** Saved on a day cancelled because its job was voided. Not in the editable
 * list (nobody picks it), shown as "Job voided". */
export const JOB_VOIDED_REMOVAL = "JOB_VOIDED";
export const JOB_VOIDED_REMOVAL_LABEL = "Job voided";

/** A removal reason's label, including the built-in Job voided one. */
export function removalReasonLabel(reasons: ListItem[], value: string): string {
  if (value === JOB_VOIDED_REMOVAL) return JOB_VOIDED_REMOVAL_LABEL;
  return reasons.find((r) => r.value === value)?.label ?? value;
}

export function isScheduleRemovalReason(v: unknown, reasons: ListItem[]): v is ScheduleRemovalReason {
  return typeof v === "string" && reasons.some((r) => r.value === v);
}

/** A removed day as the calendar draws it (grayed out). */
export type ScheduleDayRemovalRow = {
  id: string;
  projectId: string;
  /** Set for a change order's day, drawn with the CO's title */
  changeOrderId: string | null;
  changeOrderTitle: string | null;
  dateKey: string;
  reason: string;
  note: string | null;
  coveredBy: string | null;
  removedByName: string | null;
  removedAt: string;
  /** The day's own comment and staff note when it was removed, put back on a restore */
  dayComment: string | null;
  dayInternalNote: string | null;
};
