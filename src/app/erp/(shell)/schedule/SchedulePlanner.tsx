"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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
} from "@/lib/erp/schedule";
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
// filters, billing).
type CalendarSegmentGroup = "POST_CONSTRUCTION" | "CHANGE_ORDER" | "JANITORIAL_TURNOVER_REQUESTS" | "REAL_ESTATE" | "OTHER";

// Note: "Change order project" (amber, a Project whose segment is itself
// CHANGE_ORDER) is a different thing from the blue "Change order (CO)" items
// below, which are ProjectChangeOrder records attached to a parent project.
const CALENDAR_GROUP_LABEL: Record<CalendarSegmentGroup, string> = {
  POST_CONSTRUCTION: "Post-construction",
  CHANGE_ORDER: "Change order project",
  JANITORIAL_TURNOVER_REQUESTS: "Janitorial turnover requests",
  REAL_ESTATE: "Real estate",
  OTHER: "Other",
};

const CHANGE_ORDER_CHIP_CLASS = "bg-blue-100 text-blue-800 hover:bg-blue-200";
const CHANGE_ORDER_SWATCH_CLASS = "bg-blue-100";
const CHANGE_ORDER_LABEL = "Change order (CO)";

// Dashed border marks a chip as "planned" (a supervisor was assigned ahead
// of time via ProjectDayAssignment) as opposed to "confirmed" (an actual
// LaborEntry was logged for that project on that day).
const PLANNED_CHIP_EXTRA_CLASS = "border border-dashed border-gray-500";

// Muted, pastel-ish colors keyed by calendar group — used for the
// month-calendar chips, which need to read as a scannable legend rather than
// compete for attention the way the status-colored Gantt bars do.
const CALENDAR_GROUP_CHIP_CLASS: Record<CalendarSegmentGroup, string> = {
  POST_CONSTRUCTION: "bg-pink-200 text-pink-900 hover:bg-pink-300",
  CHANGE_ORDER: "bg-amber-200 text-amber-900 hover:bg-amber-300",
  JANITORIAL_TURNOVER_REQUESTS: "bg-green-200 text-green-900 hover:bg-green-300",
  REAL_ESTATE: "bg-purple-200 text-purple-900 hover:bg-purple-300",
  OTHER: "bg-slate-200 text-slate-800 hover:bg-slate-300",
};

const CALENDAR_GROUP_SWATCH_CLASS: Record<CalendarSegmentGroup, string> = {
  POST_CONSTRUCTION: "bg-pink-200",
  CHANGE_ORDER: "bg-amber-200",
  JANITORIAL_TURNOVER_REQUESTS: "bg-green-200",
  REAL_ESTATE: "bg-purple-200",
  OTHER: "bg-slate-200",
};

const SEGMENT_TO_CALENDAR_GROUP: Record<ProjectSegment, CalendarSegmentGroup> = {
  COMMERCIAL_PAINTING: "POST_CONSTRUCTION",
  COMMERCIAL_CLEANING: "POST_CONSTRUCTION",
  CHANGE_ORDER: "CHANGE_ORDER",
  JANITORIAL_TURNOVER_REQUESTS: "JANITORIAL_TURNOVER_REQUESTS",
  REAL_ESTATE: "REAL_ESTATE",
  OTHER: "OTHER",
};

function calendarSegmentGroup(segment: string): CalendarSegmentGroup {
  return SEGMENT_TO_CALENDAR_GROUP[normalizeProjectSegment(segment)];
}

function monthLabel(d: Date): string {
  return d.toLocaleString("en-US", { month: "long", year: "numeric" });
}

type Supervisor = { id: string; displayName: string };

export function SchedulePlanner({
  projects,
  supervisors,
  changeOrders,
  initialDayAssignments,
  canFilterBySupervisor,
}: {
  projects: ScheduleProject[];
  supervisors: Supervisor[];
  changeOrders: ScheduleChangeOrder[];
  initialDayAssignments: ScheduleDayAssignment[];
  canFilterBySupervisor: boolean;
}) {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [selectedSupervisorId, setSelectedSupervisorId] = useState("");

  // Planned (future) supervisor assignments — click a day to add one. Local
  // state so create/delete reflect immediately without a full page reload.
  const [dayAssignments, setDayAssignments] = useState(initialDayAssignments);
  const [openDayKey, setOpenDayKey] = useState<string | null>(null);
  const [deletingAssignmentId, setDeletingAssignmentId] = useState<string | null>(null);
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

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

  const windows = useMemo(() => projects.map((p) => ({ p, ...projectWindow(p) })), [projects]);

  const ganttRange = useMemo(() => {
    if (windows.length === 0) {
      const t = startOfDay(new Date());
      return { start: addDays(t, -7), end: addDays(t, 60) };
    }
    let min = windows[0]!.start;
    let max = windows[0]!.end;
    for (const w of windows) {
      if (w.start < min) min = w.start;
      if (w.end > max) max = w.end;
    }
    return { start: addDays(min, -7), end: addDays(max, 14) };
  }, [windows]);

  const totalDays = Math.max(
    1,
    Math.ceil((ganttRange.end.getTime() - ganttRange.start.getTime()) / (86400000)) + 1,
  );
  const timelineWidth = totalDays * PX_PER_DAY;

  const dayOffset = (d: Date) =>
    Math.floor((startOfDay(d).getTime() - ganttRange.start.getTime()) / 86400000);

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
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1));
  }
  function nextMonth() {
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1));
  }

  const sameMonth = (a: Date, b: Date) => a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  const todayKey = dayKey(new Date());

  const calendarNav = (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={prevMonth}
        className="rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
      >
        ← Prev
      </button>
      <span className="min-w-[140px] text-center text-sm font-semibold text-gray-800">{monthLabel(cursor)}</span>
      <button
        type="button"
        onClick={nextMonth}
        className="rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
      >
        Next →
      </button>
      {canFilterBySupervisor ? (
        <select
          value={selectedSupervisorId}
          onChange={(e) => setSelectedSupervisorId(e.target.value)}
          className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
        >
          <option value="">All supervisors</option>
          {supervisors.map((s) => (
            <option key={s.id} value={s.id}>
              {s.displayName}
            </option>
          ))}
        </select>
      ) : null}
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

                let dayProjects = projectsByDay.get(k) ?? [];
                let dayPlannedRaw = plannedByDay.get(k) ?? [];
                let dayChangeOrders = changeOrdersByDay.get(k) ?? [];

                if (selectedSupervisorId) {
                  dayProjects = dayProjects.filter(
                    (p) => projectSupervisorOnDay(p.id, k) === selectedSupervisorId,
                  );
                  dayPlannedRaw = dayPlannedRaw.filter((a) => a.supervisorUserId === selectedSupervisorId);
                  dayChangeOrders = dayChangeOrders.filter(
                    (co) => projectSupervisorOnDay(co.projectId, k) === selectedSupervisorId,
                  );
                }

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
                        {cell.getDate()}
                      </div>
                      {isFutureOrToday ? (
                        <button
                          type="button"
                          onClick={() => setOpenDayKey(k)}
                          title="Assign a supervisor to a project on this day"
                          className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-gray-300 text-base font-bold leading-none text-gray-400 hover:border-pink-400 hover:bg-pink-50 hover:text-pink-500"
                        >
                          +
                        </button>
                      ) : null}
                    </div>
                    <ul className="mt-1 space-y-1">
                      {visibleProjects.map((p) => (
                        <li key={`p-${p.id}`}>
                          <Link
                            href={`/erp/projects/${p.id}`}
                            title={`${p.jobTitle} — ${CALENDAR_GROUP_LABEL[calendarSegmentGroup(p.segment)]}`}
                            className={`flex items-center gap-1 truncate rounded px-1.5 py-0.5 text-[10px] font-medium shadow-sm transition-colors ${CALENDAR_GROUP_CHIP_CLASS[calendarSegmentGroup(p.segment)]}`}
                          >
                            <span className="truncate">{p.jobTitle}</span>
                          </Link>
                        </li>
                      ))}
                      {visiblePlanned.map(({ assignment, project }) => (
                        <li key={`plan-${assignment.id}`} className="relative">
                          <Link
                            href={`/erp/projects/${project.id}`}
                            title={`${project.jobTitle} — planned, not yet logged`}
                            className={`flex items-center gap-1 truncate rounded py-0.5 pl-1.5 pr-4 text-[10px] font-medium shadow-sm transition-colors ${CALENDAR_GROUP_CHIP_CLASS[calendarSegmentGroup(project.segment)]} ${PLANNED_CHIP_EXTRA_CLASS}`}
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
                            className="absolute right-0.5 top-1/2 -translate-y-1/2 px-0.5 text-[11px] font-bold leading-none opacity-60 hover:opacity-100 disabled:opacity-30"
                          >
                            ×
                          </button>
                        </li>
                      ))}
                      {visibleChangeOrders.map((co) => (
                        <li key={`co-${co.id}`}>
                          <Link
                            href={`/erp/projects/${co.projectId}/change-orders/${co.id}`}
                            title={`${co.title} — ${CHANGE_ORDER_LABEL}`}
                            className={`flex items-center gap-1 truncate rounded px-1.5 py-0.5 text-[10px] font-medium shadow-sm transition-colors ${CHANGE_ORDER_CHIP_CLASS}`}
                          >
                            <span className="truncate">{co.title}</span>
                          </Link>
                        </li>
                      ))}
                      {overflow > 0 ? (
                        <li className="px-1 text-[10px] font-medium text-gray-500">+{overflow} more</li>
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
          </div>
        ) : null}
      </CollapsibleSection>

      <CollapsibleSection title="Gantt" description="Bars use start / end dates; without an end date a 14-day window is assumed.">
        {windows.length === 0 ? (
          <p className="text-sm text-gray-500">No projects yet. Create one in Projects → New project.</p>
        ) : (
          <div className="flex max-h-[min(70vh,720px)] flex-col overflow-hidden rounded-lg border border-gray-200">
            <div className="flex min-h-0 flex-1 overflow-auto">
              <div className="sticky left-0 z-10 w-[220px] shrink-0 border-r border-gray-200 bg-white">
                <div className="flex h-14 items-center border-b border-gray-200 px-3 text-[10px] font-semibold uppercase text-gray-500">
                  Project
                </div>
                {windows.map(({ p }) => (
                  <div
                    key={p.id}
                    className="flex h-14 flex-col justify-center gap-0.5 border-b border-gray-100 px-3 text-xs text-gray-800"
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
              <div className="min-w-0 flex-1 overflow-x-auto">
                <div style={{ width: timelineWidth }} className="relative">
                  <div
                    className="flex h-14 items-end border-b border-gray-200 bg-white/80 text-[10px] text-gray-500"
                    style={{ width: timelineWidth }}
                  >
                    {Array.from({ length: totalDays }).map((_, i) => {
                      const d = addDays(ganttRange.start, i);
                      const show =
                        d.getDate() === 1 || i === 0 || d.getDay() === 0
                          ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
                          : "";
                      return (
                        <div
                          key={i}
                          style={{ width: PX_PER_DAY, minWidth: PX_PER_DAY }}
                          className={`shrink-0 border-l border-gray-100 ${d.getDay() === 0 ? "bg-gray-50" : ""}`}
                        >
                          {show ? <span className="pl-0.5">{show}</span> : null}
                        </div>
                      );
                    })}
                  </div>
                  {windows.map((w) => {
                    const startOff = Math.max(0, dayOffset(w.start));
                    const endOff = Math.min(totalDays - 1, dayOffset(w.end));
                    const left = startOff * PX_PER_DAY;
                    const width = Math.max(PX_PER_DAY * 2, (endOff - startOff + 1) * PX_PER_DAY);
                    return (
                      <div
                        key={w.p.id}
                        className="relative h-14 border-b border-gray-100"
                        style={{ width: timelineWidth }}
                      >
                        <Link
                          href={`/erp/projects/${w.p.id}`}
                          title={`${w.p.jobTitle} — ${w.p.percentDone}% done`}
                          className={`absolute top-3 flex h-8 items-center rounded px-2 text-[11px] font-medium text-white shadow ${statusBarClass(w.p.status)}`}
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
          existing={plannedByDay.get(openDayKey) ?? []}
          onClose={() => setOpenDayKey(null)}
          onCreated={(a) => {
            setDayAssignments((prev) => [...prev.filter((x) => x.id !== a.id), a]);
            // Assigning here also sets the project's supervisor server-side —
            // mirror that in the Gantt's inline dropdown right away.
            setSupervisorOverrides((o) => ({ ...o, [a.projectId]: a.supervisorUserId }));
          }}
          onDeleted={(id) => setDayAssignments((prev) => prev.filter((a) => a.id !== id))}
        />
      ) : null}
    </div>
  );
}
