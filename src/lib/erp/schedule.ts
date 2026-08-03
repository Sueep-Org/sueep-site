/** Pure date helpers for ERP schedule / Gantt (no external deps). */

// UTC, not local — date-only fields (projectDate, requestedDate, workDate,
// etc.) are stored as literal UTC midnight with no real timezone attached
// (see dates.ts). Zeroing via local setHours() depended on the server
// process's ambient timezone and rolled UTC-midnight dates back a day
// whenever that happened to be behind UTC (e.g. Eastern), which is how a CO
// requested for the 20th ended up rendering on the 19th.
export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

// UTC throughout, same reasoning as startOfDay above — this is calendar-day
// arithmetic on values that are (or are anchored to) UTC-midnight day
// labels, so it must never touch local Date methods, which would make the
// result depend on the viewer's own browser timezone instead of being the
// same for everyone.
export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

export function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export function endOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}

export function monthMatrix(anchor: Date): Date[][] {
  const first = startOfMonth(anchor);
  const startWeekday = first.getUTCDay();
  const dim = endOfMonth(anchor).getUTCDate();
  const cells: Date[] = [];
  for (let i = 0; i < startWeekday; i++) {
    cells.push(addDays(first, i - startWeekday));
  }
  for (let day = 1; day <= dim; day++) {
    cells.push(new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), day)));
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1]!;
    cells.push(addDays(last, 1));
  }
  const rows: Date[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7));
  }
  return rows;
}

const DEFAULT_SPAN_DAYS = 20;

export type ScheduleProject = {
  id: string;
  jobTitle: string;
  segment: string;
  status: string;
  projectDate: string | null;
  projectEndDate: string | null;
  createdAt: string;
  percentDone: number;
  supervisorUserId: string | null;
  /** Day keys (YYYY-MM-DD) this project actually has logged labor on. */
  workDayKeys: string[];
  /** Per-day hours/workers breakdown, keyed by the same day keys as workDayKeys — powers the calendar chip tooltip. */
  laborByDay: Record<string, { hours: number; workers: string[] }>;
  /** Per-day individual LaborEntry rows (worker, hours, clock-in) — powers the read-only labor detail card on the calendar. Editing happens on the project's Labor log, not here. */
  laborEntriesByDay: Record<string, { workerName: string; hours: number; clockIn: string | null }[]>;
  /** Planned (not-yet-logged) worker names per day, from ProjectWorkerDayAssignment. */
  plannedWorkersByDay: Record<string, string[]>;
  /** This project's SOV line items (id/description/completed) — lets the
   * day-assignment modal offer an SOV-item picker for Post-Construction
   * projects. Empty for projects with no SOV. */
  sovItems: { id: string; description: string; completed: boolean }[];
  /** TURNOVER_SCOPE_OPTIONS values actually contracted for this unit (from
   * its TurnoverRequest), restricting the day-assignment scope picker to
   * just what was selected — e.g. only "CLEAN"/"PAINT" if that's all the
   * unit has. Null when there's no linked TurnoverRequest (falls back to
   * offering every category, since there's nothing to restrict against). */
  contractedScopeItems: string[] | null;
  /** This project's open change orders (id/title) — lets the day-assignment
   * modal offer a CO picker so a scheduled day can be tagged as covering
   * one or more of them. Excludes REJECTED/VOID COs. */
  changeOrders: { id: string; title: string }[];
};

/** A ProjectChangeOrder (CO), shown on the month calendar separately from
 * its parent project — automatically on its start day (falling back to its
 * requested date only when startDate isn't set, for COs predating startDate
 * being required) and end day when different, plus any day its own laborers
 * have logged work, plus any day explicitly planned for it via a
 * ProjectDayAssignment (see ScheduleDayAssignment.changeOrderIds) — the same
 * three-tier "auto / planned / logged" model regular projects use. */
export type ScheduleChangeOrder = {
  id: string;
  projectId: string;
  title: string;
  status: string;
  workDayKeys: string[];
  /** Per-day hours/workers breakdown, from ProjectChangeOrderLaborer — powers the calendar chip tooltip. */
  laborByDay: Record<string, { hours: number; workers: string[] }>;
  /** Day key (YYYY-MM-DD) of startDate ?? requestedDate — a plan rather than
   * a fact, so it's draggable on the calendar (moves startDate). Null on the
   * rare CO with neither date set. */
  scheduledDateKey: string | null;
  /** Day key (YYYY-MM-DD) of endDate, when set and different from
   * scheduledDateKey — also draggable (moves endDate). Null if unset or
   * equal to the start day (no separate occurrence in that case). */
  scheduledEndDateKey: string | null;
};

/** A "Schedule SOV Work" request (ProjectSovScheduleRequest) submitted via
 * the public turnover-requests form — shown on the month calendar on its
 * requested date, separately from ProjectChangeOrder (CO) since it isn't
 * extra scope needing pricing/approval, just a scheduling ask against
 * already-contracted SOV work. */
export type ScheduleSovRequest = {
  id: string;
  projectId: string;
  /** SOV line-item description, used as the chip title. */
  title: string;
  requestedBy: string;
  workDayKeys: string[];
};

/** A planned supervisor and/or PM coverage of a project on a future day
 * (before any labor has actually been logged for it). Rarely, only a PM
 * covers a day with no supervisor on site, at least one of the two is
 * always set. */
export type ScheduleDayAssignment = {
  id: string;
  projectId: string;
  /** Day key (YYYY-MM-DD) this assignment is for. */
  dateKey: string;
  supervisorUserId: string | null;
  /** Set when only the PM covers this day, no supervisor. */
  projectManagerUserId: string | null;
  /** Optional "HH:MM" (24h) local times — all-day on the calendar invite if either is unset. */
  startTime: string | null;
  endTime: string | null;
  /** Set when generated by a multi-day range or repeat action, see ProjectScheduleSeries. */
  seriesId: string | null;
  /** SOV line items this scheduled day is working on (Post-Construction). */
  sovItemIds: string[];
  /** Janitorial scope categories this scheduled day covers — values from
   * TURNOVER_SCOPE_OPTIONS (src/lib/erp/turnoverScope.ts). */
  scopeItems: string[];
  /** Change order(s) this scheduled day's work is for, if any — lets a CO's
   * chip show up on a day between its start/end that isn't otherwise its
   * scheduled date or a logged-labor day. */
  changeOrderIds: string[];
  /** Free-text note about this day's coverage, mainly used when there are
   * no SOV items yet to pick from. */
  comment: string | null;
};

/** A worker (Employee or Contractor) planned to be on a project on a future
 * day, same idea as ScheduleDayAssignment but for crew rather than
 * supervisors, and there can be several per project/day. Exactly one of
 * employeeId/contractorId is set. */
export type ScheduleWorkerAssignment = {
  id: string;
  projectId: string;
  employeeId: string | null;
  contractorId: string | null;
  /** Day key (YYYY-MM-DD) this assignment is for. */
  dateKey: string;
  /** Set when generated by a multi-day range or repeat action, see ProjectScheduleSeries. */
  seriesId: string | null;
};

export function projectWindow(p: ScheduleProject): { start: Date; end: Date } {
  const created = new Date(p.createdAt);
  const start = p.projectDate ? new Date(p.projectDate) : startOfDay(created);
  let end: Date;
  if (p.projectEndDate) {
    end = startOfDay(new Date(p.projectEndDate));
    if (end < start) end = start;
  } else {
    end = addDays(start, DEFAULT_SPAN_DAYS);
    // Real logged labor beyond the assumed default window is a stronger
    // signal than the default itself, extend to cover it rather than
    // clipping off work that actually happened.
    const lastLoggedKey = p.workDayKeys.length > 0 ? p.workDayKeys.reduce((a, b) => (a > b ? a : b)) : null;
    if (lastLoggedKey) {
      const lastLogged = new Date(`${lastLoggedKey}T00:00:00.000Z`);
      if (lastLogged > end) end = lastLogged;
    }
  }
  return { start: startOfDay(start), end };
}

export function dayKey(d: Date): string {
  return startOfDay(d).toISOString().slice(0, 10);
}
