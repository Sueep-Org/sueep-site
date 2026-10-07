"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { InfoTip, useConfirm, useToast } from "@/app/erp/components/ui";
import {
  addDays,
  dayKey,
  formatShortDate,
  matchesSearchQuery,
  projectWindow,
  startOfDay,
  type ScheduleDayAssignment,
  type ScheduleProject,
  type ScheduleWorkerAssignment,
} from "@/lib/erp/schedule";
import {
  GANTT_FLAG_LABELS,
  daysBetweenKeys,
  ganttFlags,
  ganttStage,
  isSeriousFlag,
  ganttSection,
  GANTT_SECTION_LABELS,
  GANTT_SECTION_ORDER,
  draggedSpan,
  rescheduleChange,
  type BarDragKind,
  type GanttFlag,
  type GanttSection,
  type GanttStage,
  changeOrderBounds,
  type CoSpan,
} from "@/lib/erp/ganttTimeline";
import { calendarSegmentGroup, type CalendarSegmentGroup } from "@/lib/erp/projectSegments";
import { todayEasternAsUtcMidnight } from "@/lib/erp/dates";
import {
  CREW_KIND_LABELS,
  bookedDaysInWindow,
  crewSegments,
  type CrewKind,
  type CrewPerson,
  type CrewSegment,
} from "@/lib/erp/crewTimeline";
import { NO_BUILDING_KEY, buildTurnoverHeat, heatLevel, type HeatRow, type HeatUnit } from "@/lib/erp/turnoverHeat";

type Person = { id: string; displayName: string };

type Zoom = "week" | "month" | "quarter";

const PX_PER_DAY: Record<Zoom, number> = { week: 32, month: 12, quarter: 4 };
// How far the arrow buttons move the timeline at each zoom.
const NAV_STEP_DAYS: Record<Zoom, number> = { week: 7, month: 28, quarter: 91 };
const ZOOM_LABELS: Record<Zoom, string> = { week: "Week", month: "Month", quarter: "Quarter" };
const ZOOM_STORAGE_KEY = "erp.schedule.ganttZoom";
const MODE_STORAGE_KEY = "erp.schedule.ganttMode";

type Mode = "project" | "crew" | "turnovers";

const MODE_LABELS: Record<Mode, string> = { project: "By project", crew: "By crew", turnovers: "Turnovers" };

// Crew blocks are colored by the job's type, same groups as the month
// calendar: post-construction pink (matching the project bars), turnovers
// green, anything else gray. Logged days solid, planned days outlined.
const CREW_LOGGED_CLASS: Record<CalendarSegmentGroup, string> = {
  POST_CONSTRUCTION: "bg-pink-500 text-white",
  JANITORIAL_TURNOVER_REQUESTS: "bg-emerald-500 text-white",
  REAL_ESTATE: "bg-sky-500 text-white",
  OTHER: "bg-gray-500 text-white",
};
const CREW_PLANNED_CLASS: Record<CalendarSegmentGroup, string> = {
  POST_CONSTRUCTION: "border border-dashed border-pink-400 bg-pink-50 text-pink-800",
  JANITORIAL_TURNOVER_REQUESTS: "border border-dashed border-emerald-400 bg-emerald-50 text-emerald-800",
  REAL_ESTATE: "border border-dashed border-sky-400 bg-sky-50 text-sky-800",
  OTHER: "border border-dashed border-gray-400 bg-gray-50 text-gray-700",
};
const CREW_KIND_ORDER: CrewKind[] = ["SUPERVISOR", "EMPLOYEE", "CONTRACTOR", "OTHER"];
const LANE_H = 22;
// How far ahead "booked" under each name looks.
const BOOKED_WINDOW_DAYS = 14;

function crewRowHeight(lanes: number): number {
  return Math.max(ROW_H, 8 + lanes * LANE_H + 4);
}

const STAGE_LABELS: Record<GanttStage, string> = { ACTIVE: "Active", UPCOMING: "Upcoming", ON_HOLD: "On hold" };

// Light track for the whole planned span, solid fill for the % done part.
const TRACK_CLASS: Record<GanttStage, string> = {
  ACTIVE: "bg-pink-100 ring-1 ring-inset ring-pink-200",
  UPCOMING: "border border-dashed border-pink-300 bg-white",
  ON_HOLD: "bg-gray-100 ring-1 ring-inset ring-gray-200",
};
const FILL_CLASS: Record<GanttStage, string> = {
  ACTIVE: "bg-pink-500",
  UPCOMING: "bg-pink-300",
  ON_HOLD: "bg-gray-400",
};
// Width of the faded tail on a bar whose end date is a guess.
const ESTIMATE_FADE_PX = 40;

const HEADER_H = 44;
const ROW_H = 44;
// By project rows are one line now, so they can be shorter.
const PROJECT_ROW_H = 36;
const BAR_H = 20;

function hasMissingDates(flags: GanttFlag[]): boolean {
  return flags.some((f) => !isSeriousFlag(f));
}

const SECTION_H = 30;

// Dot next to each section heading, matching its bars.
const SECTION_DOT_CLASS: Record<GanttSection, string> = {
  IN_PROGRESS: "bg-pink-500",
  ATTENTION: "bg-amber-500",
  UPCOMING: "border border-dashed border-pink-400 bg-white",
  ON_HOLD: "bg-gray-400",
};

function readStoredMode(): Mode {
  try {
    const v = window.localStorage.getItem(MODE_STORAGE_KEY);
    if (v === "crew" || v === "turnovers") return v;
  } catch {
    // Storage blocked, fall back to the default.
  }
  return "project";
}

function readStoredZoom(): Zoom {
  try {
    const v = window.localStorage.getItem(ZOOM_STORAGE_KEY);
    if (v === "week" || v === "month" || v === "quarter") return v;
  } catch {
    // Storage blocked (private window etc.), fall back to the default.
  }
  return "month";
}

type Row = {
  p: ScheduleProject;
  stage: GanttStage;
  flags: GanttFlag[];
  section: GanttSection;
  start: Date;
  end: Date;
  /** First and last change-order day, when the job has any. */
  co: CoSpan | null;
};

// Change-order part of a bar: same pink as the job, striped.
const CO_STRIPES = "repeating-linear-gradient(45deg, rgba(236,72,153,0.35) 0 3px, transparent 3px 6px)";

export function ProjectGantt({
  projects,
  dayAssignments,
  workerAssignments,
  supervisors,
  contractors,
  crew,
  canReschedule = false,
}: {
  projects: ScheduleProject[];
  dayAssignments: ScheduleDayAssignment[];
  workerAssignments: ScheduleWorkerAssignment[];
  supervisors: Person[];
  contractors: Person[];
  crew: CrewPerson[];
  /** Admin/PM: bars can be dragged to change start/end dates. */
  canReschedule?: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  // Eastern business day, not the viewer's own timezone, same as the calendar.
  const todayDate = useMemo(() => todayEasternAsUtcMidnight(), []);
  const todayKey = dayKey(todayDate);
  const [mode, setMode] = useState<Mode>("project");
  const isCrew = mode === "crew";
  const isHeat = mode === "turnovers";
  const isProject = mode === "project";
  const [zoom, setZoom] = useState<Zoom>("month");
  const [search, setSearch] = useState("");
  // On hold starts collapsed since it isn't being worked or planned right now.
  const [collapsed, setCollapsed] = useState<Set<GanttSection>>(() => new Set<GanttSection>(["ON_HOLD"]));
  const [missingOnly, setMissingOnly] = useState(false);

  const [crewSearch, setCrewSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<Set<CrewKind>>(() => new Set(CREW_KIND_ORDER));
  const [doubleBookedOnly, setDoubleBookedOnly] = useState(false);

  useEffect(() => {
    setZoom(readStoredZoom());
    setMode(readStoredMode());
  }, []);

  function changeMode(m: Mode) {
    setMode(m);
    try {
      window.localStorage.setItem(MODE_STORAGE_KEY, m);
    } catch {
      // Not persisted, still applies for this visit.
    }
  }

  function changeZoom(z: Zoom) {
    setZoom(z);
    try {
      window.localStorage.setItem(ZOOM_STORAGE_KEY, z);
    } catch {
      // Not persisted, still applies for this visit.
    }
  }

  const pxPerDay = PX_PER_DAY[zoom];

  // Post-construction jobs that are active, upcoming, or on hold. Janitorial
  // turnovers, real estate, and other segments have their own workflows
  // that don't fit a start-to-end bar.
  const rows = useMemo<Row[]>(
    () =>
      projects.flatMap((p) => {
        if (calendarSegmentGroup(p.segment) !== "POST_CONSTRUCTION") return [];
        const stage = ganttStage(p, todayKey);
        if (!stage) return [];
        // The job keeps going while its change orders do, so "late" is
        // measured from the last change-order day when that's later.
        const co = changeOrderBounds(p.changeOrderSpans);
        const flags = ganttFlags({ ...p, coEndKey: co?.endKey ?? null }, todayKey);
        const win = projectWindow(p);
        // An active job with no end date is still open, so its estimated bar
        // runs at least up to today instead of "ending" weeks ago.
        if (stage === "ACTIVE" && !p.projectEndDate && win.end < todayDate) win.end = todayDate;
        return [{ p, stage, flags, section: ganttSection(stage, flags), co, ...win }];
      }),
    [projects, todayKey, todayDate],
  );

  // Who covers each job: its supervisor if it has one, plus every
  // subcontractor planned on it, covering a day in place of a supervisor, or
  // confirmed on a logged day. Plenty of jobs run on a sub alone, so having
  // no supervisor is normal, not something to flag.
  const crewByProject = useMemo(() => {
    const supervisorName = new Map(supervisors.map((s) => [s.id, s.displayName]));
    const contractorName = new Map(contractors.map((c) => [c.id, c.displayName]));
    const subs = new Map<string, Set<string>>();
    const addSub = (projectId: string, name: string | undefined) => {
      if (!name) return;
      let set = subs.get(projectId);
      if (!set) subs.set(projectId, (set = new Set()));
      set.add(name);
    };
    for (const a of workerAssignments) if (a.contractorId) addSub(a.projectId, contractorName.get(a.contractorId));
    for (const a of dayAssignments) {
      if (a.supervisorContractorId) addSub(a.projectId, contractorName.get(a.supervisorContractorId));
    }
    for (const p of projects) {
      for (const entries of Object.values(p.laborEntriesByDay)) {
        for (const e of entries) if (e.contractorOnly) addSub(p.id, e.workerName);
      }
    }
    const out = new Map<string, { supervisor: string | null; subs: string[] }>();
    for (const r of rows) {
      out.set(r.p.id, {
        supervisor: (r.p.supervisorUserId && supervisorName.get(r.p.supervisorUserId)) || null,
        subs: Array.from(subs.get(r.p.id) ?? []).sort((a, b) => a.localeCompare(b)),
      });
    }
    return out;
  }, [rows, projects, dayAssignments, workerAssignments, supervisors, contractors]);

  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  // The next 14 days, for the booked/free strip under each crew name.
  const nextDays = useMemo(
    () =>
      Array.from({ length: BOOKED_WINDOW_DAYS }, (_, i) => {
        const d = addDays(todayDate, i);
        const wd = d.getUTCDay();
        return { key: dayKey(d), weekend: wd === 0 || wd === 6 };
      }),
    [todayDate],
  );

  // One row per worker, blocks per job, lanes for double-booked days.
  const crewRows = useMemo(
    () =>
      crew.map((person) => {
        const { segments, lanes, doubleBookedKeys } = crewSegments(person.days);
        return {
          person,
          segments,
          lanes,
          upcomingDoubleBooked: doubleBookedKeys.filter((k) => k >= todayKey),
          doubleBookedKeys,
          booked: bookedDaysInWindow(person.days, todayKey, BOOKED_WINDOW_DAYS),
          next: nextDays.map((d) => ({ ...d, booked: person.days.some((x) => x.dateKey === d.key) })),
        };
      }),
    [crew, todayKey, nextDays],
  );

  const crewCounts = useMemo(() => {
    const c: Record<CrewKind, number> = { SUPERVISOR: 0, EMPLOYEE: 0, CONTRACTOR: 0, OTHER: 0 };
    let doubleBooked = 0;
    for (const r of crewRows) {
      c[r.person.kind] += 1;
      if (r.upcomingDoubleBooked.length > 0) doubleBooked += 1;
    }
    return { ...c, doubleBooked };
  }, [crewRows]);

  const visibleCrewRows = useMemo(() => {
    const query = crewSearch.trim();
    return crewRows
      .filter((r) => kindFilter.has(r.person.kind))
      .filter((r) => !doubleBookedOnly || r.upcomingDoubleBooked.length > 0)
      .filter((r) => !query || matchesSearchQuery(r.person.name, query));
  }, [crewRows, kindFilter, doubleBookedOnly, crewSearch]);

  const [heatSearch, setHeatSearch] = useState("");

  const missingCount = useMemo(() => rows.filter((r) => hasMissingDates(r.flags)).length, [rows]);

  // Grouped into sections. In progress is ordered by end date (what wraps up
  // next first), everything else by start date.
  const sections = useMemo(() => {
    const query = search.trim();
    const matched = rows
      .filter((r) => !missingOnly || hasMissingDates(r.flags))
      .filter((r) => !query || matchesSearchQuery(r.p.jobTitle, query));
    return GANTT_SECTION_ORDER.map((key) => ({
      key,
      rows: matched
        .filter((r) => r.section === key)
        .sort((a, b) =>
          key === "IN_PROGRESS" ? a.end.getTime() - b.end.getTime() : a.start.getTime() - b.start.getTime(),
        ),
    })).filter((sec) => sec.rows.length > 0);
  }, [rows, missingOnly, search]);

  // Rows actually drawn (collapsed sections left out).
  const visibleRows = useMemo(
    () => sections.flatMap((sec) => (collapsed.has(sec.key) ? [] : sec.rows)),
    [sections, collapsed],
  );

  // Built from every row (not just the filtered ones) so the scale stays put
  // while filtering or searching, only the rows change. Always keeps a couple
  // of weeks back and two months ahead of today in view.
  const range = useMemo(() => {
    let min = addDays(todayDate, -14);
    let max = addDays(todayDate, 56);
    for (const r of rows) {
      if (r.start < min) min = r.start;
      if (r.end > max) max = r.end;
      if (r.co) {
        const cs = new Date(`${r.co.startKey}T00:00:00.000Z`);
        const ce = new Date(`${r.co.endKey}T00:00:00.000Z`);
        if (cs < min) min = cs;
        if (ce > max) max = ce;
      }
    }
    // Crew days too, so switching views keeps the same scale.
    for (const person of crew) {
      for (const d of [person.days[0], person.days[person.days.length - 1]]) {
        if (!d) continue;
        const t = new Date(`${d.dateKey}T00:00:00.000Z`);
        if (t < min) min = t;
        if (t > max) max = t;
      }
    }
    return { start: addDays(min, -7), end: addDays(max, 14) };
  }, [rows, crew, todayDate]);

  // Turnovers view: every turnover unit's scheduled days (logged, planned,
  // or just its start date when it has neither yet), grouped by property
  // and week across the same range as the other views.
  const heatRows = useMemo(() => {
    const plannedByProject = new Map<string, string[]>();
    for (const a of dayAssignments) {
      const list = plannedByProject.get(a.projectId) ?? [];
      list.push(a.dateKey);
      plannedByProject.set(a.projectId, list);
    }
    const units: HeatUnit[] = [];
    for (const p of projects) {
      if (calendarSegmentGroup(p.segment) !== "JANITORIAL_TURNOVER_REQUESTS" || p.status === "ARCHIVED") continue;
      const days = new Set([...p.workDayKeys, ...Object.keys(p.plannedWorkersByDay), ...(plannedByProject.get(p.id) ?? [])]);
      if (days.size === 0 && p.projectDate) days.add(p.projectDate.slice(0, 10));
      units.push({
        id: p.id,
        title: p.jobTitle,
        buildingKey: p.buildingId ?? NO_BUILDING_KEY,
        buildingName: p.buildingName ?? "No property linked",
        done: p.status === "COMPLETE",
        dayKeys: Array.from(days),
      });
    }
    return buildTurnoverHeat(units, dayKey(range.start), dayKey(range.end));
  }, [projects, dayAssignments, range]);

  const visibleHeatRows = useMemo(() => {
    const query = heatSearch.trim();
    return query ? heatRows.filter((r) => matchesSearchQuery(r.buildingName, query)) : heatRows;
  }, [heatRows, heatSearch]);

  const totalDays = Math.max(1, Math.round((range.end.getTime() - range.start.getTime()) / 86400000) + 1);
  const timelineWidth = totalDays * pxPerDay;
  const dayOffset = (d: Date) => Math.round((startOfDay(d).getTime() - range.start.getTime()) / 86400000);
  const todayOffsetPx = dayOffset(todayDate) * pxPerDay;
  const todayInRange = todayOffsetPx >= 0 && todayOffsetPx < timelineWidth;

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const leftColRef = useRef<HTMLDivElement | null>(null);

  // The slice of the timeline (in timeline px) currently on screen, past the
  // sticky project column. Drives the edge pills for bars scrolled out of view.
  const [view, setView] = useState({ left: 0, right: 0 });
  const viewFrame = useRef<number | null>(null);

  function measureView() {
    const el = scrollRef.current;
    if (!el) return;
    const leftCol = leftColRef.current?.offsetWidth ?? 0;
    setView({ left: el.scrollLeft, right: el.scrollLeft + el.clientWidth - leftCol });
  }

  function onTimelineScroll() {
    if (viewFrame.current != null) return;
    viewFrame.current = requestAnimationFrame(() => {
      viewFrame.current = null;
      measureView();
    });
  }

  useEffect(() => {
    window.addEventListener("resize", onTimelineScroll);
    return () => window.removeEventListener("resize", onTimelineScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Slides a bar into view, a little in from the left edge like today.
  function revealPx(px: number) {
    const el = scrollRef.current;
    if (!el) return;
    const leftCol = leftColRef.current?.offsetWidth ?? 0;
    el.scrollTo({ left: Math.max(0, px - (el.clientWidth - leftCol) * 0.15), behavior: "smooth" });
  }

  // Puts today a little in from the left edge of the visible timeline (past
  // the sticky project column), so the past week is still in view.
  function todayScrollLeft(el: HTMLDivElement): number {
    const leftCol = leftColRef.current?.offsetWidth ?? 0;
    return Math.max(0, todayOffsetPx - (el.clientWidth - leftCol) * 0.15);
  }

  function scrollToToday() {
    const el = scrollRef.current;
    if (el) el.scrollTo({ left: todayScrollLeft(el), behavior: "smooth" });
  }

  // Land on today whenever the timeline mounts (first load, reopening the
  // section, filters bringing rows back) or the zoom changes, rather than
  // wherever the earliest project happens to start. A callback ref, not an
  // effect, since the scroll container itself comes and goes.
  const attachScroll = useCallback(
    (el: HTMLDivElement | null) => {
      scrollRef.current = el;
      if (el) {
        el.scrollLeft = todayScrollLeft(el);
        measureView();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [todayOffsetPx],
  );

  // After a filter or search change, if none of the matching bars are on
  // screen (e.g. Needs attention is mostly jobs that ended months ago), slide
  // to the earliest one instead of leaving a page of empty rows.
  const filterKey = `${missingOnly}|${search.trim()}|${Array.from(collapsed).sort().join(",")}`;
  const lastFilterKey = useRef(filterKey);
  useEffect(() => {
    if (lastFilterKey.current === filterKey) return;
    lastFilterKey.current = filterKey;
    if (!isProject) return;
    const el = scrollRef.current;
    if (!el || visibleRows.length === 0) return;
    const leftCol = leftColRef.current?.offsetWidth ?? 0;
    const viewLeft = el.scrollLeft;
    const viewRight = viewLeft + el.clientWidth - leftCol;
    const spans = visibleRows.map((r) => {
      const endKey = r.co && r.co.endKey > dayKey(r.end) ? r.co.endKey : dayKey(r.end);
      const startKey = r.co && r.co.startKey < dayKey(r.start) ? r.co.startKey : dayKey(r.start);
      const late = r.flags.includes("PAST_END") ? daysBetweenKeys(endKey, todayKey) : 0;
      const off = (k: string) => dayOffset(new Date(`${k}T00:00:00.000Z`));
      return {
        left: Math.max(0, off(startKey)) * pxPerDay,
        right: (Math.min(totalDays - 1, off(endKey)) + 1 + late) * pxPerDay,
      };
    });
    if (spans.some((b) => b.right > viewLeft && b.left < viewRight)) return;
    revealPx(Math.min(...spans.map((b) => b.left)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, visibleRows]);

  // Month starts (labels + divider lines), plus day numbers and weekend
  // shading at Week zoom, and Monday numbers at Month zoom.
  const grid = useMemo(() => {
    const months: { left: number; label: string }[] = [];
    const days: { left: number; label: string; weekend: boolean }[] = [];
    for (let i = 0; i < totalDays; i++) {
      const d = addDays(range.start, i);
      // The first column gets a label only when there's room before the next
      // month's, so the two don't print on top of each other.
      if ((i === 0 && d.getUTCDate() <= 20) || d.getUTCDate() === 1) {
        months.push({
          left: i * pxPerDay,
          label: d.toLocaleDateString("en-US", {
            month: "short",
            year: d.getUTCMonth() === 0 || i === 0 ? "numeric" : undefined,
            timeZone: "UTC",
          }),
        });
      }
      const wd = d.getUTCDay();
      if (zoom === "week" || (zoom === "month" && wd === 1)) {
        days.push({ left: i * pxPerDay, label: String(d.getUTCDate()), weekend: wd === 0 || wd === 6 });
      }
    }
    return { months, days };
  }, [range.start, totalDays, pxPerDay, zoom]);

  function toggleSection(k: GanttSection) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  // Same save path as dragging a start/end chip on the Projects calendar
  // (PATCH /api/erp/projects/[id]), so the same follow-ups happen: a single
  // planned day moves with a new start date, and the supervisor and PM get
  // the reschedule email. Confirmed first since a drag is easy to do by
  // accident and the email can't be unsent.
  async function reschedule(p: ScheduleProject, change: { projectDate?: string; projectEndDate?: string }, label: string) {
    const plannedDays = dayAssignments.filter((a) => a.projectId === p.id).length;
    const notes: string[] = [];
    if (change.projectDate) {
      notes.push("Its supervisor and PM get a reschedule email.");
      if (plannedDays === 1) notes.push("Its planned day moves with it.");
      if (plannedDays > 1) notes.push(`Its ${plannedDays} planned days stay put, move those on the Projects calendar.`);
    }
    const ok = await confirm({
      title: "Change dates?",
      message: `${p.jobTitle}: ${label}. ${notes.join(" ")}`.trim(),
      confirmLabel: "Save dates",
      danger: false,
    });
    if (!ok) return false;
    try {
      const res = await fetch(`/api/erp/projects/${p.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(change),
      });
      if (!res.ok) throw new Error();
      router.refresh();
      return true;
    } catch {
      toast(`Couldn't change dates for ${p.jobTitle}, try again`, "error");
      return false;
    }
  }

  function toggleKind(k: CrewKind) {
    setKindFilter((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  const legend = isHeat ? (
    <div className="space-y-1">
      <p>One row per property, one cell per week (Monday to Sunday).</p>
      <p>The number is how many turnover units are on the schedule that week: logged, planned, or starting.</p>
      <p>Hover a cell to see which units. The top row adds up every property. The badge is units still open.</p>
    </div>
  ) : isCrew ? (
    <div className="space-y-1">
      <p>One row per person. Each block is a job they&apos;re on.</p>
      <p>Solid: work logged or sub confirmed. Dashed: planned only.</p>
      <p>Red mark on top: on two jobs that day.</p>
      <p>Under each name: the next 14 days, filled where they&apos;re booked, all green when free.</p>
    </div>
  ) : (
    <div className="space-y-1">
      <p>Fill and number: % done. Dashed: not started yet. Gray: on hold. Faded end: no end date yet.</p>
      <p>Striped: change-order work, so the bar keeps going through it.</p>
      <p>Red line and number: days past the end date (counting change orders).</p>
      <p>Amber check: done but not marked complete. Amber clock: start date passed.</p>
      <p>Circles: who covers the job (pink supervisor, blue sub). Hover anything for details.</p>
    </div>
  );

  // Short swatch key next to the filters; the i icon has the details.
  const swatches: { label: string; cls: string }[] = isHeat
    ? [
        { label: "1", cls: HEAT_CELL_CLASS[1] },
        { label: "2-3", cls: HEAT_CELL_CLASS[2] },
        { label: "4-6", cls: HEAT_CELL_CLASS[3] },
        { label: "7+", cls: HEAT_CELL_CLASS[4] },
      ]
    : isCrew
      ? [
          { label: "Logged", cls: "bg-pink-500" },
          { label: "Planned", cls: "border border-dashed border-pink-400 bg-pink-50" },
          { label: "Turnover", cls: "bg-emerald-500" },
          { label: "Double-booked", cls: "bg-red-500" },
        ]
      : [
          { label: "Done so far", cls: "bg-pink-500" },
          { label: "Planned", cls: "bg-pink-100 ring-1 ring-inset ring-pink-200" },
          { label: "Not started", cls: "border border-dashed border-pink-300 bg-white" },
          { label: "Change order", cls: "co-stripes border border-pink-300 bg-pink-50" },
          { label: "Late", cls: "h-0.5 bg-red-400" },
        ];

  const hasRows = isHeat ? visibleHeatRows.length > 0 : isCrew ? visibleCrewRows.length > 0 : sections.length > 0;
  const nothingAtAll = rows.length === 0 && crew.length === 0 && heatRows.length === 0;

  const keyOffset = (k: string) => dayOffset(new Date(`${k}T00:00:00.000Z`));
  const offsetKey = (off: number) => dayKey(addDays(range.start, off));

  // "All properties" row on top of the Turnovers view: every visible
  // property's units added up per week.
  const heatTotal = useMemo<HeatRow | null>(() => {
    if (visibleHeatRows.length < 2) return null;
    const weeks = new Map<string, { unitIds: string[]; doneCount: number }>();
    for (const r of visibleHeatRows) {
      for (const w of r.weeks) {
        const t = weeks.get(w.weekKey) ?? { unitIds: [], doneCount: 0 };
        t.unitIds.push(...w.unitIds);
        t.doneCount += w.doneCount;
        weeks.set(w.weekKey, t);
      }
    }
    return {
      buildingKey: "__all__",
      buildingName: "All properties",
      unitCount: visibleHeatRows.reduce((n, r) => n + r.unitCount, 0),
      openCount: visibleHeatRows.reduce((n, r) => n + r.openCount, 0),
      weeks: Array.from(weeks.entries())
        .sort(([x], [y]) => x.localeCompare(y))
        .map(([weekKey, t]) => ({ weekKey, ...t })),
    };
  }, [visibleHeatRows]);

  const chipClass = (on: boolean, tone: "pink" | "amber" = "pink") =>
    `inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-40 ${
      on
        ? tone === "amber"
          ? "border-amber-300 bg-amber-50 text-amber-800"
          : "border-pink-300 bg-pink-50 text-pink-700"
        : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
    }`;

  const iconBtn =
    "flex h-7 w-7 items-center justify-center rounded border border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-800";

  return (
    <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
      {/* View tabs on the left, date controls on the right */}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-gray-100 px-4 pt-3">
        <nav className="-mb-px flex gap-5" aria-label="Gantt views">
          {(["project", "crew", "turnovers"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => changeMode(m)}
              aria-current={mode === m ? "page" : undefined}
              className={`border-b-2 pb-2.5 text-sm font-medium transition-colors ${
                mode === m ? "border-pink-600 text-pink-600" : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-1.5 pb-2">
          <div className="flex overflow-hidden rounded border border-gray-200">
            {(["week", "month", "quarter"] as const).map((z) => (
              <button
                key={z}
                type="button"
                onClick={() => changeZoom(z)}
                className={`px-2.5 py-1 text-xs font-medium ${
                  zoom === z ? "bg-gray-800 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {ZOOM_LABELS[z]}
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-label="Scroll timeline earlier"
            className={iconBtn}
            onClick={() => scrollRef.current?.scrollBy({ left: -NAV_STEP_DAYS[zoom] * pxPerDay, behavior: "smooth" })}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={scrollToToday}
            className="h-7 rounded border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-600 hover:border-pink-300 hover:text-pink-600"
          >
            Today
          </button>
          <button
            type="button"
            aria-label="Scroll timeline later"
            className={iconBtn}
            onClick={() => scrollRef.current?.scrollBy({ left: NAV_STEP_DAYS[zoom] * pxPerDay, behavior: "smooth" })}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <InfoTip text={legend} align="right" />
        </div>
      </div>

      <div className="space-y-3 p-4">
        {nothingAtAll ? (
          <p className="text-sm text-gray-500">No active or upcoming projects. Create one in Projects → New project.</p>
        ) : (
          <>
            {/* Search and filters, with a small swatch key on the right */}
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={isHeat ? heatSearch : isCrew ? crewSearch : search}
                onChange={(e) => (isHeat ? setHeatSearch : isCrew ? setCrewSearch : setSearch)(e.target.value)}
                placeholder={isHeat ? "Search properties..." : isCrew ? "Search people..." : "Search projects..."}
                className="w-full rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-800 placeholder-gray-400 focus:border-pink-400 focus:outline-none sm:w-48"
              />
              {isProject ? (
                <button
                  type="button"
                  onClick={() => setMissingOnly((v) => !v)}
                  className={chipClass(missingOnly, "amber")}
                  disabled={missingCount === 0}
                >
                  Missing dates {missingCount}
                </button>
              ) : null}
              {isCrew ? (
                <>
                  {CREW_KIND_ORDER.filter((k) => crewCounts[k] > 0).map((k) => (
                    <button key={k} type="button" onClick={() => toggleKind(k)} className={chipClass(kindFilter.has(k))}>
                      {CREW_KIND_LABELS[k]}s {crewCounts[k]}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setDoubleBookedOnly((v) => !v)}
                    className={chipClass(doubleBookedOnly, "amber")}
                    disabled={crewCounts.doubleBooked === 0}
                  >
                    Double-booked {crewCounts.doubleBooked}
                  </button>
                </>
              ) : null}
              <div className="ml-auto hidden flex-wrap items-center gap-3 text-[11px] text-gray-500 md:flex">
                {swatches.map((sw) => (
                  <span key={sw.label} className="inline-flex items-center gap-1.5">
                    <span
                      className={`inline-block w-4 rounded-sm ${sw.cls.includes("h-0.5") ? "" : "h-2.5"} ${sw.cls}`}
                      style={sw.cls.includes("co-stripes") ? { backgroundImage: CO_STRIPES } : undefined}
                    />
                    {sw.label}
                  </span>
                ))}
              </div>
            </div>

            {!hasRows ? (
              <p className="py-6 text-center text-sm text-gray-500">
                {isHeat
                  ? "No turnover units on the schedule in this range."
                  : isCrew
                    ? "Nobody matches these filters."
                    : "No projects match these filters."}
              </p>
            ) : (
              // One scroll area for both directions, so trackpad, mouse wheel,
              // and touch all scroll it naturally. The name column and the
              // date header stick in place inside it. Overscroll is contained
              // sideways only, so a sideways swipe doesn't trigger browser back
              // while up/down scrolling still carries on to the page.
              <div
                ref={attachScroll}
                onScroll={onTimelineScroll}
                className="max-h-[min(70vh,720px)] overflow-auto overscroll-x-contain rounded-lg border border-gray-200"
              >
                <div className="relative flex w-max">
                  {/* Name column */}
                  <div ref={leftColRef} className="sticky left-0 z-30 w-36 shrink-0 border-r border-gray-200 bg-white sm:w-64">
                    <div
                      className="sticky top-0 z-10 flex items-end border-b border-gray-200 bg-white px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400"
                      style={{ height: HEADER_H }}
                    >
                      {isHeat ? "Property" : isCrew ? "Crew" : "Project"}
                    </div>
                    {isHeat ? (
                      <>
                        {heatTotal ? <HeatCell row={heatTotal} emphasis /> : null}
                        {visibleHeatRows.map((r) => (
                          <HeatCell key={r.buildingKey} row={r} />
                        ))}
                      </>
                    ) : isCrew ? (
                      visibleCrewRows.map((r) => (
                        <CrewCell key={r.person.key} person={r.person} booked={r.booked} next={r.next} lanes={r.lanes} />
                      ))
                    ) : (
                      sections.map((sec) => (
                        <Fragment key={sec.key}>
                          <button
                            type="button"
                            onClick={() => toggleSection(sec.key)}
                            aria-expanded={!collapsed.has(sec.key)}
                            className="flex w-full items-center gap-2 border-b border-gray-200 bg-gray-50 px-3 text-left text-xs font-semibold text-gray-700 hover:bg-gray-100"
                            style={{ height: SECTION_H }}
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className={`h-3 w-3 shrink-0 text-gray-400 transition-transform ${collapsed.has(sec.key) ? "-rotate-90" : ""}`}
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={3}
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                            </svg>
                            <span className={`h-2 w-2 shrink-0 rounded-full ${SECTION_DOT_CLASS[sec.key]}`} />
                            <span className="truncate">{GANTT_SECTION_LABELS[sec.key]}</span>
                            <span className="font-normal text-gray-400">{sec.rows.length}</span>
                          </button>
                          {collapsed.has(sec.key)
                            ? null
                            : sec.rows.map((r) => <ProjectCell key={r.p.id} row={r} crew={crewByProject.get(r.p.id)} />)}
                        </Fragment>
                      ))
                    )}
                  </div>

                  {/* Timeline */}
                  <div className="relative" style={{ width: timelineWidth }}>
                    {/* Grid behind the bars */}
                    <div className="pointer-events-none absolute inset-0">
                      {zoom === "week"
                        ? grid.days.map((d) =>
                            d.weekend ? (
                              <div key={d.left} className="absolute inset-y-0 bg-gray-50" style={{ left: d.left, width: pxPerDay }} />
                            ) : null,
                          )
                        : null}
                      {zoom === "month"
                        ? grid.days.map((d) => (
                            <div key={d.left} className="absolute inset-y-0 border-l border-gray-100" style={{ left: d.left }} />
                          ))
                        : null}
                      {grid.months.map((m) => (
                        <div key={m.left} className="absolute inset-y-0 border-l border-gray-200" style={{ left: m.left }} />
                      ))}
                      {todayInRange && zoom !== "quarter" ? (
                        <div className="absolute inset-y-0 bg-pink-50/70" style={{ left: todayOffsetPx, width: pxPerDay }} />
                      ) : null}
                      {todayInRange ? (
                        <div className="absolute inset-y-0 w-px bg-pink-500" style={{ left: todayOffsetPx + pxPerDay / 2 }} />
                      ) : null}
                    </div>

                    {/* Date header */}
                    <div
                      className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 text-[11px] text-gray-500"
                      style={{ height: HEADER_H }}
                    >
                      {grid.months.map((m) => (
                        <span key={m.left} className="absolute top-1.5 whitespace-nowrap pl-1.5 font-semibold text-gray-700" style={{ left: m.left }}>
                          {m.label}
                        </span>
                      ))}
                      {grid.days.map((d) => (
                        <span
                          key={d.left}
                          className={`absolute bottom-1.5 text-center text-[10px] ${d.weekend ? "text-gray-300" : "text-gray-400"}`}
                          style={{ left: d.left, width: zoom === "week" ? pxPerDay : undefined, paddingLeft: zoom === "week" ? 0 : 3 }}
                        >
                          {d.label}
                        </span>
                      ))}
                      {todayInRange ? (
                        <span
                          className="absolute bottom-0 -translate-x-1/2 translate-y-1/2 rounded-full bg-pink-500 px-1.5 text-[9px] font-semibold leading-4 text-white"
                          style={{ left: todayOffsetPx + pxPerDay / 2 }}
                        >
                          Today
                        </span>
                      ) : null}
                    </div>

                    {isHeat ? (
                      <>
                        {heatTotal ? (
                          <HeatTimelineRow
                            row={heatTotal}
                            emphasis
                            projectById={projectById}
                            pxPerDay={pxPerDay}
                            keyOffset={keyOffset}
                            totalDays={totalDays}
                          />
                        ) : null}
                        {visibleHeatRows.map((r) => (
                          <HeatTimelineRow
                            key={r.buildingKey}
                            row={r}
                            projectById={projectById}
                            pxPerDay={pxPerDay}
                            keyOffset={keyOffset}
                            totalDays={totalDays}
                          />
                        ))}
                      </>
                    ) : isCrew ? (
                      visibleCrewRows.map((r) => (
                        <CrewTimelineRow
                          key={r.person.key}
                          segments={r.segments}
                          lanes={r.lanes}
                          doubleBookedKeys={r.doubleBookedKeys}
                          projectById={projectById}
                          pxPerDay={pxPerDay}
                          keyOffset={keyOffset}
                          totalDays={totalDays}
                        />
                      ))
                    ) : (
                      sections.map((sec) => (
                        <Fragment key={sec.key}>
                          <div className="relative z-[1] border-b border-gray-200 bg-gray-50/90" style={{ height: SECTION_H }} />
                          {collapsed.has(sec.key)
                            ? null
                            : sec.rows.map((r) => (
                                <GanttBar
                                  key={r.p.id}
                                  row={r}
                                  pxPerDay={pxPerDay}
                                  totalDays={totalDays}
                                  todayKey={todayKey}
                                  dayOffset={dayOffset}
                                  offsetKey={offsetKey}
                                  view={view}
                                  onReveal={revealPx}
                                  onReschedule={canReschedule ? reschedule : undefined}
                                />
                              ))}
                        </Fragment>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function ProjectCell({ row, crew }: { row: Row; crew: { supervisor: string | null; subs: string[] } | undefined }) {
  const { p, flags } = row;
  // Everything that used to be written under the name lives in the hover
  // text now: the problem (if any) and who covers the job.
  const hover = [
    p.jobTitle,
    ...flags.map((f) => GANTT_FLAG_LABELS[f]),
    crew?.supervisor ? `Supervisor: ${crew.supervisor}` : null,
    crew?.subs.length ? `Subs: ${crew.subs.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  return (
    <div className="flex items-center gap-2 border-b border-gray-100 px-3" style={{ height: PROJECT_ROW_H }}>
      <Link
        href={`/erp/projects/${p.id}`}
        className="min-w-0 flex-1 truncate text-[13px] font-medium text-gray-900 hover:text-pink-600 hover:underline"
        title={hover}
      >
        {p.jobTitle}
      </Link>
      <CrewAvatars supervisor={crew?.supervisor ?? null} subs={crew?.subs ?? []} />
    </div>
  );
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0]![0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1]![0] ?? "") : "";
  return (first + last).toUpperCase();
}

/** Small initials circles for who covers a job: pink = supervisor, blue =
 * sub. Up to three, then "+N". Full names on hover. */
function CrewAvatars({ supervisor, subs }: { supervisor: string | null; subs: string[] }) {
  const people = [...(supervisor ? [{ name: supervisor, sup: true }] : []), ...subs.map((name) => ({ name, sup: false }))];
  if (people.length === 0) return null;
  const shown = people.slice(0, 3);
  const extra = people.length - shown.length;
  const circle = "inline-flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold ring-2 ring-white";
  return (
    <span
      className="flex shrink-0 -space-x-1"
      title={people.map((x) => (x.sup ? `${x.name} (supervisor)` : x.name)).join("\n")}
    >
      {shown.map((x) => (
        <span key={`${x.sup ? "s" : "c"}${x.name}`} className={`${circle} ${x.sup ? "bg-pink-100 text-pink-700" : "bg-sky-100 text-sky-700"}`}>
          {initials(x.name)}
        </span>
      ))}
      {extra > 0 ? <span className={`${circle} bg-gray-100 text-gray-600`}>+{extra}</span> : null}
    </span>
  );
}

type Reschedule = (
  p: ScheduleProject,
  change: { projectDate?: string; projectEndDate?: string },
  label: string,
) => Promise<boolean>;

function GanttBar({
  row,
  pxPerDay,
  totalDays,
  todayKey,
  dayOffset,
  offsetKey,
  view,
  onReveal,
  onReschedule,
}: {
  row: Row;
  pxPerDay: number;
  totalDays: number;
  todayKey: string;
  dayOffset: (d: Date) => number;
  offsetKey: (off: number) => string;
  view: { left: number; right: number };
  onReveal: (px: number) => void;
  /** Set only for roles allowed to change dates by dragging. */
  onReschedule?: Reschedule;
}) {
  const { p, stage, flags, start, end } = row;
  const estimatedEnd = flags.includes("NO_END_DATE");

  // Drag state: which part is held, where the pointer started, and how many
  // whole days it's moved. `pending` keeps the bar at its dropped position
  // while the save and refresh are in flight, so it doesn't jump back.
  const [drag, setDrag] = useState<{ kind: BarDragKind; x0: number; days: number } | null>(null);
  const [pending, setPending] = useState<{ startOff: number; endOff: number } | null>(null);
  const dragged = useRef(false);

  useEffect(() => {
    setPending(null);
  }, [p.projectDate, p.projectEndDate]);

  const rawStart = dayOffset(start);
  const rawEnd = dayOffset(end);
  const span = drag
    ? draggedSpan(drag.kind, rawStart, rawEnd, drag.days)
    : (pending ?? { startOff: rawStart, endOff: rawEnd });
  const moving = drag != null || pending != null;

  const startOff = Math.max(0, span.startOff);
  const endOff = Math.min(totalDays - 1, span.endOff);
  const left = startOff * pxPerDay;
  const width = Math.max(pxPerDay * 2, (endOff - startOff + 1) * pxPerDay);
  const pct = Math.max(0, Math.min(100, Math.round(p.percentDone)));
  const startKey = moving ? offsetKey(span.startOff) : dayKey(start);
  const endKey = moving ? offsetKey(span.endOff) : dayKey(end);

  // Change-order work, drawn as a striped continuation behind the job's own
  // bar (not draggable, it follows the change orders' own dates).
  const coStartOff = row.co ? Math.max(0, dayOffset(new Date(`${row.co.startKey}T00:00:00.000Z`))) : null;
  const coEndOff = row.co ? Math.min(totalDays - 1, dayOffset(new Date(`${row.co.endKey}T00:00:00.000Z`))) : null;
  const coLeft = coStartOff != null ? coStartOff * pxPerDay : null;
  const coWidth = coStartOff != null && coEndOff != null ? (coEndOff - coStartOff + 1) * pxPerDay : 0;
  const barRight = Math.max(left + width, coLeft != null ? coLeft + coWidth : 0);
  const effectiveEndKey = row.co && row.co.endKey > endKey ? row.co.endKey : endKey;

  // Days past the (job or change-order) end date, drawn as a thin red line
  // from the bar to today.
  const daysLate = !moving && flags.includes("PAST_END") ? daysBetweenKeys(effectiveEndKey, todayKey) : 0;
  const lateWidth = daysLate * pxPerDay;
  const labelLeft = barRight + lateWidth + 6;

  // Whole bar (plus its late line and % label) scrolled out of view: a pill
  // at that edge of the row says where it is and slides it into view.
  const LABEL_ROOM = 110;
  const barLeft = Math.min(left, coLeft ?? left);
  const offLeft = !moving && view.right > 0 && labelLeft + LABEL_ROOM < view.left + 4;
  const offRight = !moving && view.right > 0 && barLeft > view.right - 4;

  const coTooltip = row.co
    ? [
        `Change orders ${formatShortDate(row.co.startKey)} - ${formatShortDate(row.co.endKey)}`,
        ...p.changeOrderSpans.map(
          (c) =>
            `${c.complete ? "Done: " : ""}${c.title} (${formatShortDate(c.startKey)}${c.endKey !== c.startKey ? ` - ${formatShortDate(c.endKey)}` : ""})`,
        ),
      ].join("\n")
    : null;

  const tooltip = [
    p.jobTitle,
    `${STAGE_LABELS[stage]}, ${pct}% done`,
    `${formatShortDate(startKey)} - ${formatShortDate(endKey)}${estimatedEnd ? " (estimated end)" : ""}`,
    row.co && row.co.endKey > endKey ? `Change orders run through ${formatShortDate(row.co.endKey)}` : null,
    daysLate > 0 ? `${daysLate} day${daysLate === 1 ? "" : "s"} past end date` : null,
    ...flags.filter((f) => f !== "PAST_END").map((f) => GANTT_FLAG_LABELS[f]),
    onReschedule ? "Drag to move, drag an edge to change a date" : null,
  ]
    .filter(Boolean)
    .join("\n");

  const fade = estimatedEnd && !(drag?.kind === "end")
    ? `linear-gradient(to right, #000 calc(100% - ${ESTIMATE_FADE_PX}px), transparent)`
    : undefined;
  const barTop = (PROJECT_ROW_H - BAR_H) / 2;

  // Mouse and pen only: on touch screens a swipe over a bar should still
  // scroll the chart, and a tap still opens the project.
  function startDrag(kind: BarDragKind) {
    return (e: React.PointerEvent<HTMLElement>) => {
      if (!onReschedule || pending || e.pointerType === "touch" || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragged.current = false;
      setDrag({ kind, x0: e.clientX, days: 0 });
    };
  }

  function onPointerMove(e: React.PointerEvent<HTMLElement>) {
    if (!drag) return;
    const days = Math.round((e.clientX - drag.x0) / pxPerDay);
    if (days !== drag.days) {
      if (days !== 0) dragged.current = true;
      setDrag({ ...drag, days });
    }
  }

  function onPointerUp() {
    if (!drag || !onReschedule) return;
    const done = drag;
    setDrag(null);
    if (done.days === 0) return;
    const next = draggedSpan(done.kind, rawStart, rawEnd, done.days);
    const newStart = offsetKey(next.startOff);
    const newEnd = offsetKey(next.endOff);
    const change = rescheduleChange(done.kind, newStart, newEnd, !estimatedEnd);
    const label =
      done.kind === "start"
        ? `start ${formatShortDate(newStart)}`
        : done.kind === "end"
          ? `end ${formatShortDate(newEnd)}`
          : estimatedEnd
            ? `start ${formatShortDate(newStart)}`
            : `${formatShortDate(newStart)} - ${formatShortDate(newEnd)}`;
    setPending(next);
    // On success the bar stays put until the refreshed dates arrive (effect
    // below); cancelled or failed, it goes straight back.
    // Falls back after a few seconds in case the refresh never lands, so the
    // bar can't stay locked.
    void onReschedule(p, change, label).then((saved) => {
      if (!saved) setPending(null);
      else window.setTimeout(() => setPending(null), 5000);
    });
  }

  const dragHandlers = onReschedule
    ? { onPointerMove, onPointerUp, onPointerCancel: () => setDrag(null) }
    : {};
  const handleClass = "absolute inset-y-0 z-10 w-2 cursor-ew-resize hover:bg-black/10";

  // No start date means no real dates at all (the window falls back to the
  // day the record was created), so a bar would be made up. Say so instead,
  // pinned to the visible left edge so it's always readable.
  if (flags.includes("NO_START_DATE")) {
    return (
      <div className="relative border-b border-gray-100" style={{ height: PROJECT_ROW_H }}>
        <Link
          href={`/erp/projects/${p.id}`}
          title="No start or end date yet. Open the project to set them."
          className="absolute whitespace-nowrap rounded-md border border-dashed border-gray-300 bg-white px-2 py-0.5 text-[11px] text-gray-500 hover:border-pink-300 hover:text-pink-700"
          style={{ top: PROJECT_ROW_H / 2 - 10, left: view.left + 6 }}
        >
          No dates
        </Link>
      </div>
    );
  }

  return (
    <div className="relative border-b border-gray-100" style={{ height: PROJECT_ROW_H }}>
      {coLeft != null && coWidth > 0 && !moving ? (
        <Link
          href={`/erp/projects/${p.id}`}
          title={coTooltip ?? undefined}
          className="absolute rounded border border-pink-300 bg-pink-50 hover:border-pink-400"
          style={{ top: barTop + 3, height: BAR_H - 6, left: coLeft, width: coWidth, backgroundImage: CO_STRIPES }}
        />
      ) : null}
      {lateWidth > 0 ? (
        <div className="absolute h-0.5 bg-red-400" style={{ top: PROJECT_ROW_H / 2 - 1, left: barRight, width: lateWidth }} />
      ) : null}
      <Link
        href={`/erp/projects/${p.id}`}
        title={drag ? undefined : tooltip}
        draggable={false}
        onClick={(e) => {
          // A drag that ends on the bar shouldn't also open the project.
          if (dragged.current) {
            e.preventDefault();
            dragged.current = false;
          }
        }}
        onPointerDown={startDrag("move")}
        {...dragHandlers}
        className={`absolute select-none overflow-hidden rounded ${TRACK_CLASS[stage]} ${
          onReschedule ? (drag ? "cursor-grabbing shadow-md ring-2 ring-pink-300" : "cursor-grab hover:opacity-80") : "transition-opacity hover:opacity-80"
        } ${pending ? "opacity-60" : ""}`}
        style={{ top: barTop, height: BAR_H, left, width, maskImage: fade, WebkitMaskImage: fade }}
      >
        <span className={`block h-full ${FILL_CLASS[stage]}`} style={{ width: `${pct}%` }} />
        {onReschedule ? (
          <>
            <span aria-hidden className={`${handleClass} left-0`} onPointerDown={startDrag("start")} {...dragHandlers} />
            <span aria-hidden className={`${handleClass} right-0`} onPointerDown={startDrag("end")} {...dragHandlers} />
          </>
        ) : null}
      </Link>
      <span
        className="pointer-events-none absolute whitespace-nowrap text-[11px] leading-none text-gray-500"
        style={{ top: PROJECT_ROW_H / 2 - 5, left: labelLeft }}
      >
        {drag && drag.days !== 0 ? (
          <span className="font-semibold text-pink-600">
            {formatShortDate(startKey)} - {formatShortDate(endKey)}
          </span>
        ) : daysLate > 0 ? (
          <span className="font-semibold text-red-600">{daysLate}d</span>
        ) : flags.includes("DONE_NOT_CLOSED") ? (
          <StatusIcon kind="done" title="100% done, not marked complete" />
        ) : flags.includes("START_PASSED") ? (
          <StatusIcon kind="late-start" title={`Was due to start ${formatShortDate(startKey)}`} />
        ) : stage === "ACTIVE" ? (
          <span className="font-medium text-gray-500">{pct}%</span>
        ) : null}
      </span>
      {offLeft || offRight ? (
        <button
          type="button"
          onClick={() => onReveal(left)}
          title={`${tooltip}\nClick to show the bar`}
          className="absolute z-10 whitespace-nowrap rounded-md bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600 hover:bg-pink-50 hover:text-pink-700"
          style={{
            top: PROJECT_ROW_H / 2 - 10,
            left: offLeft ? view.left + 6 : view.right - 6,
            transform: offRight ? "translateX(-100%)" : undefined,
          }}
        >
          <span className="inline-flex items-center gap-1">
            {offLeft
              ? `‹ ${formatShortDate(estimatedEnd && !row.co ? startKey : effectiveEndKey)}`
              : `${formatShortDate(row.co && row.co.startKey < startKey ? row.co.startKey : startKey)} ›`}
            {flags.includes("DONE_NOT_CLOSED") ? <StatusIcon kind="done" title="100% done, not marked complete" /> : null}
            {flags.includes("START_PASSED") ? <StatusIcon kind="late-start" title="Start date passed" /> : null}
          </span>
        </button>
      ) : null}
    </div>
  );
}

/** Small icon at the end of a bar standing in for a status sentence. */
function StatusIcon({ kind, title }: { kind: "done" | "late-start"; title: string }) {
  return (
    <span title={title} aria-label={title} className="pointer-events-auto inline-flex cursor-help text-amber-500">
      {kind === "done" ? (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.7-9.3a1 1 0 00-1.4-1.4L9 10.6 7.7 9.3a1 1 0 00-1.4 1.4l2 2a1 1 0 001.4 0l4-4z" clipRule="evenodd" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.3.7l2.8 2.8a1 1 0 001.4-1.4L11 9.6V6z" clipRule="evenodd" />
        </svg>
      )}
    </span>
  );
}

function CrewCell({
  person,
  booked,
  next,
  lanes,
}: {
  person: CrewPerson;
  booked: number;
  next: { key: string; weekend: boolean; booked: boolean }[];
  lanes: number;
}) {
  return (
    <div className="flex flex-col justify-center gap-1 border-b border-gray-100 px-3" style={{ height: crewRowHeight(lanes) }}>
      <div className="flex min-w-0 items-baseline gap-1.5">
        <span className="truncate text-[13px] font-medium text-gray-900" title={person.name}>
          {person.name}
        </span>
        <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-gray-400">{CREW_KIND_LABELS[person.kind]}</span>
      </div>
      <div
        className="flex gap-px"
        title={booked === 0 ? "Free the next 2 weeks" : `${booked} of the next 14 days booked`}
      >
        {next.map((d) => (
          <span
            key={d.key}
            className={`h-2 w-2 rounded-[1px] ${
              booked === 0 ? "bg-emerald-200" : d.booked ? "bg-pink-500" : d.weekend ? "bg-gray-100" : "bg-gray-200"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function CrewTimelineRow({
  segments,
  lanes,
  doubleBookedKeys,
  projectById,
  pxPerDay,
  keyOffset,
  totalDays,
}: {
  segments: CrewSegment[];
  lanes: number;
  doubleBookedKeys: string[];
  projectById: Map<string, ScheduleProject>;
  pxPerDay: number;
  keyOffset: (k: string) => number;
  totalDays: number;
}) {
  return (
    <div className="relative border-b border-gray-100" style={{ height: crewRowHeight(lanes) }}>
      {doubleBookedKeys.map((k) => {
        const off = keyOffset(k);
        if (off < 0 || off >= totalDays) return null;
        return (
          <span
            key={k}
            title="Double-booked this day"
            className="absolute top-0.5 h-1 rounded-sm bg-red-500"
            style={{ left: off * pxPerDay, width: Math.max(3, pxPerDay) }}
          />
        );
      })}
      {segments.map((seg) => {
        const startOff = Math.max(0, keyOffset(seg.startKey));
        const endOff = Math.min(totalDays - 1, keyOffset(seg.endKey));
        if (endOff < 0 || startOff >= totalDays) return null;
        const left = startOff * pxPerDay;
        const width = Math.max(pxPerDay, (endOff - startOff + 1) * pxPerDay);
        const project = projectById.get(seg.projectId);
        const group = project ? calendarSegmentGroup(project.segment) : "OTHER";
        const title = project?.jobTitle ?? "Project";
        const range =
          seg.startKey === seg.endKey
            ? formatShortDate(seg.startKey)
            : `${formatShortDate(seg.startKey)} - ${formatShortDate(seg.endKey)}`;
        return (
          <Link
            key={`${seg.projectId}|${seg.startKey}|${seg.logged ? 1 : 0}`}
            href={`/erp/projects/${seg.projectId}`}
            title={`${title}\n${range}, ${seg.dayCount} day${seg.dayCount === 1 ? "" : "s"}\n${seg.logged ? "Logged" : "Planned"}`}
            className={`absolute flex items-center overflow-hidden rounded px-1.5 text-[10px] font-medium leading-none transition-opacity hover:opacity-80 ${
              seg.logged ? CREW_LOGGED_CLASS[group] : CREW_PLANNED_CLASS[group]
            }`}
            style={{ top: 8 + seg.lane * LANE_H, height: LANE_H - 4, left, width }}
          >
            {width >= 90 ? <span className="truncate">{title}</span> : null}
          </Link>
        );
      })}
    </div>
  );
}

const HEAT_CELL_CLASS = ["", "bg-emerald-100 text-emerald-900", "bg-emerald-300 text-emerald-950", "bg-emerald-500 text-white", "bg-emerald-700 text-white"];

function HeatCell({ row, emphasis = false }: { row: HeatRow; emphasis?: boolean }) {
  return (
    <div
      className={`flex flex-col justify-center px-3 ${emphasis ? "border-b-2 border-gray-200 bg-gray-50" : "border-b border-gray-100"}`}
      style={{ height: ROW_H }}
    >
      <div className="flex min-w-0 items-center gap-2" title={`${row.buildingName}\n${row.unitCount} unit${row.unitCount === 1 ? "" : "s"} in view, ${row.openCount} open`}>
        <span className={`min-w-0 flex-1 truncate text-[13px] text-gray-900 ${emphasis ? "font-semibold" : "font-medium"}`}>
          {row.buildingName}
        </span>
        {row.openCount > 0 ? (
          <span className="shrink-0 rounded-full bg-emerald-50 px-1.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
            {row.openCount} open
          </span>
        ) : null}
      </div>
    </div>
  );
}

function HeatTimelineRow({
  row,
  emphasis = false,
  projectById,
  pxPerDay,
  keyOffset,
  totalDays,
}: {
  row: HeatRow;
  emphasis?: boolean;
  projectById: Map<string, ScheduleProject>;
  pxPerDay: number;
  keyOffset: (k: string) => number;
  totalDays: number;
}) {
  return (
    <div
      className={`relative ${emphasis ? "border-b-2 border-gray-200 bg-gray-50/70" : "border-b border-gray-100"}`}
      style={{ height: ROW_H }}
    >
      {row.weeks.map((w) => {
        const startOff = Math.max(0, keyOffset(w.weekKey));
        const endOff = Math.min(totalDays - 1, keyOffset(w.weekKey) + 6);
        if (endOff < startOff) return null;
        const left = startOff * pxPerDay;
        const width = (endOff - startOff + 1) * pxPerDay;
        const n = w.unitIds.length;
        const names = w.unitIds.map((id) => projectById.get(id)?.jobTitle ?? "Unit");
        const shown = names.slice(0, 8);
        const title = [
          `Week of ${formatShortDate(w.weekKey)}: ${n} unit${n === 1 ? "" : "s"}${w.doneCount ? `, ${w.doneCount} done` : ""}`,
          ...shown,
          names.length > shown.length ? `and ${names.length - shown.length} more` : null,
        ]
          .filter(Boolean)
          .join("\n");
        return (
          <div
            key={w.weekKey}
            title={title}
            className={`absolute flex items-center justify-center rounded-sm text-[11px] font-semibold ${HEAT_CELL_CLASS[heatLevel(n)]}`}
            style={{ top: 8, height: ROW_H - 16, left: left + 1, width: Math.max(1, width - 2) }}
          >
            {width >= 18 ? n : null}
          </div>
        );
      })}
    </div>
  );
}
