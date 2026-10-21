// Why a planned day was taken off the schedule. MISTAKE just deletes it,
// every other reason leaves a grayed-out ScheduleDayRemoval on the calendar.

export const SCHEDULE_REMOVAL_REASONS = [
  { value: "MISTAKE", label: "Placed by mistake / wrong day" },
  { value: "RESCHEDULED", label: "Rescheduled" },
  { value: "CLIENT_CANCELED", label: "Client canceled" },
  { value: "WEATHER", label: "Weather" },
  { value: "CREW_UNAVAILABLE", label: "Crew unavailable" },
  { value: "SITE_NOT_READY", label: "Site not ready / no access" },
  { value: "OTHER", label: "Other" },
] as const;

export type ScheduleRemovalReason = (typeof SCHEDULE_REMOVAL_REASONS)[number]["value"];

export function isScheduleRemovalReason(v: unknown): v is ScheduleRemovalReason {
  return SCHEDULE_REMOVAL_REASONS.some((r) => r.value === v);
}

export function scheduleRemovalReasonLabel(v: string): string {
  return SCHEDULE_REMOVAL_REASONS.find((r) => r.value === v)?.label ?? v;
}

/** A removed day as the calendar draws it (grayed out). */
export type ScheduleDayRemovalRow = {
  id: string;
  projectId: string;
  dateKey: string;
  reason: string;
  note: string | null;
  coveredBy: string | null;
  removedByName: string | null;
  removedAt: string;
};
