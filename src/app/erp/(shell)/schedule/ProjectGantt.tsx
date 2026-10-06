"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CollapsibleSection } from "./CollapsibleSection";
import { InfoTip } from "@/app/erp/components/ui";
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
  type GanttFlag,
  type GanttStage,
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

type Person = { id: string; displayName: string };

type Zoom = "week" | "month" | "quarter";

const PX_PER_DAY: Record<Zoom, number> = { week: 32, month: 12, quarter: 4 };
// How far the arrow buttons move the timeline at each zoom.
const NAV_STEP_DAYS: Record<Zoom, number> = { week: 7, month: 28, quarter: 91 };
const ZOOM_LABELS: Record<Zoom, string> = { week: "Week", month: "Month", quarter: "Quarter" };
const ZOOM_STORAGE_KEY = "erp.schedule.ganttZoom";
const MODE_STORAGE_KEY = "erp.schedule.ganttMode";

type Mode = "project" | "crew";

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
const STAGE_DOT_CLASS: Record<GanttStage, string> = {
  ACTIVE: "bg-pink-500",
  UPCOMING: "border border-dashed border-pink-400 bg-white",
  ON_HOLD: "bg-gray-400",
};

// Width of the faded tail on a bar whose end date is a guess.
const ESTIMATE_FADE_PX = 40;

const HEADER_H = 44;
const ROW_H = 44;
const BAR_H = 18;

type IssueFilter = "ATTENTION" | "MISSING_DATES";

const ISSUE_FILTER_LABELS: Record<IssueFilter, string> = { ATTENTION: "Needs attention", MISSING_DATES: "Missing dates" };

function matchesIssueFilter(flags: GanttFlag[], filter: IssueFilter): boolean {
  return filter === "ATTENTION" ? flags.some(isSeriousFlag) : flags.some((f) => !isSeriousFlag(f));
}

function readStoredMode(): Mode {
  try {
    if (window.localStorage.getItem(MODE_STORAGE_KEY) === "crew") return "crew";
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

type Row = { p: ScheduleProject; stage: GanttStage; flags: GanttFlag[]; start: Date; end: Date };

export function ProjectGantt({
  projects,
  dayAssignments,
  workerAssignments,
  supervisors,
  contractors,
  crew,
}: {
  projects: ScheduleProject[];
  dayAssignments: ScheduleDayAssignment[];
  workerAssignments: ScheduleWorkerAssignment[];
  supervisors: Person[];
  contractors: Person[];
  crew: CrewPerson[];
}) {
  // Eastern business day, not the viewer's own timezone, same as the calendar.
  const todayDate = useMemo(() => todayEasternAsUtcMidnight(), []);
  const todayKey = dayKey(todayDate);
  const [mode, setMode] = useState<Mode>("project");
  const isCrew = mode === "crew";
  const [zoom, setZoom] = useState<Zoom>("month");
  const [search, setSearch] = useState("");
  // Active + Upcoming by default, on hold is opt-in since it isn't being
  // worked or planned right now.
  const [stageFilter, setStageFilter] = useState<Set<GanttStage>>(() => new Set<GanttStage>(["ACTIVE", "UPCOMING"]));
  const [issueFilter, setIssueFilter] = useState<IssueFilter | null>(null);

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
        return [{ p, stage, flags: ganttFlags(p, todayKey), ...projectWindow(p) }];
      }),
    [projects, todayKey],
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
        };
      }),
    [crew, todayKey],
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

  const counts = useMemo(() => {
    const c: Record<GanttStage | IssueFilter, number> = { ACTIVE: 0, UPCOMING: 0, ON_HOLD: 0, ATTENTION: 0, MISSING_DATES: 0 };
    for (const r of rows) {
      c[r.stage] += 1;
      if (matchesIssueFilter(r.flags, "ATTENTION")) c.ATTENTION += 1;
      if (matchesIssueFilter(r.flags, "MISSING_DATES")) c.MISSING_DATES += 1;
    }
    return c;
  }, [rows]);

  // Ongoing (today falls within its start/end window) first, then by start
  // date, so what's actually being worked on right now is always at the top.
  const visibleRows = useMemo(() => {
    const query = search.trim();
    const isOngoing = (r: Row) => r.start <= todayDate && r.end >= todayDate;
    return rows
      .filter((r) => stageFilter.has(r.stage))
      .filter((r) => !issueFilter || matchesIssueFilter(r.flags, issueFilter))
      .filter((r) => !query || matchesSearchQuery(r.p.jobTitle, query))
      .sort((a, b) => {
        const rankDiff = (isOngoing(a) ? 0 : 1) - (isOngoing(b) ? 0 : 1);
        if (rankDiff !== 0) return rankDiff;
        return a.start.getTime() - b.start.getTime();
      });
  }, [rows, stageFilter, issueFilter, search, todayDate]);

  // Built from every row (not just the filtered ones) so the scale stays put
  // while filtering or searching, only the rows change. Always keeps a couple
  // of weeks back and two months ahead of today in view.
  const range = useMemo(() => {
    let min = addDays(todayDate, -14);
    let max = addDays(todayDate, 56);
    for (const r of rows) {
      if (r.start < min) min = r.start;
      if (r.end > max) max = r.end;
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
  const filterKey = `${Array.from(stageFilter).sort().join(",")}|${issueFilter ?? ""}|${search.trim()}`;
  const lastFilterKey = useRef(filterKey);
  useEffect(() => {
    if (lastFilterKey.current === filterKey) return;
    lastFilterKey.current = filterKey;
    if (isCrew) return;
    const el = scrollRef.current;
    if (!el || visibleRows.length === 0) return;
    const leftCol = leftColRef.current?.offsetWidth ?? 0;
    const viewLeft = el.scrollLeft;
    const viewRight = viewLeft + el.clientWidth - leftCol;
    const spans = visibleRows.map((r) => {
      const late = r.flags.includes("PAST_END") ? daysBetweenKeys(dayKey(r.end), todayKey) : 0;
      return {
        left: Math.max(0, dayOffset(r.start)) * pxPerDay,
        right: (Math.min(totalDays - 1, dayOffset(r.end)) + 1 + late) * pxPerDay,
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

  function toggleStage(s: GanttStage) {
    setStageFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  function toggleKind(k: CrewKind) {
    setKindFilter((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  const legend = isCrew ? (
    <div className="space-y-1">
      <p>One row per person. Each block is a job they&apos;re on.</p>
      <p>Solid: work logged or sub confirmed. Dashed: planned only.</p>
      <p>Pink: post-construction. Green: turnovers.</p>
      <p>Red mark on top: double-booked that day.</p>
      <p>Under each name: days booked in the next 2 weeks.</p>
    </div>
  ) : (
    <div className="space-y-1">
      <p>Solid fill shows % done. Dashed outline: upcoming. Gray: on hold.</p>
      <p>Red line: days past the end date.</p>
      <p>Faded end: no end date set, length is an estimate.</p>
      <p>Under each name: who covers the job (supervisor and/or subs).</p>
    </div>
  );

  const hasRows = isCrew ? visibleCrewRows.length > 0 : visibleRows.length > 0;

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
    <CollapsibleSection title="Timeline">
      {rows.length === 0 && crew.length === 0 ? (
        <p className="text-sm text-gray-500">No active or upcoming projects. Create one in Projects → New project.</p>
      ) : (
        <div className="space-y-3">
          {/* Toolbar: wraps onto extra lines on narrow screens */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded border border-gray-200">
              {(["project", "crew"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => changeMode(m)}
                  className={`px-2.5 py-1 text-xs font-medium ${
                    mode === m ? "bg-pink-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {m === "project" ? "By project" : "By crew"}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={isCrew ? crewSearch : search}
              onChange={(e) => (isCrew ? setCrewSearch : setSearch)(e.target.value)}
              placeholder={isCrew ? "Search people..." : "Search projects..."}
              className="w-full rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-800 placeholder-gray-400 focus:border-pink-400 focus:outline-none sm:w-44"
            />
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
            {!isCrew && (["ACTIVE", "UPCOMING", "ON_HOLD"] as const).map((s) => (
              <button key={s} type="button" onClick={() => toggleStage(s)} className={chipClass(stageFilter.has(s))}>
                <span className={`h-2 w-2 rounded-full ${STAGE_DOT_CLASS[s]}`} />
                {STAGE_LABELS[s]} {counts[s]}
              </button>
            ))}
            {!isCrew && (["ATTENTION", "MISSING_DATES"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setIssueFilter((v) => (v === f ? null : f))}
                className={chipClass(issueFilter === f, "amber")}
                disabled={counts[f] === 0}
              >
                {ISSUE_FILTER_LABELS[f]} {counts[f]}
              </button>
            ))}
            <div className="flex items-center gap-1.5 sm:ml-auto">
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

          {!hasRows ? (
            <p className="text-sm text-gray-500">
              {isCrew ? "Nobody matches these filters." : "No projects match these filters."}
            </p>
          ) : (
            // One scroll area for both directions, so trackpad, mouse wheel,
            // and touch all scroll it naturally. The project column and the
            // date header stick in place inside it. Overscroll is contained
            // sideways only, so a sideways swipe doesn't trigger browser back
            // while up/down scrolling still carries on to the page.
            <div
              ref={attachScroll}
              onScroll={onTimelineScroll}
              className="max-h-[min(70vh,720px)] overflow-auto overscroll-x-contain rounded-lg border border-gray-200"
            >
              <div className="relative flex w-max">
                {/* Project column */}
                <div ref={leftColRef} className="sticky left-0 z-30 w-36 shrink-0 border-r border-gray-200 bg-white sm:w-60">
                  <div
                    className="sticky top-0 z-10 flex items-end border-b border-gray-200 bg-white px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400"
                    style={{ height: HEADER_H }}
                  >
                    {isCrew ? "Crew" : "Project"}
                  </div>
                  {isCrew
                    ? visibleCrewRows.map((r) => (
                        <CrewCell key={r.person.key} person={r.person} booked={r.booked} lanes={r.lanes} />
                      ))
                    : visibleRows.map((r) => <ProjectCell key={r.p.id} row={r} crew={crewByProject.get(r.p.id)} />)}
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
                    {grid.months.map((m) => (
                      <div key={m.left} className="absolute inset-y-0 border-l border-gray-200" style={{ left: m.left }} />
                    ))}
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
                      <span key={m.left} className="absolute top-1.5 whitespace-nowrap pl-1.5 font-medium text-gray-700" style={{ left: m.left }}>
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

                  {isCrew
                    ? visibleCrewRows.map((r) => (
                        <CrewTimelineRow
                          key={r.person.key}
                          segments={r.segments}
                          lanes={r.lanes}
                          doubleBookedKeys={r.doubleBookedKeys}
                          projectById={projectById}
                          pxPerDay={pxPerDay}
                          keyOffset={(k) => dayOffset(new Date(`${k}T00:00:00.000Z`))}
                          totalDays={totalDays}
                        />
                      ))
                    : null}
                  {!isCrew && visibleRows.map((r) => (
                    <GanttBar
                      key={r.p.id}
                      row={r}
                      pxPerDay={pxPerDay}
                      totalDays={totalDays}
                      todayKey={todayKey}
                      dayOffset={dayOffset}
                      view={view}
                      onReveal={revealPx}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </CollapsibleSection>
  );
}

function ProjectCell({ row, crew }: { row: Row; crew: { supervisor: string | null; subs: string[] } | undefined }) {
  const { p, flags } = row;
  const parts: string[] = [];
  if (crew?.supervisor) parts.push(crew.supervisor);
  if (crew?.subs.length) parts.push(...crew.subs);
  const crewText = parts.join(", ");
  return (
    <div className="flex flex-col justify-center border-b border-gray-100 px-3" style={{ height: ROW_H }}>
      <div className="flex min-w-0 items-center gap-1.5">
        <Link
          href={`/erp/projects/${p.id}`}
          className="truncate text-[13px] font-medium text-gray-900 hover:text-pink-600 hover:underline"
          title={p.jobTitle}
        >
          {p.jobTitle}
        </Link>
        {flags.length > 0 ? <FlagIcon flags={flags} /> : null}
      </div>
      <span className={`truncate text-[11px] ${crewText ? "text-gray-500" : "text-gray-300"}`} title={crewText || undefined}>
        {crewText || "No crew yet"}
      </span>
    </div>
  );
}

function FlagIcon({ flags }: { flags: GanttFlag[] }) {
  const serious = flags.some(isSeriousFlag);
  const text = flags.map((f) => GANTT_FLAG_LABELS[f]);
  return (
    <span
      title={text.join("\n")}
      aria-label={text.join(", ")}
      className={`inline-block h-2 w-2 shrink-0 cursor-help rounded-full ${serious ? "bg-amber-500" : "border border-amber-400"}`}
    />
  );
}

function GanttBar({
  row,
  pxPerDay,
  totalDays,
  todayKey,
  dayOffset,
  view,
  onReveal,
}: {
  row: Row;
  pxPerDay: number;
  totalDays: number;
  todayKey: string;
  dayOffset: (d: Date) => number;
  view: { left: number; right: number };
  onReveal: (px: number) => void;
}) {
  const { p, stage, flags, start, end } = row;
  const startOff = Math.max(0, dayOffset(start));
  const endOff = Math.min(totalDays - 1, dayOffset(end));
  const left = startOff * pxPerDay;
  const width = Math.max(pxPerDay * 2, (endOff - startOff + 1) * pxPerDay);
  const pct = Math.max(0, Math.min(100, Math.round(p.percentDone)));
  const estimatedEnd = flags.includes("NO_END_DATE");
  const startKey = dayKey(start);
  const endKey = dayKey(end);

  // Days past the end date, drawn as a thin red line from the bar to today.
  const daysLate = flags.includes("PAST_END") ? daysBetweenKeys(endKey, todayKey) : 0;
  const lateWidth = daysLate * pxPerDay;
  const labelLeft = left + width + lateWidth + 6;

  // Whole bar (plus its late line and % label) scrolled out of view: a pill
  // at that edge of the row says where it is and slides it into view.
  const LABEL_ROOM = 48;
  const offLeft = view.right > 0 && labelLeft + LABEL_ROOM < view.left + 4;
  const offRight = view.right > 0 && left > view.right - 4;

  const tooltip = [
    p.jobTitle,
    `${STAGE_LABELS[stage]}, ${pct}% done`,
    `${formatShortDate(startKey)} - ${formatShortDate(endKey)}${estimatedEnd ? " (estimated end)" : ""}`,
    daysLate > 0 ? `${daysLate} day${daysLate === 1 ? "" : "s"} past end date` : null,
    ...flags.filter((f) => f !== "PAST_END").map((f) => GANTT_FLAG_LABELS[f]),
  ]
    .filter(Boolean)
    .join("\n");

  const fade = estimatedEnd
    ? `linear-gradient(to right, #000 calc(100% - ${ESTIMATE_FADE_PX}px), transparent)`
    : undefined;
  const barTop = (ROW_H - BAR_H) / 2;

  return (
    <div className="relative border-b border-gray-100" style={{ height: ROW_H }}>
      {lateWidth > 0 ? (
        <div className="absolute h-0.5 bg-red-400" style={{ top: ROW_H / 2 - 1, left: left + width, width: lateWidth }} />
      ) : null}
      <Link
        href={`/erp/projects/${p.id}`}
        title={tooltip}
        className={`absolute overflow-hidden rounded transition-opacity hover:opacity-80 ${TRACK_CLASS[stage]}`}
        style={{ top: barTop, height: BAR_H, left, width, maskImage: fade, WebkitMaskImage: fade }}
      >
        <span className={`block h-full ${FILL_CLASS[stage]}`} style={{ width: `${pct}%` }} />
      </Link>
      <span
        className="pointer-events-none absolute whitespace-nowrap text-[11px] leading-none text-gray-500"
        style={{ top: ROW_H / 2 - 5, left: labelLeft }}
      >
        {pct}%
        {daysLate > 0 ? <span className="ml-1.5 font-medium text-red-500">{daysLate}d late</span> : null}
      </span>
      {offLeft || offRight ? (
        <button
          type="button"
          onClick={() => onReveal(left)}
          title="Show this project's bar"
          className="absolute z-10 whitespace-nowrap rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-medium text-gray-600 shadow-sm hover:border-pink-300 hover:text-pink-600"
          style={{
            top: ROW_H / 2 - 10,
            left: offLeft ? view.left + 6 : view.right - 6,
            transform: offRight ? "translateX(-100%)" : undefined,
          }}
        >
          {offLeft ? `‹ ${formatShortDate(endKey)}` : `${formatShortDate(startKey)} ›`}
        </button>
      ) : null}
    </div>
  );
}

function CrewCell({ person, booked, lanes }: { person: CrewPerson; booked: number; lanes: number }) {
  return (
    <div className="flex flex-col justify-center border-b border-gray-100 px-3" style={{ height: crewRowHeight(lanes) }}>
      <span className="truncate text-[13px] font-medium text-gray-900" title={person.name}>
        {person.name}
      </span>
      <span className="truncate text-[11px] text-gray-500">
        {CREW_KIND_LABELS[person.kind]} ·{" "}
        {booked === 0 ? <span className="text-emerald-600">Free next 2 wks</span> : `${booked} of next 14 days booked`}
      </span>
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
            {width >= 44 ? <span className="truncate">{title}</span> : null}
          </Link>
        );
      })}
    </div>
  );
}
