/** Pure date helpers for ERP schedule / Gantt (no external deps beyond
 * dates.ts, itself dependency-free). */

// A plain `text.includes(query)` requires the whole typed phrase to appear
// contiguously and in order, which fails for a very common search pattern:
// "<project name> <unit number>", where the unit number sits at the end of
// a longer descriptive title (e.g. "J Centra Burlington - Building 5000 -
// Unit 5101" doesn't contain "J Centra 5101" as a substring even though
// every word is in there). Splitting the query into words and requiring
// each one to appear somewhere (in any order) fixes that without pulling in
// a fuzzy-search dependency.
export function matchesSearchQuery(text: string, query: string): boolean {
  const haystack = text.toLowerCase();
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return words.every((w) => haystack.includes(w));
}

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
  /** Per-day individual LaborEntry rows (worker, hours, clock-in, and what
   * scope of work they logged), plus one synthetic row per contractor
   * confirmed that day via a ContractorAssignment (see
   * contractorAssignmentDayKeys) — powers the read-only labor detail card on
   * the calendar. Editing happens on the project's Labor log, not here.
   * sovItemDescriptions is the SOV item(s) that entry's work covers
   * (Post-Construction); taskDescription is the free-text/turnover-scope
   * task otherwise — see ProjectLaborSection for how each gets set.
   * contractorOnly marks the synthetic rows — a contractor engagement
   * confirms the day the same way a LaborEntry does for an employee, it
   * just has no shift-level hours/clock-in to show (hours is always 0),
   * so the card can render it as "Confirmed" instead of a misleading
   * "0 hrs". */
  laborEntriesByDay: Record<
    string,
    {
      workerName: string;
      hours: number;
      clockIn: string | null;
      taskDescription: string | null;
      sovItemDescriptions: string[];
      contractorOnly?: boolean;
    }[]
  >;
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
  /** Subset of contractedScopeItems already marked done (see
   * TurnoverRequest.completedScopeItems). The day-assignment scope picker
   * excludes these, a finished item can't be put back on the calendar. */
  completedScopeItems: string[];
  /** This project's open change orders (id/title) — lets the day-assignment
   * modal offer a CO picker so a scheduled day can be tagged as covering
   * one or more of them. Excludes REJECTED/VOID COs. */
  changeOrders: { id: string; title: string }[];
  /** TurnoverRequest.buildingId, when this project is a turnover unit — lets
   * the month calendar collapse same-building units on a shared day into one
   * expandable chip. Null for anything else (including turnover-segment
   * projects with no linked TurnoverRequest, e.g. a monthly-contract row). */
  buildingId: string | null;
  /** Building.name, denormalized alongside buildingId purely so the calendar
   * doesn't need a separate building lookup to label the grouped chip. */
  buildingName: string | null;
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
  /** The CO's own current supervisor (ProjectChangeOrder.supervisorUserId),
   * mirroring ScheduleProject.supervisorUserId — drives the "needs a
   * supervisor" warning the same way. */
  supervisorUserId: string | null;
};

// A CO sitting in BILLING is functionally done — the work itself finished,
// it's just waiting on invoicing — so it should read as complete everywhere
// a plain `=== "COMPLETED"` check would otherwise miss it. Matches
// ChangeOrderDetailEditor.tsx's own "Complete ✓" badge, which already
// treats the two statuses the same way. Shared by SchedulePlanner.tsx (chip
// icon/fade) and CoDayPopover.tsx (read-only vs. still-planning card).
export function coIsComplete(status: string): boolean {
  return status === "COMPLETED" || status === "BILLING";
}

/** A planned supervisor and/or PM coverage of a ProjectChangeOrder on a
 * specific day (before any labor has actually been logged for it) — same
 * idea as ScheduleDayAssignment, scoped to the CO directly instead of the
 * parent project. No seriesId/sovItemIds/scopeItems, unlike the project
 * version — repeat-scheduling and SOV/scope tagging aren't offered for COs
 * yet. */
export type ScheduleCoDayAssignment = {
  id: string;
  changeOrderId: string;
  /** Day key (YYYY-MM-DD) this assignment is for. */
  dateKey: string;
  supervisorUserId: string | null;
  /** Set when only the PM covers this day, no supervisor. */
  projectManagerUserId: string | null;
  /** Optional "HH:MM" (24h) local times — all-day on the calendar invite if either is unset. */
  startTime: string | null;
  endTime: string | null;
  /** Free-text note about this day's coverage. */
  comment: string | null;
};

/** A worker (Employee or Contractor) planned onto a change order's work on a
 * future day, same idea as ScheduleWorkerAssignment but scoped to the CO
 * directly. Exactly one of employeeId/contractorId is set. */
export type ScheduleCoWorkerAssignment = {
  id: string;
  changeOrderId: string;
  employeeId: string | null;
  contractorId: string | null;
  /** Day key (YYYY-MM-DD) this assignment is for. */
  dateKey: string;
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
  /** Which SOV line item (Post-Construction) this worker covers this day,
   * when the day has more than one item picked — see
   * ProjectWorkerDayAssignment.assignedSovItemId. Null when there's nothing
   * to split, or a split hasn't been chosen yet. */
  assignedSovItemId: string | null;
  /** Which turnover scope category (Janitorial) this worker covers this
   * day, when the day has more than one scope picked — see
   * ProjectWorkerDayAssignment.assignedScopeItem. Null when there's nothing
   * to split, or a split hasn't been chosen yet. */
  assignedScopeItem: string | null;
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

// UTC-anchored date-label formatters, shared by every schedule surface that
// renders a dateKey/Date to a human-readable string. These used to be
// reimplemented (with small, easy-to-miss drifts) in SchedulePlanner.tsx,
// CoDayPopover.tsx, DayAssignmentModal.tsx, MiniCalendarPicker.tsx, and
// notifyReschedule.ts — consolidated here so a fix or format change only
// needs to happen once. All read dateKey as literal UTC midnight (see
// startOfDay above), never local time.

export function formatHours(hours: number): string {
  const n = Number.isInteger(hours) ? hours : hours.toFixed(1);
  return `${n} hr${hours === 1 ? "" : "s"}`;
}

/** Verbose "Monday, July 21" — for a single day-cell tooltip/header where
 * the day of week matters but the year (almost always the current one) can
 * be left off. */
export function dayCellLabel(dateKey: string): string {
  return new Date(`${dateKey}T00:00:00.000Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Same as dayCellLabel plus the year — "Monday, July 21, 2026" — for modal
 * headers where the picked day could roll into a different year (e.g.
 * "duplicate to more days"). */
export function dayCellLabelWithYear(dateKey: string): string {
  return new Date(`${dateKey}T00:00:00.000Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Compact "Jul 21" form, no weekday — for space-constrained copy like an
 * overdue chip's sentence, where a full dayCellLabel doesn't fit. */
export function formatShortDate(dateKey: string): string {
  return new Date(`${dateKey}T00:00:00.000Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Formal "July 21, 2026" form, no weekday — for email/notification copy. */
export function formatLongDate(dateKey: string): string {
  return new Date(`${dateKey}T00:00:00.000Z`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "July 2026" — month-grid header, shared by the main calendar and the
 * MiniCalendarPicker. */
export function monthLabel(d: Date): string {
  return d.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

const MAX_CONTRACTOR_ASSIGNMENT_SPAN_DAYS = 180;

/**
 * Day keys a single ContractorAssignment / ChangeOrderContractorAssignment
 * row counts as confirmed work for. These tables record a contractor's
 * engagement (role/cost/date range), not hour-by-hour logged time the way
 * LaborEntry does for employees — but it's still a real, already-happened
 * engagement, not a future plan (ScheduleWorkerAssignment /
 * ScheduleDayAssignment already cover "planned"), which is why the calendar
 * should treat it the same as a logged day, not leave contractor-only work
 * invisible or stuck looking like it "needs a supervisor".
 *
 * `assignedDate`, when set, is treated as one specific day. Otherwise
 * startDate..endDate (inclusive) is used, capped at
 * MAX_CONTRACTOR_ASSIGNMENT_SPAN_DAYS so a row with a missing or
 * far-future endDate can't flood the calendar with months of markers. A
 * startDate with no endDate counts as just that one day, not an
 * open-ended range.
 */
export function contractorAssignmentDayKeys(assignedDate: Date | null, startDate: Date | null, endDate: Date | null): string[] {
  if (assignedDate) return [dayKey(assignedDate)];
  if (!startDate) return [];
  const start = startOfDay(startDate);
  const end = endDate ? startOfDay(endDate) : start;
  if (end < start) return [dayKey(start)];
  const keys: string[] = [];
  let cursor = start;
  for (let i = 0; i <= MAX_CONTRACTOR_ASSIGNMENT_SPAN_DAYS && cursor <= end; i++) {
    keys.push(dayKey(cursor));
    cursor = addDays(cursor, 1);
  }
  return keys;
}

export type ProjectSpanMarkerKind = "needsSupervisor" | "spanEndpoint";

/** One occurrence of a project's declared start or end date claiming a
 * calendar day, on a day that isn't otherwise represented by logged work or
 * an explicit ScheduleDayAssignment. `kind` is already resolved — the
 * caller doesn't need to re-derive "is this the loud warning or the quiet
 * marker" itself. */
export type ProjectSpanMarker = { project: ScheduleProject; role: "start" | "end"; kind: ProjectSpanMarkerKind };

/**
 * The month calendar has exactly two ways a project's own declared
 * projectDate/projectEndDate can end up needing a marker on that day: as a
 * loud "starting soon, needs a supervisor" alert, or as a quiet "starts/ends
 * here, not otherwise scheduled" note. Both cases only apply when the day
 * isn't already covered by logged labor or a planned day-assignment — this
 * function is the single place that decides that, for both cases at once,
 * from one shared read of `dayAssignments`.
 *
 * Before this, the two cases were computed by two entirely separate passes
 * over `projects`, each rebuilding its own "is this day already covered"
 * check by hand. Keeping those in sync across every future addition (change
 * orders, SOV requests, building-grouping) was easy to get subtly wrong —
 * concretely, this shared check is what a project rendering twice on the
 * same day (once as the alert, once as the plain marker) turned out to be
 * missing. Any future state that also needs to claim a project's
 * span-endpoint day should be added as a branch in here, not as a third
 * parallel pass over `projects`.
 *
 * Classification:
 *  - "needsSupervisor": the project has no supervisor at all (checking
 *    `supervisorOverrides` first, so an assignment made earlier in this same
 *    session clears the alert without a page refresh) and no logged work on
 *    any day, and isn't complete/archived.
 *  - "spanEndpoint": everything else not already excluded above — has a
 *    supervisor, or has logged work on some other day — so the date doesn't
 *    just silently not exist on the calendar.
 *
 * Deliberately not limited to today-or-later: a project whose date already
 * passed with nobody ever assigned and nothing ever logged used to just
 * vanish from the calendar the moment "today" passed it, instead of turning
 * into an overdue warning the way a missed ScheduleDayAssignment already
 * does. The caller renders past occurrences with the same chip, just
 * "missed" copy instead of "starting soon".
 */
export function computeProjectSpanMarkersByDay(
  projects: ScheduleProject[],
  dayAssignments: ScheduleDayAssignment[],
  supervisorOverrides: Record<string, string | null>
): Map<string, ProjectSpanMarker[]> {
  const plannedDayPairs = new Set(dayAssignments.map((a) => `${a.projectId}:${a.dateKey}`));
  const map = new Map<string, ProjectSpanMarker[]>();

  for (const p of projects) {
    if (p.status === "ARCHIVED") continue;
    if (!p.projectDate) continue;

    const supervisorId = (p.id in supervisorOverrides ? supervisorOverrides[p.id] : p.supervisorUserId) ?? "";
    const hasLoggedWork = p.workDayKeys.length > 0;
    const isUnsupervisedAndUnworked = !supervisorId && !hasLoggedWork;
    // A complete project never needs the loud "needs supervisor" warning —
    // there's nothing left to do — but it still gets a quiet spanEndpoint
    // marker on its start/end day rather than vanishing outright, even when
    // it never had a supervisor or any logged work before being marked done
    // (e.g. via the calendar event popover's own "Mark complete" button —
    // the chip disappearing right after the action that produced this exact
    // state read as broken, not "nothing left to flag").
    const kind: ProjectSpanMarkerKind = isUnsupervisedAndUnworked && p.status !== "COMPLETE" ? "needsSupervisor" : "spanEndpoint";

    // projectDate/projectEndDate are stored as UTC midnight for the intended
    // calendar day (e.g. "2026-07-27T00:00:00.000Z" means July 27, full
    // stop) — slicing the ISO string directly reads that day back out.
    // Routing it through `new Date(...)` + dayKey() instead would
    // re-interpret it in the browser's local timezone, shifting it a day
    // earlier for anyone west of UTC.
    const startK = p.projectDate.slice(0, 10);
    const endK = p.projectEndDate ? p.projectEndDate.slice(0, 10) : null;
    const occurrences: { k: string; role: "start" | "end" }[] =
      endK && endK !== startK ? [{ k: startK, role: "start" }, { k: endK, role: "end" }] : [{ k: startK, role: "start" }];

    const workDayKeySet = new Set(p.workDayKeys);
    for (const { k, role } of occurrences) {
      if (workDayKeySet.has(k)) continue; // logged work already represents this day
      if (plannedDayPairs.has(`${p.id}:${k}`)) continue; // a planned day-assignment already represents this day
      const list = map.get(k) ?? [];
      list.push({ project: p, role, kind });
      map.set(k, list);
    }
  }

  return map;
}

