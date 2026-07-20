import { todayEasternKey, utcDateKey } from "./dates";

export type ProjectLifecycle = "UPCOMING" | "ACTIVE" | "COMPLETED";

export function deriveProjectLifecycle(status: string, projectDateIso: string | null): ProjectLifecycle {
  const s = status.toUpperCase();
  if (s === "COMPLETE" || s === "ARCHIVED") return "COMPLETED";
  if (s === "UPCOMING") return "UPCOMING";
  if (projectDateIso) {
    const d = new Date(projectDateIso);
    // Compare calendar-day strings, not millisecond instants — "today" has
    // to mean the Eastern business day, not whatever day UTC (or the server
    // process's ambient timezone) happens to be on, which drifts a day
    // ahead of Eastern for several hours every evening.
    if (Number.isFinite(d.getTime()) && utcDateKey(d) > todayEasternKey()) return "UPCOMING";
  }
  return "ACTIVE";
}