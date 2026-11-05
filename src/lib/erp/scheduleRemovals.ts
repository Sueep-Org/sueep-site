// Why a planned day was taken off the schedule. MISTAKE just deletes it,
// every other reason leaves a grayed-out ScheduleDayRemoval on the calendar.
// The reasons are an editable list on Settings, Lists (AppLists.removalReasons).

import type { ListItem } from "./appLists";

export type ScheduleRemovalReason = string;

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
};
