import { todayEasternKey, utcDateKey } from "./dates";

export type ProjectLifecycle = "UPCOMING" | "ACTIVE" | "COMPLETED";

/** Change order statuses that count as real, ongoing work — not a draft
 * (not yet committed), not dead (rejected/void), not finished (completed). */
const ACTIVE_CO_STATUSES = new Set(["SUBMITTED", "APPROVED", "BILLING"]);

export function hasActiveChangeOrder(changeOrders: { status: string }[]): boolean {
  return changeOrders.some((co) => ACTIVE_CO_STATUSES.has(co.status.toUpperCase()));
}

/**
 * `hasActiveChangeOrder` lets a project with an active CO show as ACTIVE
 * even when its own projectDate is still in the future — a change order's
 * work can start before the base project's official start date, and a
 * project actively being worked on shouldn't read as merely "upcoming"
 * just because of that.
 */
export function deriveProjectLifecycle(
  status: string,
  projectDateIso: string | null,
  hasActiveChangeOrder: boolean = false
): ProjectLifecycle {
  const s = status.toUpperCase();
  if (s === "COMPLETE" || s === "ARCHIVED") return "COMPLETED";
  if (s === "UPCOMING" && !hasActiveChangeOrder) return "UPCOMING";
  if (projectDateIso && !hasActiveChangeOrder) {
    const d = new Date(projectDateIso);
    // Compare calendar-day strings, not millisecond instants — "today" has
    // to mean the Eastern business day, not whatever day UTC (or the server
    // process's ambient timezone) happens to be on, which drifts a day
    // ahead of Eastern for several hours every evening.
    if (Number.isFinite(d.getTime()) && utcDateKey(d) > todayEasternKey()) return "UPCOMING";
  }
  return "ACTIVE";
}