/**
 * Live "Today" view for managers: sorts today's resolved janitorial shifts
 * (see janitorialHours.ts) into what needs attention right now. Pure.
 */

import { easternWallToInstant, LATE_EARLY_FLAG_MINUTES, type ResolvedShiftHours } from "@/lib/erp/janitorialHours";

export type TodayStatus =
  | "LATE" // should have started, hasn't clocked in
  | "NEEDS_COVER" // assigned janitor has time off today
  | "STILL_CLOCKED_IN" // shift is over, never clocked out
  | "NO_CLOCK_IN" // shift is over, never clocked in (scheduled hours will be used)
  | "CLOCKED_IN" // working right now
  | "UPCOMING" // later today
  | "DONE"; // finished (clocked, corrected, or marked didn't work)

export const ATTENTION_STATUSES: TodayStatus[] = ["LATE", "NEEDS_COVER", "STILL_CLOCKED_IN", "NO_CLOCK_IN"];

export type TodayItem = ResolvedShiftHours & {
  status: TodayStatus;
  /** For LATE: minutes past the scheduled start. */
  minutesLate: number | null;
  /** Clocked-in item has a location flag worth surfacing. */
  locationFlag: string | null;
};

export function classifyToday(rows: ResolvedShiftHours[], todayKey: string, now: Date): TodayItem[] {
  const items: TodayItem[] = [];
  for (const r of rows) {
    const isToday = r.date === todayKey;
    const locationFlag = r.flags.find((f) => f.includes("from the building")) ?? null;
    const base = { ...r, minutesLate: null, locationFlag };

    // Yesterday's rows only matter if a clock-in is still open: an overnight
    // shift still running, or last night's shift never clocked out.
    if (!isToday) {
      if (r.source === "IN_PROGRESS") items.push({ ...base, status: "CLOCKED_IN" });
      if (r.source === "NO_CLOCK_OUT") items.push({ ...base, status: "STILL_CLOCKED_IN" });
      continue;
    }

    switch (r.source) {
      case "IN_PROGRESS":
        items.push({ ...base, status: "CLOCKED_IN" });
        break;
      case "NO_CLOCK_OUT":
        items.push({ ...base, status: "STILL_CLOCKED_IN" });
        break;
      case "FROM_SCHEDULE":
        items.push({ ...base, status: "NO_CLOCK_IN" });
        break;
      case "TIME_OFF":
        items.push({ ...base, status: "NEEDS_COVER" });
        break;
      case "UPCOMING": {
        const startsAt = r.scheduledStart ? easternWallToInstant(r.date, r.scheduledStart) : null;
        const minutesLate = startsAt ? Math.floor((now.getTime() - startsAt.getTime()) / 60_000) : 0;
        if (minutesLate > LATE_EARLY_FLAG_MINUTES) items.push({ ...base, status: "LATE", minutesLate });
        else items.push({ ...base, status: "UPCOMING" });
        break;
      }
      case "CLOCKED":
      case "CORRECTED":
      case "DIDNT_WORK":
        items.push({ ...base, status: "DONE" });
        break;
      // SKIPPED shifts aren't happening, nothing to show.
    }
  }
  const order: Record<TodayStatus, number> = { LATE: 0, NEEDS_COVER: 1, STILL_CLOCKED_IN: 2, NO_CLOCK_IN: 3, CLOCKED_IN: 4, UPCOMING: 5, DONE: 6 };
  items.sort((a, b) => order[a.status] - order[b.status] || (a.scheduledStart ?? a.actualStart ?? "").localeCompare(b.scheduledStart ?? b.actualStart ?? ""));
  return items;
}
