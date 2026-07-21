"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CollapsibleSection } from "./CollapsibleSection";
import { DayAssignmentModal } from "./DayAssignmentModal";
import {
  addDays,
  dayKey,
  monthMatrix,
  projectWindow,
  startOfDay,
  startOfMonth,
  type ScheduleChangeOrder,
  type ScheduleDayAssignment,
  type ScheduleProject,
  type ScheduleWorkerAssignment,
} from "@/lib/erp/schedule";
import { todayEasternAsUtcMidnight } from "@/lib/erp/dates";
import { normalizeProjectSegment, type ProjectSegment } from "@/lib/erp/projectSegments";

const PX_PER_DAY = 10;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function statusBarClass(status: string): string {
  switch (status) {
    case "ACTIVE":
      return "bg-pink-600/90 hover:bg-pink-500";
    case "ON_HOLD":
      return "bg-amber-600/90 hover:bg-amber-500";
    case "COMPLETE":
      return "bg-emerald-700/90 hover:bg-emerald-600";
    case "ARCHIVED":
      return "bg-zinc-600/90 hover:bg-zinc-500";
    default:
      return "bg-pink-600/80";
  }
}

// Calendar-only grouping of project types — commercial painting and
// commercial cleaning are shown together as "Post-construction" here, even
// though they remain distinct segments everywhere else in the app (forms,
// filters, billing). Projects whose segment is itself CHANGE_ORDER are
// folded into "Other" here — that's a different, rarely-used thing from the
// blue "Change order (CO)" items below (ProjectChangeOrder records attached
// to a parent project), and not worth its own filter/legend entry.
type CalendarSegmentGroup = "POST_CONSTRUCTION" | "JANITORIAL_TURNOVER_REQUESTS" | "REAL_ESTATE" | "OTHER";

const CALENDAR_GROUP_LABEL: Record<CalendarSegmentGroup, string> = {
  POST_CONSTRUCTION: "Post-construction",
  JANITORIAL_TURNOVER_REQUESTS: "Janitorial turnover requests",
  REAL_ESTATE: "Real estate",
  OTHER: "Other",
};

const CHANGE_ORDER_CHIP_CLASS = "bg-blue-100 text-blue-800 hover:bg-blue-200";
const CHANGE_ORDER_SWATCH_CLASS = "bg-blue-100";
const CHANGE_ORDER_LABEL = "Change order (CO)";

// Dashed border marks a chip as "planned" (a supervisor was assigned ahead
// of time via ProjectDayAssignment) as opposed to "confirmed" (an actual
// LaborEntry was logged for that project on that day). Red instead of gray
// once that day has passed with no log — it's a missed assignment, not just
// an upcoming plan.
const PLANNED_CHIP_EXTRA_CLASS = "border border-dashed border-gray-500";
const OVERDUE_PLANNED_CHIP_EXTRA_CLASS = "border border-dashed border-red-500";

// A project with a future (or today's) start date that has never had a
// supervisor assigned and has no logged work at all — solid, loud, and
// rendered above everything else in the cell so it can't be missed or
// buried behind "+N more" the way a low-priority item could be.
const NEEDS_SUPERVISOR_CHIP_CLASS =
  "flex items-center gap-1 truncate rounded border-2 border-amber-600 bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-amber-950 shadow transition-colors hover:bg-amber-300";

// Muted, pastel-ish colors keyed by calendar group — used for the
// month-calendar chips, which need to read as a scannable legend rather than
// compete for attention the way the status-colored Gantt bars do.
const CALENDAR_GROUP_CHIP_CLASS: Record<CalendarSegmentGroup, string> = {
  POST_CONSTRUCTION: "bg-pink-200 text-pink-900 hover:bg-pink-300",
  JANITORIAL_TURNOVER_REQUESTS: "bg-green-200 text-green-900 hover:bg-green-300",
  REAL_ESTATE: "bg-purple-200 text-purple-900 hover:bg-purple-300",
  OTHER: "bg-slate-200 text-slate-800 hover:bg-slate-300",
};

const CALENDAR_GROUP_SWATCH_CLASS: Record<CalendarSegmentGroup, string> = {
  POST_CONSTRUCTION: "bg-pink-200",
  JANITORIAL_TURNOVER_REQUESTS: "bg-green-200",
  REAL_ESTATE: "bg-purple-200",
  OTHER: "bg-slate-200",
};

const SEGMENT_TO_CALENDAR_GROUP: Record<ProjectSegment, CalendarSegmentGroup> = {
  COMMERCIAL_PAINTING: "POST_CONSTRUCTION",
  COMMERCIAL_CLEANING: "POST_CONSTRUCTION",
  CHANGE_ORDER: "OTHER",
  JANITORIAL_TURNOVER_REQUESTS: "JANITORIAL_TURNOVER_REQUESTS",
  REAL_ESTATE: "REAL_ESTATE",
  OTHER: "OTHER",
};

function calendarSegmentGroup(segment: string): CalendarSegmentGroup {
  return SEGMENT_TO_CALENDAR_GROUP[normalizeProjectSegment(segment)];
}

function formatHours(hours: number): string {
  const n = Number.isInteger(hours) ? hours : hours.toFixed(1);
  return `${n} hr${hours === 1 ? "" : "s"}`;
}

// "CO" (ProjectChangeOrder, blue) isn't a project segment — it's layered on
// top as its own filterable type alongside the segment-based groups.
type ProjectTypeFilter = CalendarSegmentGroup | "CO";

const PROJECT_TYPE_FILTER_OPTIONS: { value: ProjectTypeFilter; label: string; swatch: string }[] = [
  { value: "POST_CONSTRUCTION", label: CALENDAR_GROUP_LABEL.POST_CONSTRUCTION, swatch: CALENDAR_GROUP_SWATCH_CLASS.POST_CONSTRUCTION },
  { value: "CO", label: CHANGE_ORDER_LABEL, swatch: CHANGE_ORDER_SWATCH_CLASS },
  { value: "JANITORIAL_TURNOVER_REQUESTS", label: CALENDAR_GROUP_LABEL.JANITORIAL_TURNOVER_REQUESTS, swatch: CALENDAR_GROUP_SWATCH_CLASS.JANITORIAL_TURNOVER_REQUESTS },
  { value: "REAL_ESTATE", label: CALENDAR_GROUP_LABEL.REAL_ESTATE, swatch: CALENDAR_GROUP_SWATCH_CLASS.REAL_ESTATE },
  { value: "OTHER", label: CALENDAR_GROUP_LABEL.OTHER, swatch: CALENDAR_GROUP_SWATCH_CLASS.OTHER },
];

const ALL_PROJECT_TYPE_FILTERS = PROJECT_TYPE_FILTER_OPTIONS.map((o) => o.value);

function monthLabel(d: Date): string {
  return d.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

type Supervisor = { id: string; displayName: string };
type Employee = { id: string; displayName: string };

export function SchedulePlanner({
  projects,
  supervisors,
  changeOrders,
  initialDayAssignments,
  canFilterBySupervisor,
  employees,
  initialWorkerAssignments,
}: {
  projects: ScheduleProject[];
  supervisors: Supervisor[];
  changeOrders: ScheduleChangeOrder[];
  initialDayAssignments: ScheduleDayAssignment[];
  canFilterBySupervisor: boolean;
  employees: Employee[];
  initialWorkerAssignments: ScheduleWorkerAssignment[];
}) {
  // Anchors the whole calendar (which month/day is "today") to Eastern time,
  // not the viewer's own device timezone — otherwise a viewer far enough
  // ahead of Eastern sees the month grid's "today" land on the wrong cell
  // (confirmed: someone 6 hours ahead saw Tuesday highlighted as Wednesday).
  const todayDate = todayEasternAsUtcMidnight();
  const [cursor, setCursor] = useState(() => startOfMonth(todayDate));
  const [selectedSupervisorId, setSelectedSupervisorId] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<Set<ProjectTypeFilter>>(() => new Set(ALL_PROJECT_TYPE_FILTERS));
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const filtersActive = selectedSupervisorId !== "" || selectedTypes.size < ALL_PROJECT_TYPE_FILTERS.length;

  useEffect(() => {
    if (!filterOpen) return;
    function onMouseDown(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [filterOpen]);

  function toggleType(t: ProjectTypeFilter) {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  // Planned (future) supervisor assignments — click a day to add one. Local
  // state so create/delete reflect immediately without a full page reload.
  const [dayAssignments, setDayAssignments] = useState(initialDayAssignments);
  const [openDayKey, setOpenDayKey] = useState<string | null>(null);
  const [openDayInitialProjectId, setOpenDayInitialProjectId] = useState<string | null>(null);
  const [deletingAssignmentId, setDeletingAssignmentId] = useState<string | null>(null);
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  // Planned worker (crew) assignments — same local-state pattern as supervisor
  // day assignments, but no invite email is sent for these.
  const [workerAssignments, setWorkerAssignments] = useState(initialWorkerAssignments);

  // "+N more" popover — lists everything on a day without needing the full
  // assign-a-supervisor modal. Only one open at a time, closes on outside click.
  const [expandedDayKey, setExpandedDayKey] = useState<string | null>(null);
  const overflowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!expandedDayKey) return;
    function onMouseDown(e: MouseEvent) {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setExpandedDayKey(null);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [expandedDayKey]);

  // Deletes a planned (ProjectDayAssignment) entry directly from its chip —
  // works on any day, including past ones where the "+" button is hidden, so
  // stale planned entries that never got a real labor log can still be
  // cleared. Never touches confirmed (labor-log-based) calendar entries.
  async function handleDeleteAssignment(id: string) {
    setDeletingAssignmentId(id);
    const previous = dayAssignments;
    setDayAssignments((prev) => prev.filter((a) => a.id !== id));
    try {
      const res = await fetch(`/api/erp/schedule/day-assignments/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to remove");
    } catch {
      setDayAssignments(previous);
    } finally {
      setDeletingAssignmentId(null);
    }
  }

  // Local overrides so reassigning a supervisor updates the dropdown right
  // away, without waiting on a full server round-trip / router.refresh().
  const [supervisorOverrides, setSupervisorOverrides] = useState<Record<string, string | null>>({});
  const [savingProjectId, setSavingProjectId] = useState<string | null>(null);
  const [errorProjectId, setErrorProjectId] = useState<string | null>(null);

  function currentSupervisorId(p: ScheduleProject): string {
    return (p.id in supervisorOverrides ? supervisorOverrides[p.id] : p.supervisorUserId) ?? "";
  }

  async function handleSupervisorChange(p: ScheduleProject, nextId: string) {
    const previous = currentSupervisorId(p);
    const value = nextId || null;
    setSupervisorOverrides((o) => ({ ...o, [p.id]: value }));
    setSavingProjectId(p.id);
    setErrorProjectId(null);
    try {
      const res = await fetch(`/api/erp/projects/${p.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ supervisorUserId: value }),
      });
      if (!res.ok) throw new Error("Update failed");
    } catch {
      setSupervisorOverrides((o) => ({ ...o, [p.id]: previous || null }));
      setErrorProjectId(p.id);
    } finally {
      setSavingProjectId(null);
    }
  }

  // Gantt only shows active projects — on hold / complete / archived jobs
  // don't need a place on the timeline. Open-ended projects (no end date —
  // i.e. not finished) are listed first; sort is stable so the existing
  // start-date ordering is preserved within each group.
  const windows = useMemo(
    () =>
      projects
        .filter((p) => p.status === "ACTIVE")
        .slice()
        .sort((a, b) => (a.projectEndDate ? 1 : 0) - (b.projectEndDate ? 1 : 0))
        .map((p) => ({ p, ...projectWindow(p) })),
    [projects],
  );

  const ganttRange = useMemo(() => {
    if (windows.length === 0) {
      return { start: addDays(todayDate, -7), end: addDays(todayDate, 60) };
    }
    let min = windows[0]!.start;
    let max = windows[0]!.end;
    for (const w of windows) {
      if (w.start < min) min = w.start;
      if (w.end > max) max = w.end;
    }
    return { start: addDays(min, -7), end: addDays(max, 14) };
  }, [windows, todayDate]);

  const totalDays = Math.max(
    1,
    Math.ceil((ganttRange.end.getTime() - ganttRange.start.getTime()) / (86400000)) + 1,
  );
  const timelineWidth = totalDays * PX_PER_DAY;

  const dayOffset = (d: Date) =>
    Math.floor((startOfDay(d).getTime() - ganttRange.start.getTime()) / 86400000);

  const todayOffsetPx = dayOffset(todayDate) * PX_PER_DAY;

  const ganttScrollRef = useRef<HTMLDivElement>(null);

  function scrollGanttToToday(behavior: ScrollBehavior = "auto") {
    const el = ganttScrollRef.current;
    if (!el) return;
    const target = Math.max(0, todayOffsetPx - PX_PER_DAY * 3);
    el.scrollTo({ left: target, behavior });
  }

  function scrollGanttBy(days: number) {
    ganttScrollRef.current?.scrollBy({ left: days * PX_PER_DAY, behavior: "smooth" });
  }

  // Default the Gantt to today on first load, rather than wherever the
  // earliest project happens to start (which could be months back).
  useEffect(() => {
    scrollGanttToToday();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const matrix = useMemo(() => monthMatrix(cursor), [cursor]);

  const presentGroups = useMemo(() => {
    const seen = new Set<CalendarSegmentGroup>();
    for (const p of projects) seen.add(calendarSegmentGroup(p.segment));
    return Array.from(seen);
  }, [projects]);

  // Day cells are driven by actual logged work (workDayKeys), not the
  // project's full start/end span — a two-week project isn't worked every
  // day, so it shouldn't claim every day on the calendar.
  const projectsByDay = useMemo(() => {
    const map = new Map<string, ScheduleProject[]>();
    for (const p of projects) {
      for (const k of p.workDayKeys) {
        const list = map.get(k) ?? [];
        list.push(p);
        map.set(k, list);
      }
    }
    return map;
  }, [projects]);

  const changeOrdersByDay = useMemo(() => {
    const map = new Map<string, ScheduleChangeOrder[]>();
    for (const co of changeOrders) {
      for (const k of co.workDayKeys) {
        const list = map.get(k) ?? [];
        list.push(co);
        map.set(k, list);
      }
    }
    return map;
  }, [changeOrders]);

  // Projects starting today or later that have never had a supervisor
  // assigned and have no logged work yet — otherwise these are invisible on
  // the calendar until someone happens to notice and assign a supervisor.
  // Anchored to the project's own start date since there's no day
  // assignment or labor log to place them by.
  const needsSupervisorByDay = useMemo(() => {
    const map = new Map<string, ScheduleProject[]>();
    const todayK = dayKey(todayDate);
    for (const p of projects) {
      // Reads through supervisorOverrides (not just p.supervisorUserId) so
      // the alert disappears the moment a supervisor is assigned, instead of
      // waiting on a full page refresh.
      const supervisorId = (p.id in supervisorOverrides ? supervisorOverrides[p.id] : p.supervisorUserId) ?? "";
      if (supervisorId) continue;
      if (p.workDayKeys.length > 0) continue;
      if (p.status === "COMPLETE" || p.status === "ARCHIVED") continue;
      if (!p.projectDate) continue;
      // projectDate is stored as UTC midnight for the intended calendar day
      // (e.g. "2026-07-27T00:00:00.000Z" means July 27, full stop) — slicing
      // the ISO string directly reads that day back out. Routing it through
      // `new Date(...)` + dayKey() instead would re-interpret it in the
      // browser's local timezone, shifting it a day earlier for anyone west
      // of UTC (confirmed: shifted 7/27 to 7/26 in America/New_York).
      const k = p.projectDate.slice(0, 10);
      if (k < todayK) continue;
      const list = map.get(k) ?? [];
      list.push(p);
      map.set(k, list);
    }
    return map;
  }, [projects, supervisorOverrides, todayDate]);

  const plannedByDay = useMemo(() => {
    const map = new Map<string, ScheduleDayAssignment[]>();
    for (const a of dayAssignments) {
      const list = map.get(a.dateKey) ?? [];
      list.push(a);
      map.set(a.dateKey, list);
    }
    return map;
  }, [dayAssignments]);

  // Which supervisor covers a project on a given day, for the supervisor
  // filter — prefers that day's specific planned assignment, falling back to
  // the project's overall supervisor when no day-level assignment exists.
  function projectSupervisorOnDay(projectId: string, k: string): string {
    const dayAssignment = (plannedByDay.get(k) ?? []).find((a) => a.projectId === projectId);
    if (dayAssignment) return dayAssignment.supervisorUserId;
    const project = projectById.get(projectId);
    return project ? currentSupervisorId(project) : "";
  }

  function prevMonth() {
    setCursor((c) => new Date(Date.UTC(c.getUTCFullYear(), c.getUTCMonth() - 1, 1)));
  }
  function nextMonth() {
    setCursor((c) => new Date(Date.UTC(c.getUTCFullYear(), c.getUTCMonth() + 1, 1)));
  }

  const sameMonth = (a: Date, b: Date) => a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear();
  const todayKey = dayKey(todayDate);

  const calendarNav = (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={prevMonth}
          aria-label="Previous month"
          className="flex h-7 w-7 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-800"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="min-w-[120px] text-center text-sm font-semibold text-gray-800">{monthLabel(cursor)}</span>
        <button
          type="button"
          onClick={nextMonth}
          aria-label="Next month"
          className="flex h-7 w-7 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-800"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
      <div className="relative" ref={filterRef}>
        <button
          type="button"
          onClick={() => setFilterOpen((v) => !v)}
          aria-label="Filter calendar"
          className={`flex h-8 w-8 items-center justify-center rounded-md border transition-colors ${
            filtersActive
              ? "border-pink-300 bg-pink-50 text-pink-600"
              : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 4.5h18M6.75 12h10.5M10.5 19.5h3"
            />
          </svg>
        </button>
        {filterOpen ? (
          <div className="absolute right-0 z-20 mt-2 w-60 rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
            {canFilterBySupervisor ? (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Supervisor</p>
                <div className="mt-1.5 max-h-36 space-y-1 overflow-y-auto">
                  <label className="flex items-center gap-2 text-xs text-gray-700">
                    <input
                      type="radio"
                      name="supervisor-filter"
                      checked={selectedSupervisorId === ""}
                      onChange={() => setSelectedSupervisorId("")}
                      className="h-3.5 w-3.5 border-gray-300 text-pink-600 focus:ring-pink-400"
                    />
                    All supervisors
                  </label>
                  {supervisors.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-xs text-gray-700">
                      <input
                        type="radio"
                        name="supervisor-filter"
                        checked={selectedSupervisorId === s.id}
                        onChange={() => setSelectedSupervisorId(s.id)}
                        className="h-3.5 w-3.5 border-gray-300 text-pink-600 focus:ring-pink-400"
                      />
                      {s.displayName}
                    </label>
                  ))}
                </div>
                <div className="my-3 border-t border-gray-100" />
              </div>
            ) : null}

            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Project type</p>
            <div className="mt-1.5 space-y-1">
              {PROJECT_TYPE_FILTER_OPTIONS.map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 text-xs text-gray-700">
                  <input
                    type="checkbox"
                    checked={selectedTypes.has(opt.value)}
                    onChange={() => toggleType(opt.value)}
                    className="h-3.5 w-3.5 rounded border-gray-300 text-pink-600 focus:ring-pink-400"
                  />
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${opt.swatch}`} />
                  {opt.label}
                </label>
              ))}
            </div>

            {filtersActive ? (
              <button
                type="button"
                onClick={() => {
                  setSelectedSupervisorId("");
                  setSelectedTypes(new Set(ALL_PROJECT_TYPE_FILTERS));
                }}
                className="mt-3 w-full rounded border border-gray-200 py-1 text-[11px] font-medium text-gray-500 hover:bg-gray-50"
              >
                Clear filters
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );

  const ganttNav = (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => scrollGanttBy(-14)}
        aria-label="Scroll timeline earlier"
        className="flex h-7 w-7 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-800"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => scrollGanttToToday("smooth")}
        className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 transition-colors hover:border-pink-300 hover:text-pink-600"
      >
        Today
      </button>
      <button
        type="button"
        onClick={() => scrollGanttBy(14)}
        aria-label="Scroll timeline later"
        className="flex h-7 w-7 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-800"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );

  return (
    <div className="space-y-6">
      <CollapsibleSection title="Calendar" headerExtra={calendarNav}>
        <div className="overflow-x-auto">
          <div className="min-w-[720px]">
            <div className="grid grid-cols-7 gap-px rounded-lg border border-gray-200 bg-gray-200 text-center text-[10px] font-medium uppercase text-gray-500">
              {WEEKDAYS.map((d) => (
                <div key={d} className="bg-gray-50 py-2">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-px border border-t-0 border-gray-200 bg-gray-200">
              {matrix.flat().map((cell, i) => {
                const k = dayKey(cell);
                const inMonth = sameMonth(cell, cursor);
                const isToday = k === todayKey;
                const isFutureOrToday = k >= todayKey;
                // The grid sits in an overflow-x-auto wrapper, which per the
                // CSS spec also clips overflow on both axes — so a tooltip
                // that opens downward off the last row, or rightward off a
                // column too close to the right edge, gets cut off. Flip
                // direction near those edges. Tooltip is up to 220px wide and
                // each of the 7 columns is only ~103px (720px grid), so it
                // needs ~2.2 columns of room — the last TWO columns (not just
                // Saturday) have to open leftward instead.
                const isLastRow = Math.floor(i / 7) === matrix.length - 1;
                const isNearRightEdge = i % 7 >= 5;
                const tooltipPositionClass = `${isLastRow ? "bottom-full mb-1" : "top-full mt-1"} ${
                  isNearRightEdge ? "right-0" : "left-0"
                }`;

                let dayProjects = projectsByDay.get(k) ?? [];
                let dayPlannedRaw = plannedByDay.get(k) ?? [];
                let dayChangeOrders = changeOrdersByDay.get(k) ?? [];
                // Unassigned by definition, so a supervisor filter can never
                // match one — hide rather than show under the wrong supervisor.
                let dayNeedsSupervisor = selectedSupervisorId ? [] : needsSupervisorByDay.get(k) ?? [];

                if (selectedSupervisorId) {
                  dayProjects = dayProjects.filter(
                    (p) => projectSupervisorOnDay(p.id, k) === selectedSupervisorId,
                  );
                  dayPlannedRaw = dayPlannedRaw.filter((a) => a.supervisorUserId === selectedSupervisorId);
                  dayChangeOrders = dayChangeOrders.filter(
                    (co) => projectSupervisorOnDay(co.projectId, k) === selectedSupervisorId,
                  );
                }

                dayProjects = dayProjects.filter((p) => selectedTypes.has(calendarSegmentGroup(p.segment)));
                dayChangeOrders = selectedTypes.has("CO") ? dayChangeOrders : [];
                dayPlannedRaw = dayPlannedRaw.filter((a) => {
                  const project = projectById.get(a.projectId);
                  return project ? selectedTypes.has(calendarSegmentGroup(project.segment)) : false;
                });
                dayNeedsSupervisor = dayNeedsSupervisor.filter((p) => selectedTypes.has(calendarSegmentGroup(p.segment)));

                const confirmedProjectIds = new Set(dayProjects.map((p) => p.id));
                // Planned assignments are only shown when there's no confirmed
                // labor log yet for that project/day — once real work is
                // logged, the confirmed chip takes over.
                const dayPlanned = dayPlannedRaw
                  .filter((a) => !confirmedProjectIds.has(a.projectId))
                  .map((a) => ({ assignment: a, project: projectById.get(a.projectId) }))
                  .filter((x): x is { assignment: ScheduleDayAssignment; project: ScheduleProject } => !!x.project);

                const totalCount = dayProjects.length + dayPlanned.length + dayChangeOrders.length;
                const visibleProjects = dayProjects.slice(0, 4);
                const remainingAfterProjects = Math.max(0, 4 - visibleProjects.length);
                const visiblePlanned = dayPlanned.slice(0, remainingAfterProjects);
                const remainingAfterPlanned = Math.max(0, remainingAfterProjects - visiblePlanned.length);
                const visibleChangeOrders = dayChangeOrders.slice(0, remainingAfterPlanned);
                const overflow =
                  totalCount - visibleProjects.length - visiblePlanned.length - visibleChangeOrders.length;

                return (
                  <div
                    key={`${k}-${i}`}
                    className={`min-h-[92px] bg-white p-1.5 text-left ${inMonth ? "" : "opacity-40"} ${isToday ? "ring-1 ring-inset ring-pink-400 bg-pink-50/40" : ""}`}
                  >
                    <div className="flex items-center justify-between">
                      <div
                        className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-medium ${
                          isToday ? "bg-pink-600 text-white" : "text-gray-500"
                        }`}
                      >
                        {cell.getUTCDate()}
                      </div>
                      {isFutureOrToday ? (
                        <button
                          type="button"
                          onClick={() => {
                            setOpenDayKey(k);
                            setOpenDayInitialProjectId(null);
                          }}
                          title="Assign a supervisor to a project on this day"
                          className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-gray-300 text-base font-bold leading-none text-gray-400 hover:border-pink-400 hover:bg-pink-50 hover:text-pink-500"
                        >
                          +
                        </button>
                      ) : null}
                    </div>
                    {dayNeedsSupervisor.length > 0 ? (
                      <ul className="mt-1 space-y-1">
                        {dayNeedsSupervisor.map((p) => (
                          <li key={`needs-${p.id}`} className={inMonth ? "group relative" : "relative"}>
                            <button
                              type="button"
                              onClick={() => {
                                setOpenDayKey(k);
                                setOpenDayInitialProjectId(p.id);
                              }}
                              className={`w-full ${NEEDS_SUPERVISOR_CHIP_CLASS}`}
                            >
                              <span aria-hidden>⚠</span>
                              <span className="truncate">{p.jobTitle}</span>
                            </button>
                            {inMonth ? (
                              <div className={`pointer-events-none absolute z-30 hidden w-max max-w-[220px] rounded-md bg-gray-900 px-2.5 py-1.5 text-[10px] leading-snug text-white shadow-lg group-hover:block ${tooltipPositionClass}`}>
                                <div className="font-semibold">{p.jobTitle}</div>
                                <div className="text-amber-300">
                                  {isToday ? "Starts today" : "Starts this day"} — no supervisor assigned yet
                                </div>
                                <div className="mt-1 text-gray-300">Click to assign one</div>
                              </div>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <ul className="mt-1 space-y-1">
                      {visibleProjects.map((p) => {
                        const summary = p.laborByDay[k];
                        const loggedWorkers = new Set(summary?.workers ?? []);
                        const plannedWorkers = (p.plannedWorkersByDay[k] ?? []).filter((w) => !loggedWorkers.has(w));
                        return (
                          <li key={`p-${p.id}`} className={inMonth ? "group relative" : "relative"}>
                            <Link
                              href={`/erp/projects/${p.id}`}
                              className={`flex items-center gap-1 truncate rounded px-1.5 py-0.5 text-[10px] font-medium shadow-sm transition-colors ${CALENDAR_GROUP_CHIP_CLASS[calendarSegmentGroup(p.segment)]}`}
                            >
                              <span className="truncate">{p.jobTitle}</span>
                            </Link>
                            {inMonth ? (
                              <div className={`pointer-events-none absolute z-30 hidden w-max max-w-[220px] rounded-md bg-gray-900 px-2.5 py-1.5 text-[10px] leading-snug text-white shadow-lg group-hover:block ${tooltipPositionClass}`}>
                                <div className="font-semibold">{p.jobTitle}</div>
                                <div className="text-gray-300">{CALENDAR_GROUP_LABEL[calendarSegmentGroup(p.segment)]}</div>
                                {summary ? (
                                  <>
                                    <div className="mt-1">{formatHours(summary.hours)} logged</div>
                                    {summary.workers.length > 0 ? (
                                      <div className="text-gray-300">Workers: {summary.workers.join(", ")}</div>
                                    ) : null}
                                  </>
                                ) : null}
                                {plannedWorkers.length > 0 ? (
                                  <div className="mt-1 text-gray-300">Planned: {plannedWorkers.join(", ")}</div>
                                ) : null}
                              </div>
                            ) : null}
                          </li>
                        );
                      })}
                      {visiblePlanned.map(({ assignment, project }) => {
                        const isOverdue = !isFutureOrToday;
                        const plannedWorkers = project.plannedWorkersByDay[k] ?? [];
                        const supervisor = supervisors.find((s) => s.id === assignment.supervisorUserId);
                        return (
                        <li key={`plan-${assignment.id}`} className={inMonth ? "group relative" : "relative"}>
                          <Link
                            href={`/erp/projects/${project.id}`}
                            className={`flex items-center gap-1 truncate rounded py-0.5 pl-1.5 pr-4 text-[10px] font-medium shadow-sm transition-colors ${CALENDAR_GROUP_CHIP_CLASS[calendarSegmentGroup(project.segment)]} ${isOverdue ? OVERDUE_PLANNED_CHIP_EXTRA_CLASS : PLANNED_CHIP_EXTRA_CLASS}`}
                          >
                            <span className="truncate">{project.jobTitle}</span>
                          </Link>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              handleDeleteAssignment(assignment.id);
                            }}
                            disabled={deletingAssignmentId === assignment.id}
                            title="Remove this scheduled assignment"
                            className="absolute right-0.5 top-1/2 -translate-y-1/2 z-20 px-0.5 text-[11px] font-bold leading-none opacity-60 hover:opacity-100 disabled:opacity-30"
                          >
                            ×
                          </button>
                          {inMonth ? (
                            <div className={`pointer-events-none absolute z-30 hidden w-max max-w-[220px] rounded-md bg-gray-900 px-2.5 py-1.5 text-[10px] leading-snug text-white shadow-lg group-hover:block ${tooltipPositionClass}`}>
                              <div className="font-semibold">{project.jobTitle}</div>
                              <div className="text-gray-300">
                                {isOverdue ? "Scheduled but never logged" : "Planned, not yet logged"}
                              </div>
                              {supervisor ? <div className="text-gray-300">Supervisor: {supervisor.displayName}</div> : null}
                              {plannedWorkers.length > 0 ? (
                                <div className="mt-1 text-gray-300">Planned workers: {plannedWorkers.join(", ")}</div>
                              ) : null}
                            </div>
                          ) : null}
                        </li>
                        );
                      })}
                      {visibleChangeOrders.map((co) => {
                        const summary = co.laborByDay[k];
                        const parentProject = projectById.get(co.projectId);
                        return (
                          <li key={`co-${co.id}`} className={inMonth ? "group relative" : "relative"}>
                            <Link
                              href={`/erp/projects/${co.projectId}/change-orders/${co.id}`}
                              className={`flex items-center gap-1 truncate rounded px-1.5 py-0.5 text-[10px] font-medium shadow-sm transition-colors ${CHANGE_ORDER_CHIP_CLASS}`}
                            >
                              <span className="truncate">{co.title}</span>
                            </Link>
                            {inMonth ? (
                              <div className={`pointer-events-none absolute z-30 hidden w-max max-w-[220px] rounded-md bg-gray-900 px-2.5 py-1.5 text-[10px] leading-snug text-white shadow-lg group-hover:block ${tooltipPositionClass}`}>
                                <div className="font-semibold">{co.title}</div>
                                <div className="text-gray-300">{CHANGE_ORDER_LABEL}</div>
                                {parentProject ? <div className="text-gray-300">Project: {parentProject.jobTitle}</div> : null}
                                {summary ? (
                                  <>
                                    <div className="mt-1">{formatHours(summary.hours)} logged</div>
                                    {summary.workers.length > 0 ? (
                                      <div className="text-gray-300">Workers: {summary.workers.join(", ")}</div>
                                    ) : null}
                                  </>
                                ) : null}
                              </div>
                            ) : null}
                          </li>
                        );
                      })}
                      {overflow > 0 ? (
                        <li className="relative">
                          <button
                            type="button"
                            onClick={() => setExpandedDayKey((prev) => (prev === k ? null : k))}
                            className="px-1 text-[10px] font-medium text-gray-500 hover:text-pink-600 hover:underline"
                          >
                            +{overflow} more
                          </button>
                          {expandedDayKey === k ? (
                            <div
                              ref={overflowRef}
                              className={`absolute z-40 w-56 rounded-md bg-gray-900 px-2.5 py-2 text-[10px] leading-snug text-white shadow-lg ${tooltipPositionClass}`}
                            >
                              <div className="mb-1.5 font-semibold text-gray-300">
                                {cell.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}
                              </div>
                              <ul className="max-h-48 space-y-1 overflow-y-auto">
                                {dayProjects.map((p) => (
                                  <li key={`ov-p-${p.id}`} className="flex items-center gap-1.5">
                                    <span className={`h-2 w-2 shrink-0 rounded-sm ${CALENDAR_GROUP_SWATCH_CLASS[calendarSegmentGroup(p.segment)]}`} />
                                    <Link
                                      href={`/erp/projects/${p.id}`}
                                      onClick={() => setExpandedDayKey(null)}
                                      className="truncate hover:underline"
                                    >
                                      {p.jobTitle}
                                    </Link>
                                  </li>
                                ))}
                                {dayPlanned.map(({ assignment, project }) => (
                                  <li key={`ov-plan-${assignment.id}`} className="flex items-center gap-1.5">
                                    <span
                                      className={`h-2 w-2 shrink-0 rounded-sm border border-dashed ${
                                        isFutureOrToday ? "border-gray-400" : "border-red-500"
                                      } ${CALENDAR_GROUP_SWATCH_CLASS[calendarSegmentGroup(project.segment)]}`}
                                    />
                                    <Link
                                      href={`/erp/projects/${project.id}`}
                                      onClick={() => setExpandedDayKey(null)}
                                      className="truncate hover:underline"
                                    >
                                      {project.jobTitle}
                                    </Link>
                                    <span className={`shrink-0 ${isFutureOrToday ? "text-gray-400" : "text-red-400"}`}>
                                      {isFutureOrToday ? "(planned)" : "(missed)"}
                                    </span>
                                  </li>
                                ))}
                                {dayChangeOrders.map((co) => (
                                  <li key={`ov-co-${co.id}`} className="flex items-center gap-1.5">
                                    <span className={`h-2 w-2 shrink-0 rounded-sm ${CHANGE_ORDER_SWATCH_CLASS}`} />
                                    <Link
                                      href={`/erp/projects/${co.projectId}/change-orders/${co.id}`}
                                      onClick={() => setExpandedDayKey(null)}
                                      className="truncate hover:underline"
                                    >
                                      {co.title}
                                    </Link>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                        </li>
                      ) : null}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        {presentGroups.length > 0 || changeOrders.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-gray-100 pt-3">
            {presentGroups.map((group) => (
              <div key={group} className="flex items-center gap-1.5 text-[11px] text-gray-600">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${CALENDAR_GROUP_SWATCH_CLASS[group]}`} />
                {CALENDAR_GROUP_LABEL[group]}
              </div>
            ))}
            {changeOrders.length > 0 ? (
              <div className="flex items-center gap-1.5 text-[11px] text-gray-600">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${CHANGE_ORDER_SWATCH_CLASS}`} />
                {CHANGE_ORDER_LABEL}
              </div>
            ) : null}
            {dayAssignments.length > 0 ? (
              <div className="flex items-center gap-1.5 text-[11px] text-gray-600">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-sm bg-white ${PLANNED_CHIP_EXTRA_CLASS}`} />
                Dashed = planned, not yet logged
              </div>
            ) : null}
            {dayAssignments.some((a) => a.dateKey < todayKey) ? (
              <div className="flex items-center gap-1.5 text-[11px] text-gray-600">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-sm bg-white ${OVERDUE_PLANNED_CHIP_EXTRA_CLASS}`} />
                Red dashed = scheduled but never logged
              </div>
            ) : null}
            {needsSupervisorByDay.size > 0 ? (
              <div className="flex items-center gap-1.5 text-[11px] text-gray-600">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm border-2 border-amber-600 bg-amber-400" />
                ⚠ = starting soon, needs a supervisor
              </div>
            ) : null}
          </div>
        ) : null}
      </CollapsibleSection>

      <CollapsibleSection
        title="Gantt"
        description="Bars use start / end dates; without an end date a 14-day window is assumed."
        headerExtra={windows.length > 0 ? ganttNav : undefined}
      >
        {windows.length === 0 ? (
          <p className="text-sm text-gray-500">No projects yet. Create one in Projects → New project.</p>
        ) : (
          <div className="flex max-h-[min(70vh,720px)] flex-col overflow-hidden rounded-lg border border-gray-200">
            <div className="flex min-h-0 flex-1 overflow-auto">
              <div className="sticky left-0 z-10 w-[220px] shrink-0 border-r border-gray-200 bg-white">
                <div className="flex h-14 items-center border-b border-gray-200 px-3 text-[10px] font-semibold uppercase text-gray-500">
                  Project
                </div>
                {windows.map(({ p }, idx) => (
                  <div
                    key={p.id}
                    className={`flex h-14 flex-col justify-center gap-0.5 border-b border-gray-100 px-3 text-xs text-gray-800 ${
                      idx % 2 === 1 ? "bg-gray-50/60" : "bg-white"
                    }`}
                  >
                    <Link href={`/erp/projects/${p.id}`} className="truncate font-medium text-pink-600 hover:underline">
                      {p.jobTitle}
                    </Link>
                    <select
                      value={currentSupervisorId(p)}
                      onChange={(e) => handleSupervisorChange(p, e.target.value)}
                      disabled={savingProjectId === p.id}
                      className="w-full rounded border border-gray-200 bg-gray-50 px-1 py-0.5 text-[10px] text-gray-600 focus:border-pink-400 focus:outline-none disabled:opacity-60"
                    >
                      <option value="">— Unassigned —</option>
                      {supervisors.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.displayName}
                        </option>
                      ))}
                    </select>
                    {errorProjectId === p.id ? (
                      <span className="text-[9px] font-medium text-red-500">Failed to save — reverted</span>
                    ) : null}
                  </div>
                ))}
              </div>
              <div ref={ganttScrollRef} className="min-w-0 flex-1 overflow-x-auto">
                <div style={{ width: timelineWidth }} className="relative">
                  {/* Today column — highlighted so "where are we now" is obvious at a glance */}
                  {todayOffsetPx >= 0 && todayOffsetPx < timelineWidth ? (
                    <div
                      className="pointer-events-none absolute inset-y-0 z-0 border-x border-pink-200 bg-pink-50/70"
                      style={{ left: todayOffsetPx, width: PX_PER_DAY }}
                    />
                  ) : null}
                  <div
                    className="relative flex h-14 items-end border-b border-gray-200 bg-white/80 text-[10px] text-gray-500"
                    style={{ width: timelineWidth }}
                  >
                    {Array.from({ length: totalDays }).map((_, i) => {
                      const d = addDays(ganttRange.start, i);
                      const isTodayCol = i * PX_PER_DAY === todayOffsetPx;
                      const show =
                        isTodayCol || d.getUTCDate() === 1 || i === 0 || d.getUTCDay() === 0
                          ? isTodayCol
                            ? "Today"
                            : d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
                          : "";
                      return (
                        <div
                          key={i}
                          style={{ width: PX_PER_DAY, minWidth: PX_PER_DAY }}
                          className={`shrink-0 border-l border-gray-100 ${d.getUTCDay() === 0 ? "bg-gray-50" : ""}`}
                        >
                          {show ? (
                            <span className={`pl-0.5 ${isTodayCol ? "font-semibold text-pink-600" : ""}`}>{show}</span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                  {windows.map((w, idx) => {
                    const startOff = Math.max(0, dayOffset(w.start));
                    const endOff = Math.min(totalDays - 1, dayOffset(w.end));
                    const left = startOff * PX_PER_DAY;
                    const width = Math.max(PX_PER_DAY * 2, (endOff - startOff + 1) * PX_PER_DAY);
                    return (
                      <div
                        key={w.p.id}
                        className={`relative h-14 border-b border-gray-100 ${idx % 2 === 1 ? "bg-gray-50/40" : ""}`}
                        style={{ width: timelineWidth }}
                      >
                        <Link
                          href={`/erp/projects/${w.p.id}`}
                          title={`${w.p.jobTitle} — ${w.p.percentDone}% done`}
                          className={`absolute top-3 z-10 flex h-8 items-center rounded px-2 text-[11px] font-medium text-white shadow ring-1 ring-black/5 ${statusBarClass(w.p.status)}`}
                          style={{ left, width: Math.min(width, timelineWidth - left) }}
                        >
                          <span className="truncate">{w.p.segment}</span>
                          <span className="ml-2 opacity-80">{w.p.percentDone}%</span>
                        </Link>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </CollapsibleSection>

      {openDayKey ? (
        <DayAssignmentModal
          dateKey={openDayKey}
          projects={projects}
          supervisors={supervisors}
          employees={employees}
          existing={plannedByDay.get(openDayKey) ?? []}
          existingWorkers={workerAssignments.filter((a) => a.dateKey === openDayKey)}
          initialProjectId={openDayInitialProjectId ?? undefined}
          onClose={() => {
            setOpenDayKey(null);
            setOpenDayInitialProjectId(null);
          }}
          onCreated={(a) => {
            setDayAssignments((prev) => [...prev.filter((x) => x.id !== a.id), a]);
            // Assigning here also sets the project's supervisor server-side —
            // mirror that in the Gantt's inline dropdown right away.
            setSupervisorOverrides((o) => ({ ...o, [a.projectId]: a.supervisorUserId }));
          }}
          onDeleted={(id) => setDayAssignments((prev) => prev.filter((a) => a.id !== id))}
          onWorkerCreated={(a) => setWorkerAssignments((prev) => [...prev.filter((x) => x.id !== a.id), a])}
          onWorkerDeleted={(id) => setWorkerAssignments((prev) => prev.filter((a) => a.id !== id))}
        />
      ) : null}
    </div>
  );
}
