"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CollapsibleSection } from "./CollapsibleSection";
import { DayAssignmentModal } from "./DayAssignmentModal";
import { MiniCalendarPicker, dayAfter } from "./MiniCalendarPicker";
import {
  addDays,
  dayKey,
  matchesSearchQuery,
  monthMatrix,
  projectWindow,
  startOfDay,
  startOfMonth,
  type ScheduleChangeOrder,
  type ScheduleDayAssignment,
  type ScheduleProject,
  type ScheduleSovRequest,
  type ScheduleWorkerAssignment,
} from "@/lib/erp/schedule";
import { todayEasternAsUtcMidnight } from "@/lib/erp/dates";
import { calendarSegmentGroup, type CalendarSegmentGroup } from "@/lib/erp/projectSegments";
import { TURNOVER_SCOPE_OPTIONS, turnoverScopeLabel } from "@/lib/erp/turnoverScope";
import { SOVMultiCombobox } from "@/app/erp/components/SOVCombobox";

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

const CALENDAR_GROUP_LABEL: Record<CalendarSegmentGroup, string> = {
  POST_CONSTRUCTION: "Post-construction",
  JANITORIAL_TURNOVER_REQUESTS: "Janitorial turnover requests",
  REAL_ESTATE: "Real estate",
  OTHER: "Other",
};

const CHANGE_ORDER_CHIP_CLASS = "bg-blue-100 text-blue-800 hover:bg-blue-200";
const CHANGE_ORDER_SWATCH_CLASS = "bg-blue-100";
const CHANGE_ORDER_LABEL = "Change order (CO)";

const SOV_REQUEST_CHIP_CLASS = "bg-teal-100 text-teal-800 hover:bg-teal-200";
const SOV_REQUEST_SWATCH_CLASS = "bg-teal-100";
const SOV_REQUEST_LABEL = "SOV schedule request";

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

// WIP-vs-complete marker shown on every calendar chip for a project,
// regardless of which day/occurrence it's rendered on — a project scheduled
// both Monday and Wednesday reads Project.status off the same live record
// either day, so marking it COMPLETE updates every chip for it at once, not
// just the day it was completed on. Complete chips also fade slightly (a
// glance at a busy day tells done from still-in-progress at a glance).
function ProjectStatusIcon({ status }: { status: string }) {
  return status === "COMPLETE" ? (
    <span aria-hidden title="Complete" className="shrink-0 text-emerald-700">
      ✓
    </span>
  ) : (
    // Gear — a plain text glyph (not an emoji-presentation character like
    // 🔧), so no color of its own: it just inherits whichever text color
    // the chip it's sitting in already uses.
    <span aria-hidden title="In progress" className="shrink-0">
      ⚙
    </span>
  );
}

function projectStatusChipClass(status: string): string {
  return status === "COMPLETE" ? "opacity-60" : "";
}

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

function formatHours(hours: number): string {
  const n = Number.isInteger(hours) ? hours : hours.toFixed(1);
  return `${n} hr${hours === 1 ? "" : "s"}`;
}

// Restricts the scope picker to what was actually contracted for the unit
// (e.g. only "Clean"/"Paint" if that's all it has) — falls back to every
// category when there's no linked TurnoverRequest to restrict against.
function availableScopeOptionsFor(p: ScheduleProject) {
  return p.contractedScopeItems
    ? TURNOVER_SCOPE_OPTIONS.filter((opt) => p.contractedScopeItems!.includes(opt.value))
    : TURNOVER_SCOPE_OPTIONS;
}

function formatClockTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h! >= 12 ? "PM" : "AM";
  const hour12 = h! % 12 === 0 ? 12 : h! % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

function dayCellLabel(dateKey: string): string {
  return new Date(`${dateKey}T00:00:00.000Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

// "CO" (ProjectChangeOrder, blue) and "SOV" (ProjectSovScheduleRequest, teal)
// aren't project segments — they're layered on top as their own filterable
// types alongside the segment-based groups.
type ProjectTypeFilter = CalendarSegmentGroup | "CO" | "SOV";

const PROJECT_TYPE_FILTER_OPTIONS: { value: ProjectTypeFilter; label: string; swatch: string }[] = [
  { value: "POST_CONSTRUCTION", label: CALENDAR_GROUP_LABEL.POST_CONSTRUCTION, swatch: CALENDAR_GROUP_SWATCH_CLASS.POST_CONSTRUCTION },
  { value: "CO", label: CHANGE_ORDER_LABEL, swatch: CHANGE_ORDER_SWATCH_CLASS },
  { value: "SOV", label: SOV_REQUEST_LABEL, swatch: SOV_REQUEST_SWATCH_CLASS },
  { value: "JANITORIAL_TURNOVER_REQUESTS", label: CALENDAR_GROUP_LABEL.JANITORIAL_TURNOVER_REQUESTS, swatch: CALENDAR_GROUP_SWATCH_CLASS.JANITORIAL_TURNOVER_REQUESTS },
  { value: "REAL_ESTATE", label: CALENDAR_GROUP_LABEL.REAL_ESTATE, swatch: CALENDAR_GROUP_SWATCH_CLASS.REAL_ESTATE },
  { value: "OTHER", label: CALENDAR_GROUP_LABEL.OTHER, swatch: CALENDAR_GROUP_SWATCH_CLASS.OTHER },
];

const ALL_PROJECT_TYPE_FILTERS = PROJECT_TYPE_FILTER_OPTIONS.map((o) => o.value);

function monthLabel(d: Date): string {
  return d.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

type Person = { id: string; displayName: string };

/** Duplicates a calendar card (or a logged-labor day) onto whichever other
 * days get picked on the mini calendar — they don't need to be consecutive
 * or follow a weekly pattern, each click just toggles that day in or out of
 * the batch. One POST to the same day-assignments endpoint the "Assign to
 * day" modal uses, passing the exact picked dates. For a labor card
 * specifically, this is the only thing it writes: it never touches
 * LaborEntry, so the logged hours it's opened from are never duplicated or
 * altered, only future coverage is scheduled. */
function DuplicateToMoreDaysSection({
  projectId,
  fromDateKey,
  supervisorUserId,
  projectManagerUserId,
  sovItemIds,
  scopeItems,
  changeOrderIds,
  comment,
  startTime,
  endTime,
  supervisors,
  projectEndDateKey,
  onCreated,
}: {
  projectId: string;
  fromDateKey: string;
  supervisorUserId: string;
  projectManagerUserId: string;
  sovItemIds: string[];
  scopeItems: string[];
  changeOrderIds: string[];
  comment: string;
  startTime: string | null;
  endTime: string | null;
  supervisors: Person[];
  /** The project's current declared end date (YYYY-MM-DD), if any — when a
   * duplicate lands on a day after this, the project's end date gets pushed
   * out to match, so it stays a true reflection of the last scheduled day
   * rather than going stale the moment you schedule past it. */
  projectEndDateKey: string | null;
  onCreated: (assignments: ScheduleDayAssignment[]) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fallbackSupervisorId, setFallbackSupervisorId] = useState("");
  // Starts the day AFTER the card that's open — that day already has
  // whatever this card represents, duplicating onto it would just re-upsert
  // the same row.
  const startFromKey = dayAfter(fromDateKey);
  const [pickedKeys, setPickedKeys] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const effectiveSupervisorId = supervisorUserId || fallbackSupervisorId;
  const hasCoverage =
    !!effectiveSupervisorId ||
    !!projectManagerUserId ||
    comment.trim().length > 0 ||
    sovItemIds.length > 0 ||
    scopeItems.length > 0 ||
    changeOrderIds.length > 0;
  const sortedKeys = [...pickedKeys].sort();

  function togglePicked(k: string) {
    setPickedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  async function handleSave() {
    setError("");
    if (sortedKeys.length === 0) {
      setError("Pick at least one day on the calendar");
      return;
    }
    if (!hasCoverage) {
      setError("Pick a supervisor to duplicate with");
      return;
    }
    const isBatch = sortedKeys.length > 1;
    setSaving(true);
    try {
      const res = await fetch("/api/erp/schedule/day-assignments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId,
          date: sortedKeys[0],
          supervisorUserId: effectiveSupervisorId || undefined,
          projectManagerUserId: projectManagerUserId || undefined,
          startTime: startTime || undefined,
          endTime: endTime || undefined,
          sovItemIds: sovItemIds.length > 0 ? sovItemIds : undefined,
          scopeItems: scopeItems.length > 0 ? scopeItems : undefined,
          changeOrderIds: changeOrderIds.length > 0 ? changeOrderIds : undefined,
          comment: comment.trim() || undefined,
          ...(isBatch ? { dates: sortedKeys } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        id?: string;
        seriesId?: string;
        assignments?: { id: string }[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Failed to duplicate");
      const created: ScheduleDayAssignment[] = isBatch
        ? (data.assignments ?? []).map((a, i) => ({
            id: a.id,
            projectId,
            dateKey: sortedKeys[i]!,
            supervisorUserId: effectiveSupervisorId || null,
            projectManagerUserId: projectManagerUserId || null,
            startTime: startTime || null,
            endTime: endTime || null,
            seriesId: data.seriesId ?? null,
            sovItemIds,
            scopeItems,
            changeOrderIds,
            comment: comment.trim() || null,
          }))
        : data.id
        ? [
            {
              id: data.id,
              projectId,
              dateKey: sortedKeys[0]!,
              supervisorUserId: effectiveSupervisorId || null,
              projectManagerUserId: projectManagerUserId || null,
              startTime: startTime || null,
              endTime: endTime || null,
              seriesId: null,
              sovItemIds,
              scopeItems,
              changeOrderIds,
              comment: comment.trim() || null,
            },
          ]
        : [];
      onCreated(created);
      setOpen(false);
      setPickedKeys(new Set());
      // Duplicated past the project's declared end date — push it out to the
      // latest day just scheduled, best-effort (the duplicate itself already
      // succeeded above regardless of whether this follow-up does).
      const latestKey = sortedKeys[sortedKeys.length - 1]!;
      if (!projectEndDateKey || latestKey > projectEndDateKey) {
        try {
          const patchRes = await fetch(`/api/erp/projects/${projectId}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ projectEndDate: latestKey }),
          });
          if (patchRes.ok) router.refresh();
        } catch {
          // leave the project's end date as-is; the duplicated days are
          // already saved, this just skips the follow-up date bump
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to duplicate");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-2 border-t border-gray-100 pt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-[10px] font-medium text-pink-600 hover:underline"
      >
        {open ? "Cancel duplicate" : "Duplicate this to more days"}
      </button>
      {open ? (
        <div className="mt-1.5 space-y-1.5">
          <MiniCalendarPicker selectedKeys={pickedKeys} onToggle={togglePicked} minDateKey={startFromKey} initialMonthAnchor={startFromKey} />
          <p className="text-[9px] text-gray-400">
            {sortedKeys.length === 0
              ? "Tap the days to duplicate to — they don't need to be in a row."
              : `${sortedKeys.length} day${sortedKeys.length === 1 ? "" : "s"} picked: ${sortedKeys.join(", ")}`}
          </p>
          {!hasCoverage ? (
            <label className="block text-[9px] text-gray-400">
              Supervisor (needed to duplicate)
              <select
                value={fallbackSupervisorId}
                onChange={(e) => setFallbackSupervisorId(e.target.value)}
                className="mt-0.5 w-full rounded border border-gray-300 bg-white px-1.5 py-1 text-xs text-gray-800 focus:border-pink-400 focus:outline-none"
              >
                <option value="">— None —</option>
                {supervisors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.displayName}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {error ? <p className="text-[10px] text-red-500">{error}</p> : null}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || sortedKeys.length === 0}
            className="rounded bg-pink-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-pink-500 disabled:opacity-50"
          >
            {saving ? "Duplicating…" : `Duplicate to ${sortedKeys.length || ""} day${sortedKeys.length === 1 ? "" : "s"}`}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function SchedulePlanner({
  projects,
  supervisors,
  projectManagers,
  changeOrders,
  sovRequests,
  initialDayAssignments,
  canFilterBySupervisor,
  employees,
  contractors,
  initialWorkerAssignments,
}: {
  projects: ScheduleProject[];
  supervisors: Person[];
  projectManagers: Person[];
  changeOrders: ScheduleChangeOrder[];
  sovRequests: ScheduleSovRequest[];
  initialDayAssignments: ScheduleDayAssignment[];
  canFilterBySupervisor: boolean;
  employees: Person[];
  contractors: Person[];
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
  const [clearingSpanDateKey, setClearingSpanDateKey] = useState<string | null>(null);
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  // Deep link from elsewhere (e.g. the schedule-nudge popup's "Schedule it"
  // link) — ?scheduleProjectId=<id> opens today's assign-a-supervisor modal
  // pre-filled with that project, instead of landing on the bare calendar.
  const router = useRouter();
  const searchParams = useSearchParams();
  useEffect(() => {
    const projectId = searchParams.get("scheduleProjectId");
    if (!projectId || !projectById.has(projectId)) return;
    setOpenDayKey(dayKey(todayDate));
    setOpenDayInitialProjectId(projectId);
    router.replace("/erp/schedule");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Planned worker (crew) assignments — same local-state pattern as supervisor
  // day assignments, but no invite email is sent for these.
  const [workerAssignments, setWorkerAssignments] = useState(initialWorkerAssignments);

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

  // Clears a project's own start or end date straight from its calendar
  // marker's × — the marker isn't backed by its own row (see
  // projectSpanEndpointsByDay below), it's just projectDate/projectEndDate
  // itself, so "deleting" it means nulling out that field, same field the
  // marker's drag-to-reschedule already writes to. Dates are re-derived
  // server-side, so router.refresh() picks up the change the same way
  // handleEventDatesSave below does.
  async function handleClearProjectSpanDate(projectId: string, role: "start" | "end") {
    setClearingSpanDateKey(`${projectId}:${role}`);
    try {
      const res = await fetch(`/api/erp/projects/${projectId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(role === "end" ? { projectEndDate: null } : { projectDate: null }),
      });
      if (!res.ok) throw new Error("Failed to clear");
      router.refresh();
    } catch {
      setDragError("Couldn't clear that date — try again");
    } finally {
      setClearingSpanDateKey(null);
    }
  }

  // Event card — click any project chip on the month calendar to preview it
  // and adjust its date/coverage/workers without leaving the calendar, plus
  // a link through to the full project page. Rendered centered on screen
  // (same modal shell as the "+" day-assignment modal below), via a portal
  // to document.body — a dimmed (out-of-month) day cell is rendered at
  // opacity-40, and CSS opacity applies to the whole subtree as a unit, so a
  // card left nested inside that cell would be faded too regardless of its
  // own bg-white.
  const [eventPopoverKey, setEventPopoverKey] = useState<string | null>(null);
  // "project" chips (needs-supervisor / confirmed logged-work) edit the
  // project's own start/end date. A "planned" chip (dashed border) is a
  // single ProjectDayAssignment — editing its date means moving that planned
  // day somewhere else on the calendar, not touching the project's overall
  // start/end date, which is a different, project-wide field.
  const [eventKind, setEventKind] = useState<"project" | "planned">("project");
  // Only meaningful for eventKind "project" — which of the project's own
  // start/end dates this particular occurrence is, so the card can say so
  // explicitly instead of just showing two blank-looking date fields. Null
  // for a "planned" card (a single day doesn't have a start/end role) or
  // when opened some other way with no role context.
  const [eventRole, setEventRole] = useState<"start" | "end" | null>(null);
  const [eventAssignmentId, setEventAssignmentId] = useState<string | null>(null);
  const [eventPlannedDate, setEventPlannedDate] = useState("");
  const [eventPlannedStartTime, setEventPlannedStartTime] = useState("");
  const [eventPlannedEndTime, setEventPlannedEndTime] = useState("");
  const [eventStartDate, setEventStartDate] = useState("");
  const [eventEndDate, setEventEndDate] = useState("");
  const [eventSaving, setEventSaving] = useState(false);
  const [eventError, setEventError] = useState("");

  // Day-specific coverage (ProjectDayAssignment) for the popover's project —
  // separate from Project.supervisorUserId, since a day can be covered by a
  // PM only, with no supervisor at all (see the day-assignments API comment).
  const [eventDaySupervisorId, setEventDaySupervisorId] = useState("");
  const [eventDayPmId, setEventDayPmId] = useState("");
  const [eventDaySaving, setEventDaySaving] = useState(false);
  const [eventDayError, setEventDayError] = useState("");
  // SOV item(s) / janitorial scope for this specific day's coverage — same
  // fields as the day-assignment modal, editable here too so a card doesn't
  // have to be deleted and recreated via the modal just to set them.
  const [eventSovPicks, setEventSovPicks] = useState<string[]>([]);
  const [eventScopePicks, setEventScopePicks] = useState<string[]>([]);
  // Change order(s) this day's coverage is for, if any.
  const [eventCoPicks, setEventCoPicks] = useState<string[]>([]);
  // Free-text note, mainly for when there are no SOV items yet to pick from.
  const [eventComment, setEventComment] = useState("");

  // Worker add/remove for the specific (day, project) the popover is open
  // for — separate from the day-assignment modal's worker picker, which
  // isn't scoped to one project up front.
  const [eventWorkerType, setEventWorkerType] = useState<"employee" | "contractor">("employee");
  const [eventWorkerQuery, setEventWorkerQuery] = useState("");
  const [eventWorkerId, setEventWorkerId] = useState("");
  const [eventAddingWorker, setEventAddingWorker] = useState(false);
  const [eventWorkerError, setEventWorkerError] = useState("");
  // A worker legitimately can split a day across two jobs, so this is a
  // soft warning shown before the request fires, not a hard block.
  const [eventWorkerWarning, setEventWorkerWarning] = useState<string | null>(null);
  const [deletingEventWorkerId, setDeletingEventWorkerId] = useState<string | null>(null);

  function openEventPopover(k: string, p: ScheduleProject, assignment?: ScheduleDayAssignment, role?: "start" | "end") {
    setEventPopoverKey(`${k}:${p.id}`);
    setEventRole(role ?? null);
    if (assignment) {
      setEventKind("planned");
      setEventAssignmentId(assignment.id);
      setEventPlannedDate(assignment.dateKey);
      setEventPlannedStartTime(assignment.startTime ?? "");
      setEventPlannedEndTime(assignment.endTime ?? "");
    } else {
      setEventKind("project");
      setEventAssignmentId(null);
      setEventPlannedDate("");
      setEventPlannedStartTime("");
      setEventPlannedEndTime("");
    }
    setEventStartDate(p.projectDate ? p.projectDate.slice(0, 10) : "");
    setEventEndDate(p.projectEndDate ? p.projectEndDate.slice(0, 10) : "");
    setEventError("");
    const da = assignment ?? dayAssignments.find((a) => a.dateKey === k && a.projectId === p.id);
    setEventDaySupervisorId(da?.supervisorUserId ?? currentSupervisorId(p));
    setEventDayPmId(da?.projectManagerUserId ?? "");
    setEventDayError("");
    setEventSovPicks(da?.sovItemIds ?? []);
    setEventScopePicks(da?.scopeItems ?? []);
    setEventCoPicks(da?.changeOrderIds ?? []);
    setEventComment(da?.comment ?? "");
    setEventWorkerType("employee");
    setEventWorkerQuery("");
    setEventWorkerId("");
    setEventWorkerError("");
    setEventWorkerWarning(null);
  }

  // Moves and/or retimes a planned (ProjectDayAssignment), shared by the
  // event card's "Save planned date" button and drag-and-drop on the month
  // calendar. Supervisor/PM carry over unchanged. Day-assignments POST is an
  // upsert keyed by (projectId, date), so when the date is unchanged this
  // just updates the same row's time in place; only an actual date change
  // needs the create-on-new-date + migrate-workers + delete-old-row dance.
  async function movePlannedAssignment(
    projectId: string,
    assignmentId: string,
    fromK: string,
    toK: string,
    startTime: string | null,
    endTime: string | null,
    /** Defaults to carrying over the assignment's current values (e.g. a
     * plain drag-and-drop move) — pass explicit picks when saving from the
     * event card, whose SOV/scope pickers may have just been edited. */
    sovItemIds?: string[],
    scopeItems?: string[],
    changeOrderIds?: string[],
  ): Promise<{ ok: boolean; error?: string }> {
    const existingAssignment = dayAssignments.find((a) => a.id === assignmentId);
    if (!existingAssignment) return { ok: false, error: "Assignment not found" };
    const finalSovItemIds = sovItemIds ?? existingAssignment.sovItemIds;
    const finalScopeItems = scopeItems ?? existingAssignment.scopeItems;
    const finalChangeOrderIds = changeOrderIds ?? existingAssignment.changeOrderIds;
    try {
      const dayRes = await fetch("/api/erp/schedule/day-assignments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId,
          date: toK,
          supervisorUserId: existingAssignment.supervisorUserId || undefined,
          projectManagerUserId: existingAssignment.projectManagerUserId || undefined,
          startTime: startTime || undefined,
          endTime: endTime || undefined,
          sovItemIds: finalSovItemIds.length > 0 ? finalSovItemIds : undefined,
          scopeItems: finalScopeItems.length > 0 ? finalScopeItems : undefined,
          changeOrderIds: finalChangeOrderIds.length > 0 ? finalChangeOrderIds : undefined,
          comment: existingAssignment.comment || undefined,
        }),
      });
      const dayData = (await dayRes.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!dayRes.ok || !dayData.id) return { ok: false, error: dayData.error || "Failed to save" };

      const dateChanged = toK !== fromK;
      const newWorkers: ScheduleWorkerAssignment[] = [];
      if (dateChanged) {
        const oldWorkers = workerAssignments.filter((w) => w.dateKey === fromK && w.projectId === projectId);
        for (const w of oldWorkers) {
          const wRes = await fetch("/api/erp/schedule/worker-assignments", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              projectId,
              employeeId: w.employeeId || undefined,
              contractorId: w.contractorId || undefined,
              date: toK,
            }),
          });
          const wData = (await wRes.json().catch(() => ({}))) as { id?: string };
          if (wRes.ok && wData.id) {
            newWorkers.push({ id: wData.id, projectId, employeeId: w.employeeId, contractorId: w.contractorId, dateKey: toK, seriesId: null });
          }
        }

        // Deletes the old-date row and (per that route) clears worker
        // assignments still dated to the old day — safe to run after the
        // above since the carried-over workers now live on toK instead.
        await fetch(`/api/erp/schedule/day-assignments/${assignmentId}`, { method: "DELETE" });
      }

      setDayAssignments((prev) => [
        ...prev.filter((a) => a.id !== assignmentId && a.id !== dayData.id),
        {
          id: dayData.id!,
          projectId,
          dateKey: toK,
          supervisorUserId: existingAssignment.supervisorUserId,
          projectManagerUserId: existingAssignment.projectManagerUserId,
          startTime,
          endTime,
          seriesId: dateChanged ? null : existingAssignment.seriesId,
          sovItemIds: finalSovItemIds,
          scopeItems: finalScopeItems,
          changeOrderIds: finalChangeOrderIds,
          comment: existingAssignment.comment,
        },
      ]);
      if (dateChanged) {
        setWorkerAssignments((prev) => [
          ...prev.filter((w) => !(w.dateKey === fromK && w.projectId === projectId)),
          ...newWorkers,
        ]);
        // Notify the supervisor/PM this was moved — same rule as a plain
        // project-date reschedule (see PATCH /api/erp/projects/[id]), just
        // triggered from here since this path never touches that route.
        fetch("/api/erp/schedule/notify-reschedule", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            projectId,
            oldDateKey: fromK,
            newDateKey: toK,
            supervisorUserId: existingAssignment.supervisorUserId,
            projectManagerUserId: existingAssignment.projectManagerUserId,
          }),
        }).catch(() => {});
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Failed to save" };
    }
  }

  async function handleEventPlannedDateSave(oldK: string, projectId: string, assignmentId: string) {
    setEventError("");
    const newK = eventPlannedDate;
    if (!newK) {
      setEventError("Pick a date");
      return;
    }
    if ((eventPlannedStartTime && !eventPlannedEndTime) || (eventPlannedEndTime && !eventPlannedStartTime)) {
      setEventError("Set both a start and end time, or leave both blank for all-day");
      return;
    }
    if (eventPlannedStartTime && eventPlannedEndTime && eventPlannedEndTime <= eventPlannedStartTime) {
      setEventError("End time must be after start time");
      return;
    }
    setEventSaving(true);
    const result = await movePlannedAssignment(
      projectId,
      assignmentId,
      oldK,
      newK,
      eventPlannedStartTime || null,
      eventPlannedEndTime || null,
      eventSovPicks,
      eventScopePicks,
      eventCoPicks,
    );
    setEventSaving(false);
    if (!result.ok) {
      setEventError(result.error ?? "Failed to save");
      return;
    }
    setEventPopoverKey(null);
  }

  // Drag-and-drop rescheduling on the month calendar, Google-Calendar style.
  // Only chips backed by a date the app controls are draggable: the amber
  // "needs supervisor" chip (moves Project.projectDate/projectEndDate), the
  // dashed "planned" chip (moves its ProjectDayAssignment, workers
  // included), and a change-order chip on its scheduledDateKey/
  // scheduledEndDateKey occurrence (moves ProjectChangeOrder.startDate or
  // .endDate). A confirmed chip — or a CO chip on a day that's only there
  // because labor was logged or it was explicitly planned via a day
  // assignment, not because it's the start/end date — is backed by a fact
  // or an existing assignment (not this project-level "date" plan) and is
  // deliberately never made draggable — see the chip render sites below.
  const [draggingChip, setDraggingChip] = useState<
    | { kind: "needsSupervisor"; projectId: string; fromKey: string; jobTitle: string; role: "start" | "end" }
    | { kind: "planned"; projectId: string; assignmentId: string; fromKey: string; jobTitle: string }
    | { kind: "changeOrder"; projectId: string; changeOrderId: string; fromKey: string; jobTitle: string; role: "start" | "end" }
    | null
  >(null);
  const [dragOverDayKey, setDragOverDayKey] = useState<string | null>(null);
  const [dragError, setDragError] = useState<string | null>(null);

  async function handleDropOnDay(toKey: string) {
    const chip = draggingChip;
    setDraggingChip(null);
    setDragOverDayKey(null);
    if (!chip || toKey === chip.fromKey) return;
    setDragError(null);
    if (chip.kind === "needsSupervisor") {
      try {
        const res = await fetch(`/api/erp/projects/${chip.projectId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(chip.role === "end" ? { projectEndDate: toKey } : { projectDate: toKey }),
        });
        if (!res.ok) throw new Error("Failed to reschedule");
        router.refresh();
      } catch {
        setDragError(`Couldn't move "${chip.jobTitle}" — try again`);
      }
      return;
    }
    if (chip.kind === "changeOrder") {
      try {
        const res = await fetch(`/api/erp/projects/${chip.projectId}/change-orders/${chip.changeOrderId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(chip.role === "end" ? { endDate: toKey } : { startDate: toKey }),
        });
        if (!res.ok) throw new Error("Failed to reschedule");
        router.refresh();
      } catch {
        setDragError(`Couldn't move "${chip.jobTitle}" — try again`);
      }
      return;
    }
    const existingAssignment = dayAssignments.find((a) => a.id === chip.assignmentId);
    const result = await movePlannedAssignment(
      chip.projectId,
      chip.assignmentId,
      chip.fromKey,
      toKey,
      existingAssignment?.startTime ?? null,
      existingAssignment?.endTime ?? null,
    );
    if (!result.ok) setDragError(`Couldn't move "${chip.jobTitle}" — ${result.error ?? "try again"}`);
  }

  // Read-only labor detail card — a "confirmed" chip is backed by actual
  // logged LaborEntry rows, a fact rather than a plan, so unlike the event
  // card above this one has no editable fields at all. Correcting a logged
  // entry (wrong hours, wrong worker, etc.) has to happen on the project's
  // own Labor log, which is the one place that write actually belongs.
  const [laborPopoverKey, setLaborPopoverKey] = useState<string | null>(null);

  function openLaborPopover(k: string, p: ScheduleProject) {
    setLaborPopoverKey(`${k}:${p.id}`);
  }

  function renderLaborPopover(k: string, p: ScheduleProject) {
    if (laborPopoverKey !== `${k}:${p.id}`) return null;
    const entries = p.laborEntriesByDay[k] ?? [];
    const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);
    // Coverage to carry forward when repeating this day — from an explicit
    // day-assignment recorded alongside the logged labor if one exists,
    // otherwise just the project's current supervisor.
    const existingAssignment = dayAssignments.find((a) => a.dateKey === k && a.projectId === p.id);

    return createPortal(
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        onClick={() => setLaborPopoverKey(null)}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-lg border border-gray-200 bg-white p-4 text-left shadow-xl"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-semibold text-gray-800">{p.jobTitle}</p>
            <button
              type="button"
              onClick={() => setLaborPopoverKey(null)}
              aria-label="Close"
              className="shrink-0 text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
          </div>
          <p className="mt-0.5 text-[10px] text-gray-400">
            {CALENDAR_GROUP_LABEL[calendarSegmentGroup(p.segment)]} · {dayCellLabel(k)}
          </p>

          <div className="mt-3 border-t border-gray-100 pt-2.5">
            <div className="flex items-center justify-between">
              <label className="block text-[10px] font-medium text-gray-500">Logged labor</label>
              <span className="text-[10px] font-semibold text-gray-700">{formatHours(totalHours)} total</span>
            </div>
            {entries.length > 0 ? (
              <ul className="mt-1.5 space-y-1">
                {entries.map((e, i) => (
                  <li
                    key={`${e.workerName}-${i}`}
                    className="flex items-center justify-between gap-2 rounded border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] text-gray-700"
                  >
                    <span className="truncate font-medium">{e.workerName}</span>
                    <span className="shrink-0 text-gray-500">
                      {formatHours(e.hours)}
                      {e.clockIn ? <span className="text-gray-400"> · started {formatClockTime(e.clockIn)}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1.5 text-[10px] text-gray-400">No labor entries found for this day.</p>
            )}
          </div>

          <p className="mt-3 text-[10px] text-gray-400">
            This is logged, historical labor — it can only be corrected from the project&apos;s Labor log, not from the calendar.
          </p>

          <DuplicateToMoreDaysSection
            projectId={p.id}
            fromDateKey={k}
            supervisorUserId={existingAssignment?.supervisorUserId ?? currentSupervisorId(p)}
            projectManagerUserId={existingAssignment?.projectManagerUserId ?? ""}
            sovItemIds={existingAssignment?.sovItemIds ?? []}
            scopeItems={existingAssignment?.scopeItems ?? []}
            changeOrderIds={existingAssignment?.changeOrderIds ?? []}
            comment={existingAssignment?.comment ?? ""}
            startTime={existingAssignment?.startTime ?? null}
            endTime={existingAssignment?.endTime ?? null}
            supervisors={supervisors}
            projectEndDateKey={p.projectEndDate ? p.projectEndDate.slice(0, 10) : null}
            onCreated={(created) => setDayAssignments((prev) => [...prev.filter((a) => !created.some((c) => c.id === a.id)), ...created])}
          />

          <div className="mt-2.5 flex items-center gap-1.5">
            <Link
              href={`/erp/projects/${p.id}#labor-log`}
              className="rounded bg-pink-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-pink-500"
            >
              Go to labor log
            </Link>
            <Link
              href={`/erp/projects/${p.id}`}
              className="rounded border border-gray-200 px-2 py-1 text-[10px] font-medium text-gray-600 hover:border-pink-300 hover:text-pink-600"
            >
              View project
            </Link>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  // Read-only change-order detail card, same idea as the labor card above —
  // a CO's own scope/pricing lives on its own page, this is just a calendar
  // preview of which day it's shown on and what got logged against it.
  const [coPopoverKey, setCoPopoverKey] = useState<string | null>(null);

  function openCoPopover(k: string, co: ScheduleChangeOrder) {
    setCoPopoverKey(`${k}:${co.id}`);
  }

  function renderCoPopover(k: string, co: ScheduleChangeOrder) {
    if (coPopoverKey !== `${k}:${co.id}`) return null;
    const summary = co.laborByDay[k];
    const parentProject = projectById.get(co.projectId);

    return createPortal(
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        onClick={() => setCoPopoverKey(null)}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-lg border border-gray-200 bg-white p-4 text-left shadow-xl"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-semibold text-gray-800">{co.title}</p>
            <button
              type="button"
              onClick={() => setCoPopoverKey(null)}
              aria-label="Close"
              className="shrink-0 text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
          </div>
          <p className="mt-0.5 text-[10px] text-gray-400">
            {CHANGE_ORDER_LABEL} · {dayCellLabel(k)}
          </p>
          {parentProject ? (
            <p className="mt-0.5 text-[10px] text-gray-400">Project: {parentProject.jobTitle}</p>
          ) : null}
          <p className="mt-0.5 text-[10px] text-gray-400">Status: {co.status}</p>

          <div className="mt-3 border-t border-gray-100 pt-2.5">
            <div className="flex items-center justify-between">
              <label className="block text-[10px] font-medium text-gray-500">Logged labor this day</label>
              <span className="text-[10px] font-semibold text-gray-700">{summary ? formatHours(summary.hours) : "0 hrs"}</span>
            </div>
            {summary && summary.workers.length > 0 ? (
              <p className="mt-1.5 text-[11px] text-gray-600">Workers: {summary.workers.join(", ")}</p>
            ) : (
              <p className="mt-1.5 text-[10px] text-gray-400">No labor logged for this day.</p>
            )}
          </div>

          <div className="mt-2.5 flex items-center gap-1.5">
            <Link
              href={`/erp/projects/${co.projectId}/change-orders/${co.id}`}
              className="rounded bg-pink-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-pink-500"
            >
              View change order
            </Link>
            <Link
              href={`/erp/projects/${co.projectId}`}
              className="rounded border border-gray-200 px-2 py-1 text-[10px] font-medium text-gray-600 hover:border-pink-300 hover:text-pink-600"
            >
              View project
            </Link>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  async function handleEventDayAssignmentSave(k: string, projectId: string) {
    setEventDayError("");
    const existing = dayAssignments.find((a) => a.dateKey === k && a.projectId === projectId);
    // A supervisor/PM isn't required to keep an assignment around — SOV
    // picks, scope picks, change-order picks, or a comment are each enough
    // coverage on their own. Only clear the row when literally nothing is set.
    const hasCoverage =
      eventSovPicks.length > 0 || eventScopePicks.length > 0 || eventCoPicks.length > 0 || eventComment.trim().length > 0;
    if (!eventDaySupervisorId && !eventDayPmId && !hasCoverage) {
      if (!existing) return;
      setEventDaySaving(true);
      try {
        const res = await fetch(`/api/erp/schedule/day-assignments/${existing.id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Failed to clear");
        setDayAssignments((prev) => prev.filter((a) => a.id !== existing.id));
      } catch {
        setEventDayError("Failed to clear");
      } finally {
        setEventDaySaving(false);
      }
      return;
    }
    setEventDaySaving(true);
    try {
      const res = await fetch("/api/erp/schedule/day-assignments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId,
          date: k,
          supervisorUserId: eventDaySupervisorId || undefined,
          projectManagerUserId: eventDayPmId || undefined,
          sovItemIds: eventSovPicks.length > 0 ? eventSovPicks : undefined,
          scopeItems: eventScopePicks.length > 0 ? eventScopePicks : undefined,
          changeOrderIds: eventCoPicks.length > 0 ? eventCoPicks : undefined,
          comment: eventComment.trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to save");
      if (data.id) {
        setDayAssignments((prev) => [
          ...prev.filter((a) => !(a.dateKey === k && a.projectId === projectId)),
          {
            id: data.id!,
            projectId,
            dateKey: k,
            supervisorUserId: eventDaySupervisorId || null,
            projectManagerUserId: eventDayPmId || null,
            startTime: existing?.startTime ?? null,
            endTime: existing?.endTime ?? null,
            seriesId: existing?.seriesId ?? null,
            sovItemIds: eventSovPicks,
            scopeItems: eventScopePicks,
            changeOrderIds: eventCoPicks,
            comment: eventComment.trim() || null,
          },
        ]);
      }
      // Assigning a supervisor here also sets it as the project's overall
      // supervisor server-side (see the day-assignments route) — mirror that
      // in the Gantt's inline dropdown right away, same as the day-assignment
      // modal does.
      if (eventDaySupervisorId) setSupervisorOverrides((o) => ({ ...o, [projectId]: eventDaySupervisorId }));
    } catch (err) {
      setEventDayError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setEventDaySaving(false);
    }
  }

  function findWorkerConflicts(k: string, projectId: string, type: "employee" | "contractor", workerId: string) {
    return workerAssignments.filter((a) => {
      if (a.dateKey !== k || a.projectId === projectId) return false;
      return type === "employee" ? a.employeeId === workerId : a.contractorId === workerId;
    });
  }

  async function handleEventAddWorker(k: string, projectId: string, force = false) {
    setEventWorkerError("");
    if (!eventWorkerId) {
      setEventWorkerError(eventWorkerType === "employee" ? "Pick a worker" : "Pick a contractor");
      return;
    }
    if (!force) {
      const conflicts = findWorkerConflicts(k, projectId, eventWorkerType, eventWorkerId);
      if (conflicts.length > 0) {
        const names = conflicts.map((c) => projectById.get(c.projectId)?.jobTitle ?? "another project").join(", ");
        setEventWorkerWarning(`Already scheduled on ${names} this day — add anyway?`);
        return;
      }
    }
    setEventWorkerWarning(null);
    setEventAddingWorker(true);
    try {
      const res = await fetch("/api/erp/schedule/worker-assignments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId,
          employeeId: eventWorkerType === "employee" ? eventWorkerId : undefined,
          contractorId: eventWorkerType === "contractor" ? eventWorkerId : undefined,
          date: k,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to add worker");
      if (data.id) {
        setWorkerAssignments((prev) => [
          ...prev,
          {
            id: data.id!,
            projectId,
            employeeId: eventWorkerType === "employee" ? eventWorkerId : null,
            contractorId: eventWorkerType === "contractor" ? eventWorkerId : null,
            dateKey: k,
            seriesId: null,
          },
        ]);
      }
      setEventWorkerQuery("");
      setEventWorkerId("");
    } catch (err) {
      setEventWorkerError(err instanceof Error ? err.message : "Failed to add worker");
    } finally {
      setEventAddingWorker(false);
    }
  }

  async function handleEventDeleteWorker(id: string) {
    setDeletingEventWorkerId(id);
    const previous = workerAssignments;
    setWorkerAssignments((prev) => prev.filter((a) => a.id !== id));
    try {
      const res = await fetch(`/api/erp/schedule/worker-assignments/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to remove");
    } catch {
      setWorkerAssignments(previous);
    } finally {
      setDeletingEventWorkerId(null);
    }
  }

  // Dates are re-derived server-side (Gantt windows, "needs supervisor"
  // bucket, work-day placement all key off them), so a plain router.refresh()
  // after the PATCH is simpler and safer than trying to patch every derived
  // map locally.
  async function handleEventDatesSave(projectId: string) {
    setEventSaving(true);
    setEventError("");
    try {
      const res = await fetch(`/api/erp/projects/${projectId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectDate: eventStartDate || null,
          projectEndDate: eventEndDate || null,
        }),
      });
      if (!res.ok) throw new Error("Update failed");
      setEventPopoverKey(null);
      router.refresh();
    } catch {
      setEventError("Failed to save");
    } finally {
      setEventSaving(false);
    }
  }

  function renderEventPopover(k: string, p: ScheduleProject) {
    if (eventPopoverKey !== `${k}:${p.id}`) return null;

    const dayWorkers = workerAssignments.filter((a) => a.dateKey === k && a.projectId === p.id);
    const workerOptions = eventWorkerType === "employee" ? employees : contractors;
    const filteredWorkerOptions = eventWorkerQuery.trim()
      ? workerOptions.filter((w) => matchesSearchQuery(w.displayName, eventWorkerQuery))
      : workerOptions;

    return createPortal(
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        onClick={() => setEventPopoverKey(null)}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-lg border border-gray-200 bg-white p-4 text-left shadow-xl"
        >
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-semibold text-gray-800">{p.jobTitle}</p>
          <button
            type="button"
            onClick={() => setEventPopoverKey(null)}
            aria-label="Close"
            className="shrink-0 text-gray-400 hover:text-gray-600"
          >
            ×
          </button>
        </div>
        <p className="mt-0.5 text-[10px] text-gray-400">{CALENDAR_GROUP_LABEL[calendarSegmentGroup(p.segment)]}</p>

        {eventKind === "planned" && eventAssignmentId ? (
          <div className="mt-2 space-y-1.5">
            <label className="block text-[10px] font-medium text-gray-500">
              Planned date
              <input
                type="date"
                value={eventPlannedDate}
                onChange={(e) => setEventPlannedDate(e.target.value)}
                className="mt-0.5 w-full rounded border border-gray-300 px-1.5 py-1 text-xs text-gray-800 focus:border-pink-400 focus:outline-none"
              />
            </label>
            <label className="block text-[10px] font-medium text-gray-500">
              Time (optional — leave blank for all-day)
              <div className="mt-0.5 flex items-center gap-1.5">
                <input
                  type="time"
                  value={eventPlannedStartTime}
                  onChange={(e) => setEventPlannedStartTime(e.target.value)}
                  className="w-full rounded border border-gray-300 px-1.5 py-1 text-xs text-gray-800 focus:border-pink-400 focus:outline-none"
                />
                <span className="text-[10px] text-gray-400">to</span>
                <input
                  type="time"
                  value={eventPlannedEndTime}
                  onChange={(e) => setEventPlannedEndTime(e.target.value)}
                  className="w-full rounded border border-gray-300 px-1.5 py-1 text-xs text-gray-800 focus:border-pink-400 focus:outline-none"
                />
              </div>
            </label>
            <DuplicateToMoreDaysSection
              projectId={p.id}
              fromDateKey={k}
              supervisorUserId={eventDaySupervisorId}
              projectManagerUserId={eventDayPmId}
              sovItemIds={eventSovPicks}
              scopeItems={eventScopePicks}
              changeOrderIds={eventCoPicks}
              comment={eventComment}
              startTime={eventPlannedStartTime || null}
              endTime={eventPlannedEndTime || null}
              supervisors={supervisors}
              projectEndDateKey={p.projectEndDate ? p.projectEndDate.slice(0, 10) : null}
              onCreated={(created) => setDayAssignments((prev) => [...prev.filter((a) => !created.some((c) => c.id === a.id)), ...created])}
            />
          </div>
        ) : (
          <div className="mt-2 space-y-1.5">
            {eventRole ? (
              <p className="rounded bg-amber-50 px-1.5 py-1 text-[10px] font-medium text-amber-800">
                {eventRole === "end"
                  ? "This is the project's scheduled end date."
                  : "This is the project's scheduled start date."}
              </p>
            ) : null}
            <label className="block text-[10px] font-medium text-gray-500">
              Start date
              <input
                type="date"
                value={eventStartDate}
                onChange={(e) => setEventStartDate(e.target.value)}
                className="mt-0.5 w-full rounded border border-gray-300 px-1.5 py-1 text-xs text-gray-800 focus:border-pink-400 focus:outline-none"
              />
            </label>
            <label className="block text-[10px] font-medium text-gray-500">
              End date
              <input
                type="date"
                value={eventEndDate}
                onChange={(e) => setEventEndDate(e.target.value)}
                className="mt-0.5 w-full rounded border border-gray-300 px-1.5 py-1 text-xs text-gray-800 focus:border-pink-400 focus:outline-none"
              />
            </label>
            <DuplicateToMoreDaysSection
              projectId={p.id}
              fromDateKey={k}
              supervisorUserId={eventDaySupervisorId}
              projectManagerUserId={eventDayPmId}
              sovItemIds={eventSovPicks}
              scopeItems={eventScopePicks}
              changeOrderIds={eventCoPicks}
              comment={eventComment}
              startTime={null}
              endTime={null}
              supervisors={supervisors}
              projectEndDateKey={p.projectEndDate ? p.projectEndDate.slice(0, 10) : null}
              onCreated={(created) => setDayAssignments((prev) => [...prev.filter((a) => !created.some((c) => c.id === a.id)), ...created])}
            />
          </div>
        )}

        {eventError ? <p className="mt-1 text-[10px] text-red-500">{eventError}</p> : null}

        <div className="mt-2 flex items-center gap-1.5">
          {eventKind === "planned" && eventAssignmentId ? (
            <button
              type="button"
              onClick={() => handleEventPlannedDateSave(k, p.id, eventAssignmentId)}
              disabled={eventSaving}
              className="rounded bg-pink-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-pink-500 disabled:opacity-50"
            >
              {eventSaving ? "Moving…" : "Save planned date"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleEventDatesSave(p.id)}
              disabled={eventSaving}
              className="rounded bg-pink-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-pink-500 disabled:opacity-50"
            >
              {eventSaving ? "Saving…" : "Save dates"}
            </button>
          )}
          <Link
            href={`/erp/projects/${p.id}`}
            className="rounded border border-gray-200 px-2 py-1 text-[10px] font-medium text-gray-600 hover:border-pink-300 hover:text-pink-600"
          >
            View project
          </Link>
        </div>

        <div className="mt-3 border-t border-gray-100 pt-2.5">
          <label className="block text-[10px] font-medium text-gray-500">Coverage for this day</label>
          <div className="mt-0.5 grid grid-cols-2 gap-1.5">
            <div>
              <label className="block text-[9px] text-gray-400">Supervisor</label>
              <select
                value={eventDaySupervisorId}
                onChange={(e) => setEventDaySupervisorId(e.target.value)}
                className="mt-0.5 w-full rounded border border-gray-300 bg-white px-1.5 py-1 text-xs text-gray-800 focus:border-pink-400 focus:outline-none"
              >
                <option value="">— None —</option>
                {supervisors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.displayName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[9px] text-gray-400">PM (if no supervisor)</label>
              <select
                value={eventDayPmId}
                onChange={(e) => setEventDayPmId(e.target.value)}
                className="mt-0.5 w-full rounded border border-gray-300 bg-white px-1.5 py-1 text-xs text-gray-800 focus:border-pink-400 focus:outline-none"
              >
                <option value="">— None —</option>
                {projectManagers.map((pm) => (
                  <option key={pm.id} value={pm.id}>
                    {pm.displayName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {calendarSegmentGroup(p.segment) === "POST_CONSTRUCTION" ? (
            <div className="mt-1.5">
              <label className="block text-[9px] text-gray-400">SOV item(s) being worked on</label>
              <div className="mt-0.5">
                {p.sovItems.length > 0 ? (
                  <SOVMultiCombobox sovItems={p.sovItems} selectedIds={eventSovPicks} onChange={setEventSovPicks} />
                ) : (
                  <div>
                    <p className="text-[10px] text-gray-400">No SOV items on this project yet.</p>
                    <textarea
                      value={eventComment}
                      onChange={(e) => setEventComment(e.target.value)}
                      placeholder="Describe what's being worked on this day..."
                      rows={2}
                      className="mt-1 w-full rounded border border-gray-300 bg-white px-1.5 py-1 text-xs text-gray-800 focus:border-pink-400 focus:outline-none"
                    />
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {calendarSegmentGroup(p.segment) === "JANITORIAL_TURNOVER_REQUESTS" && availableScopeOptionsFor(p).length > 0 ? (
            <div className="mt-1.5">
              <label className="block text-[9px] text-gray-400">Scope covered this day</label>
              <div className="mt-0.5 flex flex-wrap gap-1">
                {availableScopeOptionsFor(p).map((opt) => {
                  const active = eventScopePicks.includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        setEventScopePicks((prev) =>
                          prev.includes(opt.value) ? prev.filter((v) => v !== opt.value) : [...prev, opt.value]
                        )
                      }
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        active ? "bg-pink-600 text-white" : "border border-gray-300 text-gray-600 hover:border-pink-400"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {p.changeOrders.length > 0 ? (
            <div className="mt-1.5">
              <label className="block text-[9px] text-gray-400">Change order(s) covered this day</label>
              <div className="mt-0.5 flex flex-wrap gap-1">
                {p.changeOrders.map((co) => {
                  const active = eventCoPicks.includes(co.id);
                  return (
                    <button
                      key={co.id}
                      type="button"
                      onClick={() =>
                        setEventCoPicks((prev) =>
                          prev.includes(co.id) ? prev.filter((v) => v !== co.id) : [...prev, co.id]
                        )
                      }
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        active ? "bg-blue-600 text-white" : "border border-gray-300 text-gray-600 hover:border-blue-400"
                      }`}
                    >
                      {co.title}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {eventDayError ? <p className="mt-1 text-[10px] text-red-500">{eventDayError}</p> : null}
          <button
            type="button"
            onClick={() => handleEventDayAssignmentSave(k, p.id)}
            disabled={eventDaySaving}
            className="mt-1.5 rounded bg-pink-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-pink-500 disabled:opacity-50"
          >
            {eventDaySaving ? "Saving…" : "Save coverage"}
          </button>
        </div>

        <div className="mt-3 border-t border-gray-100 pt-2.5">
          <label className="block text-[10px] font-medium text-gray-500">Workers scheduled this day</label>
          {dayWorkers.length > 0 ? (
            <ul className="mt-1 space-y-1">
              {dayWorkers.map((w) => {
                const name = w.employeeId
                  ? employees.find((e) => e.id === w.employeeId)?.displayName
                  : contractors.find((c) => c.id === w.contractorId)?.displayName;
                return (
                  <li
                    key={w.id}
                    className="flex items-center justify-between gap-1.5 rounded border border-gray-200 bg-gray-50 px-1.5 py-1 text-[11px] text-gray-700"
                  >
                    <span className="truncate">{name ?? "Unknown worker"}</span>
                    <button
                      type="button"
                      onClick={() => handleEventDeleteWorker(w.id)}
                      disabled={deletingEventWorkerId === w.id}
                      className="shrink-0 text-gray-400 hover:text-red-500 disabled:opacity-40"
                    >
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-1 text-[10px] text-gray-400">None scheduled yet.</p>
          )}

          <div className="mt-1.5 flex gap-1">
            <button
              type="button"
              onClick={() => {
                setEventWorkerType("employee");
                setEventWorkerQuery("");
                setEventWorkerId("");
                setEventWorkerWarning(null);
              }}
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                eventWorkerType === "employee" ? "bg-gray-700 text-white" : "border border-gray-300 text-gray-600 hover:border-gray-400"
              }`}
            >
              Employee
            </button>
            <button
              type="button"
              onClick={() => {
                setEventWorkerType("contractor");
                setEventWorkerQuery("");
                setEventWorkerId("");
                setEventWorkerWarning(null);
              }}
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                eventWorkerType === "contractor" ? "bg-gray-700 text-white" : "border border-gray-300 text-gray-600 hover:border-gray-400"
              }`}
            >
              Contractor
            </button>
          </div>

          <div className="relative mt-1.5">
            <div className="flex gap-1.5">
              <input
                type="text"
                value={eventWorkerId ? workerOptions.find((w) => w.id === eventWorkerId)?.displayName ?? "" : eventWorkerQuery}
                onChange={(e) => {
                  setEventWorkerQuery(e.target.value);
                  setEventWorkerId("");
                  setEventWorkerWarning(null);
                }}
                placeholder={eventWorkerType === "employee" ? "Search workers..." : "Search contractors..."}
                className="w-full rounded border border-gray-300 bg-white px-1.5 py-1 text-xs text-gray-900 placeholder-gray-400 focus:border-pink-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => handleEventAddWorker(k, p.id)}
                disabled={eventAddingWorker}
                className="shrink-0 rounded bg-gray-700 px-2 py-1 text-[10px] font-medium text-white hover:bg-gray-600 disabled:opacity-50"
              >
                {eventAddingWorker ? "Adding…" : "Add"}
              </button>
            </div>
            {eventWorkerQuery && !eventWorkerId ? (
              <div className="absolute z-10 mt-1 max-h-32 w-full overflow-auto rounded border border-gray-200 bg-white shadow-sm">
                {filteredWorkerOptions.slice(0, 8).map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => {
                      setEventWorkerId(w.id);
                      setEventWorkerQuery(w.displayName);
                      setEventWorkerWarning(null);
                    }}
                    className="block w-full truncate px-1.5 py-1 text-left text-[11px] text-gray-700 hover:bg-pink-50"
                  >
                    {w.displayName}
                  </button>
                ))}
                {filteredWorkerOptions.length === 0 ? (
                  <div className="px-1.5 py-1 text-[11px] text-gray-400">No matches</div>
                ) : null}
              </div>
            ) : null}
          </div>

          {eventWorkerWarning ? (
            <div className="mt-1.5 rounded border border-amber-300 bg-amber-50 p-1.5 text-[10px] text-amber-800">
              <p>⚠ {eventWorkerWarning}</p>
              <button
                type="button"
                onClick={() => handleEventAddWorker(k, p.id, true)}
                className="mt-1 font-semibold underline hover:no-underline"
              >
                Add anyway
              </button>
            </div>
          ) : null}
          {eventWorkerError ? <p className="mt-1 text-[10px] text-red-500">{eventWorkerError}</p> : null}
        </div>
        </div>
      </div>,
      document.body,
    );
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

  // Gantt only shows active, post-construction projects. On hold / complete
  // / archived jobs don't need a place on the timeline, and janitorial/real
  // estate/other segments have their own workflows that don't fit a
  // start-to-end bar.
  const allGanttWindows = useMemo(
    () =>
      projects
        .filter((p) => p.status === "ACTIVE" && calendarSegmentGroup(p.segment) === "POST_CONSTRUCTION")
        .map((p) => ({ p, ...projectWindow(p) })),
    [projects],
  );

  const [ganttSearch, setGanttSearch] = useState("");

  // Ongoing (today falls within its start/end window) first, then by start
  // date, so what's actually being worked on right now is always at the
  // top rather than wherever it happened to fall in the project list.
  const windows = useMemo(() => {
    const query = ganttSearch.trim();
    const matched = query
      ? allGanttWindows.filter((w) => matchesSearchQuery(w.p.jobTitle, query))
      : allGanttWindows;
    const isOngoing = (w: (typeof allGanttWindows)[number]) => w.start <= todayDate && w.end >= todayDate;
    return matched.slice().sort((a, b) => {
      const rankDiff = (isOngoing(a) ? 0 : 1) - (isOngoing(b) ? 0 : 1);
      if (rankDiff !== 0) return rankDiff;
      return a.start.getTime() - b.start.getTime();
    });
  }, [allGanttWindows, ganttSearch, todayDate]);

  // Kept on allGanttWindows (not the search-filtered windows) so the
  // timeline's scale/columns stay put while searching, only the rows change.
  const ganttRange = useMemo(() => {
    if (allGanttWindows.length === 0) {
      return { start: addDays(todayDate, -7), end: addDays(todayDate, 60) };
    }
    let min = allGanttWindows[0]!.start;
    let max = allGanttWindows[0]!.end;
    for (const w of allGanttWindows) {
      if (w.start < min) min = w.start;
      if (w.end > max) max = w.end;
    }
    return { start: addDays(min, -7), end: addDays(max, 14) };
  }, [allGanttWindows, todayDate]);

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

  const sovRequestsByDay = useMemo(() => {
    const map = new Map<string, ScheduleSovRequest[]>();
    for (const r of sovRequests) {
      for (const k of r.workDayKeys) {
        const list = map.get(k) ?? [];
        list.push(r);
        map.set(k, list);
      }
    }
    return map;
  }, [sovRequests]);

  // Projects starting (or ending) today or later that have never had a
  // supervisor assigned and have no logged work yet — otherwise these are
  // invisible on the calendar until someone happens to notice and assign a
  // supervisor. Anchored to the project's own start/end dates since there's
  // no day assignment or labor log to place them by. Shown on both the start
  // and end day when they differ (any day in between needs an explicit day
  // assignment to appear) — a project with matching start/end dates (or no
  // end date) only ever gets the one "start" occurrence, never doubled up.
  const needsSupervisorByDay = useMemo(() => {
    const map = new Map<string, { project: ScheduleProject; role: "start" | "end" }[]>();
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
      // projectDate/projectEndDate are stored as UTC midnight for the
      // intended calendar day (e.g. "2026-07-27T00:00:00.000Z" means July
      // 27, full stop) — slicing the ISO string directly reads that day back
      // out. Routing it through `new Date(...)` + dayKey() instead would
      // re-interpret it in the browser's local timezone, shifting it a day
      // earlier for anyone west of UTC (confirmed: shifted 7/27 to 7/26 in
      // America/New_York).
      const startK = p.projectDate.slice(0, 10);
      const endK = p.projectEndDate ? p.projectEndDate.slice(0, 10) : null;
      const occurrences: { k: string; role: "start" | "end" }[] =
        endK && endK !== startK ? [{ k: startK, role: "start" }, { k: endK, role: "end" }] : [{ k: startK, role: "start" }];
      for (const { k, role } of occurrences) {
        if (k < todayK) continue;
        const list = map.get(k) ?? [];
        list.push({ project: p, role });
        map.set(k, list);
      }
    }
    return map;
  }, [projects, supervisorOverrides, todayDate]);

  // A project's declared start/end date (projectDate/projectEndDate) with no
  // other marker on the calendar that day — no logged labor, no planned
  // day-assignment — so the date would otherwise look like it doesn't exist
  // even though the project record says it does (e.g. a project logged as
  // ending 8/4 with the last actual day-assignment on 8/3 never gets an 8/4
  // marker unless someone explicitly schedules that day). Unlike
  // needsSupervisorByDay above — a deliberately narrow actionable alert for
  // unsupervised jobs — this applies regardless of supervisor status, so it
  // skips exactly the population the alert above already marks (unsupervised
  // with zero logged work) to avoid stacking two markers on the same day.
  const projectSpanEndpointsByDay = useMemo(() => {
    const plannedDayPairs = new Set(dayAssignments.map((a) => `${a.projectId}:${a.dateKey}`));
    const map = new Map<string, { project: ScheduleProject; role: "start" | "end" }[]>();
    const todayK = dayKey(todayDate);
    for (const p of projects) {
      if (p.status === "ARCHIVED") continue;
      if (!p.projectDate) continue;
      const supervisorId = (p.id in supervisorOverrides ? supervisorOverrides[p.id] : p.supervisorUserId) ?? "";
      if (!supervisorId && p.workDayKeys.length === 0) continue;
      const workDayKeySet = new Set(p.workDayKeys);
      const startK = p.projectDate.slice(0, 10);
      const endK = p.projectEndDate ? p.projectEndDate.slice(0, 10) : null;
      const occurrences: { k: string; role: "start" | "end" }[] =
        endK && endK !== startK ? [{ k: startK, role: "start" }, { k: endK, role: "end" }] : [{ k: startK, role: "start" }];
      for (const { k, role } of occurrences) {
        if (k < todayK) continue;
        if (workDayKeySet.has(k)) continue;
        if (plannedDayPairs.has(`${p.id}:${k}`)) continue;
        const list = map.get(k) ?? [];
        list.push({ project: p, role });
        map.set(k, list);
      }
    }
    return map;
  }, [projects, dayAssignments, supervisorOverrides, todayDate]);

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
    if (dayAssignment) return dayAssignment.supervisorUserId ?? "";
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
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={ganttSearch}
        onChange={(e) => setGanttSearch(e.target.value)}
        placeholder="Search projects..."
        className="w-40 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-800 placeholder-gray-400 focus:border-pink-400 focus:outline-none"
      />
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
        {dragError ? (
          <div className="mb-2 flex items-center justify-between gap-2 rounded border border-red-300 bg-red-50 px-2.5 py-1.5 text-xs text-red-600">
            <span>{dragError}</span>
            <button type="button" onClick={() => setDragError(null)} className="shrink-0 font-semibold hover:underline">
              Dismiss
            </button>
          </div>
        ) : null}
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
                let daySovRequests = sovRequestsByDay.get(k) ?? [];
                // Unassigned by definition, so a supervisor filter can never
                // match one — hide rather than show under the wrong supervisor.
                let dayNeedsSupervisor = selectedSupervisorId ? [] : needsSupervisorByDay.get(k) ?? [];
                let dayProjectSpanEndpoints = projectSpanEndpointsByDay.get(k) ?? [];

                if (selectedSupervisorId) {
                  dayProjects = dayProjects.filter(
                    (p) => projectSupervisorOnDay(p.id, k) === selectedSupervisorId,
                  );
                  dayPlannedRaw = dayPlannedRaw.filter((a) => a.supervisorUserId === selectedSupervisorId);
                  dayChangeOrders = dayChangeOrders.filter(
                    (co) => projectSupervisorOnDay(co.projectId, k) === selectedSupervisorId,
                  );
                  daySovRequests = daySovRequests.filter(
                    (r) => projectSupervisorOnDay(r.projectId, k) === selectedSupervisorId,
                  );
                  dayProjectSpanEndpoints = dayProjectSpanEndpoints.filter(
                    (x) => projectSupervisorOnDay(x.project.id, k) === selectedSupervisorId,
                  );
                }

                dayProjects = dayProjects.filter((p) => selectedTypes.has(calendarSegmentGroup(p.segment)));
                dayChangeOrders = selectedTypes.has("CO") ? dayChangeOrders : [];
                daySovRequests = selectedTypes.has("SOV") ? daySovRequests : [];
                dayPlannedRaw = dayPlannedRaw.filter((a) => {
                  const project = projectById.get(a.projectId);
                  return project ? selectedTypes.has(calendarSegmentGroup(project.segment)) : false;
                });
                dayNeedsSupervisor = dayNeedsSupervisor.filter((x) => selectedTypes.has(calendarSegmentGroup(x.project.segment)));
                dayProjectSpanEndpoints = dayProjectSpanEndpoints.filter((x) => selectedTypes.has(calendarSegmentGroup(x.project.segment)));

                const confirmedProjectIds = new Set(dayProjects.map((p) => p.id));
                // Planned assignments are only shown when there's no confirmed
                // labor log yet for that project/day — once real work is
                // logged, the confirmed chip takes over.
                const dayPlanned = dayPlannedRaw
                  .filter((a) => !confirmedProjectIds.has(a.projectId))
                  .map((a) => ({ assignment: a, project: projectById.get(a.projectId) }))
                  .filter((x): x is { assignment: ScheduleDayAssignment; project: ScheduleProject } => !!x.project);

                return (
                  <div
                    key={`${k}-${i}`}
                    onDragOver={(e) => {
                      if (!draggingChip) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (dragOverDayKey !== k) setDragOverDayKey(k);
                    }}
                    onDragLeave={() => {
                      if (dragOverDayKey === k) setDragOverDayKey(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleDropOnDay(k);
                    }}
                    className={`relative min-h-[92px] bg-white p-1.5 text-left ${isToday ? "ring-1 ring-inset ring-pink-400 bg-pink-50/40" : ""} ${dragOverDayKey === k ? "ring-2 ring-inset ring-pink-500 bg-pink-50" : ""}`}
                  >
                  <div className={inMonth ? "" : "opacity-40"}>
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
                        {dayNeedsSupervisor.map(({ project: p, role }) => (
                          <li key={`needs-${p.id}-${role}`} className={inMonth ? "group relative" : "relative"}>
                            <button
                              type="button"
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.setData("text/plain", p.id);
                                e.dataTransfer.effectAllowed = "move";
                                setDraggingChip({ kind: "needsSupervisor", projectId: p.id, fromKey: k, jobTitle: p.jobTitle, role });
                              }}
                              onDragEnd={() => {
                                setDraggingChip(null);
                                setDragOverDayKey(null);
                              }}
                              onClick={() => openEventPopover(k, p, undefined, role)}
                              className={`w-full cursor-grab active:cursor-grabbing ${NEEDS_SUPERVISOR_CHIP_CLASS} ${projectStatusChipClass(p.status)}`}
                            >
                              <span aria-hidden>⚠</span>
                              <ProjectStatusIcon status={p.status} />
                              <span className="truncate" title={p.jobTitle}>{p.jobTitle}</span>
                            </button>
                            {inMonth ? (
                              <div className={`pointer-events-none absolute z-30 hidden w-max max-w-[220px] rounded-md bg-gray-900 px-2.5 py-1.5 text-[10px] leading-snug text-white shadow-lg group-hover:block ${tooltipPositionClass}`}>
                                <div className="font-semibold">{p.jobTitle}</div>
                                <div className="text-amber-300">
                                  {role === "end"
                                    ? isToday ? "Ends today" : "Ends this day"
                                    : isToday ? "Starts today" : "Starts this day"} — no supervisor assigned yet
                                </div>
                                <div className="mt-1 text-gray-300">Click to view or assign one</div>
                              </div>
                            ) : null}
                            {renderEventPopover(k, p)}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <ul className="mt-1 space-y-1">
                      {dayProjectSpanEndpoints.map(({ project: p, role }) => (
                        <li key={`span-${p.id}-${role}`} className={inMonth ? "group relative" : "relative"}>
                          <button
                            type="button"
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData("text/plain", p.id);
                              e.dataTransfer.effectAllowed = "move";
                              setDraggingChip({ kind: "needsSupervisor", projectId: p.id, fromKey: k, jobTitle: p.jobTitle, role });
                            }}
                            onDragEnd={() => {
                              setDraggingChip(null);
                              setDragOverDayKey(null);
                            }}
                            onClick={() => openEventPopover(k, p, undefined, role)}
                            className={`flex w-full cursor-grab items-center gap-1 truncate rounded py-0.5 pl-1.5 pr-4 text-[10px] font-medium shadow-sm transition-colors active:cursor-grabbing ${CALENDAR_GROUP_CHIP_CLASS[calendarSegmentGroup(p.segment)]} ${PLANNED_CHIP_EXTRA_CLASS} ${projectStatusChipClass(p.status)}`}
                          >
                            <ProjectStatusIcon status={p.status} />
                            <span className="truncate">{p.jobTitle}</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              handleClearProjectSpanDate(p.id, role);
                            }}
                            disabled={clearingSpanDateKey === `${p.id}:${role}`}
                            title={role === "end" ? "Clear this project's end date" : "Clear this project's start date"}
                            className="absolute right-0.5 top-1/2 -translate-y-1/2 z-20 px-0.5 text-[11px] font-bold leading-none opacity-60 hover:opacity-100 disabled:opacity-30"
                          >
                            ×
                          </button>
                          {inMonth ? (
                            <div className={`pointer-events-none absolute z-30 hidden w-max max-w-[220px] rounded-md bg-gray-900 px-2.5 py-1.5 text-[10px] leading-snug text-white shadow-lg group-hover:block ${tooltipPositionClass}`}>
                              <div className="font-semibold">{p.jobTitle}</div>
                              <div className="text-gray-300">
                                {role === "end" ? "Ends on this day" : "Starts on this day"} — not otherwise scheduled
                              </div>
                              <div className="mt-1 text-gray-300">Click to view or schedule it</div>
                            </div>
                          ) : null}
                          {renderEventPopover(k, p)}
                        </li>
                      ))}
                      {dayProjects.map((p) => {
                        const summary = p.laborByDay[k];
                        const loggedWorkers = new Set(summary?.workers ?? []);
                        const plannedWorkers = (p.plannedWorkersByDay[k] ?? []).filter((w) => !loggedWorkers.has(w));
                        return (
                          <li key={`p-${p.id}`} className={inMonth ? "group relative" : "relative"}>
                            <button
                              type="button"
                              onClick={() => openLaborPopover(k, p)}
                              className={`flex w-full items-center gap-1 truncate rounded px-1.5 py-0.5 text-[10px] font-medium shadow-sm transition-colors ${CALENDAR_GROUP_CHIP_CLASS[calendarSegmentGroup(p.segment)]} ${projectStatusChipClass(p.status)}`}
                            >
                              <ProjectStatusIcon status={p.status} />
                              <span className="truncate">{p.jobTitle}</span>
                            </button>
                            {renderLaborPopover(k, p)}
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
                      {dayPlanned.map(({ assignment, project }) => {
                        const isOverdue = !isFutureOrToday;
                        const plannedWorkers = project.plannedWorkersByDay[k] ?? [];
                        const supervisor = assignment.supervisorUserId ? supervisors.find((s) => s.id === assignment.supervisorUserId) : null;
                        const pm = !supervisor && assignment.projectManagerUserId ? projectManagers.find((p) => p.id === assignment.projectManagerUserId) : null;
                        const assignmentSovDescriptions = assignment.sovItemIds
                          .map((sovId) => project.sovItems.find((s) => s.id === sovId)?.description)
                          .filter((d): d is string => !!d);
                        const assignmentScopeLabels = assignment.scopeItems.map(turnoverScopeLabel);
                        return (
                        <li key={`plan-${assignment.id}`} className={inMonth ? "group relative" : "relative"}>
                          <button
                            type="button"
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData("text/plain", assignment.id);
                              e.dataTransfer.effectAllowed = "move";
                              setDraggingChip({ kind: "planned", projectId: project.id, assignmentId: assignment.id, fromKey: k, jobTitle: project.jobTitle });
                            }}
                            onDragEnd={() => {
                              setDraggingChip(null);
                              setDragOverDayKey(null);
                            }}
                            onClick={() => openEventPopover(k, project, assignment)}
                            className={`flex w-full cursor-grab items-center gap-1 truncate rounded py-0.5 pl-1.5 pr-4 text-[10px] font-medium shadow-sm transition-colors active:cursor-grabbing ${CALENDAR_GROUP_CHIP_CLASS[calendarSegmentGroup(project.segment)]} ${isOverdue ? OVERDUE_PLANNED_CHIP_EXTRA_CLASS : PLANNED_CHIP_EXTRA_CLASS} ${projectStatusChipClass(project.status)}`}
                          >
                            {isOverdue ? <span aria-hidden className="shrink-0 text-red-600">⚠</span> : null}
                            <ProjectStatusIcon status={project.status} />
                            <span className="truncate">{project.jobTitle}</span>
                          </button>
                          {renderEventPopover(k, project)}
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
                              {supervisor ? (
                                <div className="text-gray-300">Supervisor: {supervisor.displayName}</div>
                              ) : pm ? (
                                <div className="text-gray-300">PM: {pm.displayName}</div>
                              ) : null}
                              {plannedWorkers.length > 0 ? (
                                <div className="mt-1 text-gray-300">Planned workers: {plannedWorkers.join(", ")}</div>
                              ) : null}
                              {assignmentSovDescriptions.length > 0 ? (
                                <div className="mt-1 text-gray-300">SOV: {assignmentSovDescriptions.join(", ")}</div>
                              ) : null}
                              {assignmentScopeLabels.length > 0 ? (
                                <div className="mt-1 text-gray-300">Scope: {assignmentScopeLabels.join(", ")}</div>
                              ) : null}
                              {assignment.comment ? (
                                <div className="mt-1 text-gray-300">Note: {assignment.comment}</div>
                              ) : null}
                            </div>
                          ) : null}
                        </li>
                        );
                      })}
                      {dayChangeOrders.map((co) => {
                        const summary = co.laborByDay[k];
                        const parentProject = projectById.get(co.projectId);
                        const role: "start" | "end" | null =
                          k === co.scheduledDateKey ? "start" : k === co.scheduledEndDateKey ? "end" : null;
                        return (
                          <li key={`co-${co.id}`} className={inMonth ? "group relative" : "relative"}>
                            <button
                              type="button"
                              draggable={role !== null}
                              onDragStart={role !== null ? (e) => {
                                e.dataTransfer.setData("text/plain", co.id);
                                e.dataTransfer.effectAllowed = "move";
                                setDraggingChip({ kind: "changeOrder", projectId: co.projectId, changeOrderId: co.id, fromKey: k, jobTitle: co.title, role });
                              } : undefined}
                              onDragEnd={role !== null ? () => {
                                setDraggingChip(null);
                                setDragOverDayKey(null);
                              } : undefined}
                              onClick={() => openCoPopover(k, co)}
                              className={`flex w-full items-center gap-1 truncate rounded px-1.5 py-0.5 text-[10px] font-medium shadow-sm transition-colors ${role !== null ? "cursor-grab active:cursor-grabbing" : ""} ${CHANGE_ORDER_CHIP_CLASS}`}
                            >
                              <span className="truncate">{co.title}</span>
                            </button>
                            {renderCoPopover(k, co)}
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
                                {role === "start" ? (
                                  <div className="mt-1 text-gray-300">Starts this day — drag to reschedule</div>
                                ) : role === "end" ? (
                                  <div className="mt-1 text-gray-300">Ends this day — drag to reschedule</div>
                                ) : (
                                  <div className="mt-1 text-gray-300">Planned or logged for this day, not draggable</div>
                                )}
                              </div>
                            ) : null}
                          </li>
                        );
                      })}
                      {daySovRequests.map((r) => {
                        const parentProject = projectById.get(r.projectId);
                        return (
                          <li key={`sov-${r.id}`} className={inMonth ? "group relative" : "relative"}>
                            <Link
                              href={`/erp/projects/${r.projectId}`}
                              className={`flex items-center gap-1 truncate rounded px-1.5 py-0.5 text-[10px] font-medium shadow-sm transition-colors ${SOV_REQUEST_CHIP_CLASS}`}
                            >
                              <span className="truncate">{r.title}</span>
                            </Link>
                            {inMonth ? (
                              <div className={`pointer-events-none absolute z-30 hidden w-max max-w-[220px] rounded-md bg-gray-900 px-2.5 py-1.5 text-[10px] leading-snug text-white shadow-lg group-hover:block ${tooltipPositionClass}`}>
                                <div className="font-semibold">{r.title}</div>
                                <div className="text-gray-300">{SOV_REQUEST_LABEL}</div>
                                {parentProject ? <div className="text-gray-300">Project: {parentProject.jobTitle}</div> : null}
                                <div className="text-gray-300">Requested by: {r.requestedBy}</div>
                              </div>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        {presentGroups.length > 0 || changeOrders.length > 0 || sovRequests.length > 0 ? (
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
            {sovRequests.length > 0 ? (
              <div className="flex items-center gap-1.5 text-[11px] text-gray-600">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${SOV_REQUEST_SWATCH_CLASS}`} />
                {SOV_REQUEST_LABEL}
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
                <span aria-hidden className="text-red-600">⚠</span> = scheduled but never logged
              </div>
            ) : null}
            {needsSupervisorByDay.size > 0 ? (
              <div className="flex items-center gap-1.5 text-[11px] text-gray-600">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm border-2 border-amber-600 bg-amber-400" />
                ⚠ = starting soon, needs a supervisor
              </div>
            ) : null}
            {presentGroups.length > 0 ? (
              <div className="flex items-center gap-1.5 text-[11px] text-gray-600">
                <span aria-hidden>⚙</span>
                <span aria-hidden className="text-emerald-700">✓</span>
                = in progress vs. complete (faded)
              </div>
            ) : null}
          </div>
        ) : null}
      </CollapsibleSection>

      <CollapsibleSection
        title="Gantt"
        description="Bars use start / end dates; without an end date a 20-day window is assumed."
        headerExtra={allGanttWindows.length > 0 ? ganttNav : undefined}
      >
        {allGanttWindows.length === 0 ? (
          <p className="text-sm text-gray-500">No projects yet. Create one in Projects → New project.</p>
        ) : windows.length === 0 ? (
          <p className="text-sm text-gray-500">No projects match your search.</p>
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
                    <Link href={`/erp/projects/${p.id}`} className="truncate font-medium text-pink-600 hover:underline" title={p.jobTitle}>
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
          projectManagers={projectManagers}
          employees={employees}
          contractors={contractors}
          existingWorkers={workerAssignments.filter((a) => a.dateKey === openDayKey)}
          initialProjectId={openDayInitialProjectId ?? undefined}
          onClose={() => {
            setOpenDayKey(null);
            setOpenDayInitialProjectId(null);
          }}
          onCreated={(a) => {
            setDayAssignments((prev) => [...prev.filter((x) => x.id !== a.id), a]);
            // Assigning a supervisor here also sets the project's supervisor
            // server-side, mirror that in the Gantt's inline dropdown right
            // away. Skipped for a PM-only assignment, that never touches the
            // project's supervisor field (see the day-assignments route).
            if (a.supervisorUserId) setSupervisorOverrides((o) => ({ ...o, [a.projectId]: a.supervisorUserId }));
          }}
          onSeriesCreated={(created) => {
            setDayAssignments((prev) => [...prev.filter((x) => !created.some((a) => a.id === x.id)), ...created]);
            const last = created[created.length - 1];
            if (last?.supervisorUserId) setSupervisorOverrides((o) => ({ ...o, [last.projectId]: last.supervisorUserId }));
          }}
          onSeriesDeleted={(seriesId) => {
            setDayAssignments((prev) => prev.filter((a) => a.seriesId !== seriesId));
            setWorkerAssignments((prev) => prev.filter((a) => a.seriesId !== seriesId));
          }}
          onWorkerCreated={(a) => setWorkerAssignments((prev) => [...prev.filter((x) => x.id !== a.id), a])}
          onWorkerSeriesCreated={(created) =>
            setWorkerAssignments((prev) => [...prev.filter((x) => !created.some((a) => a.id === x.id)), ...created])
          }
          onWorkerDeleted={(id) => setWorkerAssignments((prev) => prev.filter((a) => a.id !== id))}
        />
      ) : null}
    </div>
  );
}
