"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CollapsibleSection } from "./CollapsibleSection";
import { CoDayPopover } from "./CoDayPopover";
import { DayAssignmentModal } from "./DayAssignmentModal";
import { MiniCalendarPicker, dayAfter } from "./MiniCalendarPicker";
import { SearchableSelect } from "@/app/erp/components/SearchableSelect";
import { useConfirm } from "@/app/erp/components/ui";
import {
  addDays,
  coIsComplete,
  computeProjectSpanMarkersByDay,
  dayCellLabel,
  dayKey,
  formatHours,
  formatShortDate,
  matchesSearchQuery,
  monthLabel,
  monthMatrix,
  projectWindow,
  startOfDay,
  startOfMonth,
  type ScheduleChangeOrder,
  type ScheduleCoDayAssignment,
  type ScheduleCoWorkerAssignment,
  type ScheduleDayAssignment,
  type ScheduleProject,
  type ScheduleSovRequest,
  type ScheduleWorkerAssignment,
} from "@/lib/erp/schedule";
import { todayEasternAsUtcMidnight } from "@/lib/erp/dates";
import { SHIFT_RESPONSE_ENABLED } from "@/lib/erp/shiftResponseFlag";
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
      return "bg-gray-600/90 hover:bg-gray-500";
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

const SOV_REQUEST_LABEL = "SOV schedule request";

// Dashed border marks a chip as "planned" (a supervisor was assigned ahead
// of time via ProjectDayAssignment) as opposed to "confirmed" (an actual
// LaborEntry was logged for that project on that day). Red instead of gray
// once that day has passed with no log — it's a missed assignment, not just
// an upcoming plan.
const PLANNED_CHIP_EXTRA_CLASS = "border border-dashed border-gray-500";
const OVERDUE_PLANNED_CHIP_EXTRA_CLASS = "border-2 border-dashed border-red-500";
// Whole-chip yellow, same as NEEDS_SUPERVISOR_CHIP_CLASS below, just dashed
// instead of solid-bordered since this is still a "planned, not logged"
// chip. Replaces the project-type background entirely (rather than layering
// on top of it) so it reads as unmistakably yellow, not fighting the
// segment color for which utility class wins.
const NO_SUPERVISOR_PLANNED_CHIP_CLASS =
  "border-2 border-dashed border-amber-600 bg-amber-400 text-amber-950 hover:bg-amber-300";

// A "Schedule SOV Work" portal request has no supervisorUserId field at
// all, so it's always in a "needs a supervisor assigned" state, same as a
// no-supervisor planned chip above — but it used to share that chip's exact
// amber color too, which made an unassigned portal request look identical
// to an unassigned planned project on the calendar (both amber, both
// dashed). Cyan instead of amber keeps the same "planned, not logged" dashed
// border, but makes it unmistakable at a glance which one you're looking
// at, without having to open it.
const SOV_REQUEST_CHIP_CLASS =
  "border-2 border-dashed border-cyan-600 bg-cyan-200 text-cyan-950 hover:bg-cyan-300";
const SOV_REQUEST_SWATCH_CLASS = "border-2 border-cyan-600 bg-cyan-200";

// A project with a future (or today's) start date that has never had a
// supervisor assigned and has no logged work at all — solid, loud, and
// rendered above everything else in the cell so it can't be missed or
// buried behind "+N more" the way a low-priority item could be.
const NEEDS_SUPERVISOR_CHIP_CLASS =
  "flex items-center gap-1 truncate rounded border-2 border-amber-600 bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-amber-950 shadow transition-colors hover:bg-amber-300";

// WIP-vs-complete marker shown on every calendar chip for a project or change
// order, regardless of which day/occurrence it's rendered on — a project (or
// CO) scheduled both Monday and Wednesday reads its status off the same live
// record either day, so marking it complete updates every chip for it at
// once, not just the day it was completed on. Complete chips also fade
// slightly (a glance at a busy day tells done from still-in-progress at a
// glance). Takes a plain boolean rather than the raw status string since
// Project uses "COMPLETE" and ProjectChangeOrder uses "COMPLETED" — callers
// normalize their own enum before passing this down.
function CompletionStatusIcon({ complete }: { complete: boolean }) {
  return complete ? (
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

function completionChipClass(complete: boolean): string {
  return complete ? "opacity-60" : "";
}

// Accept/decline status, shown as a small traffic-light dot next to a
// person's name — in the event popover's crew list and the hover tooltip's
// "Supervisor: {name}" line, never on the compact calendar chip itself (that
// used to carry a ring + icon, which read as too much noise on a chip
// that's already busy — see git history). Green/yellow/red maps directly to
// ACCEPTED/PENDING/DECLINED, no separate "overdue" color — once someone
// opens the card they can see the date themselves and judge urgency.
function ResponseDot({ status }: { status: string }) {
  if (!SHIFT_RESPONSE_ENABLED) return null;
  const color = status === "ACCEPTED" ? "bg-emerald-500" : status === "DECLINED" ? "bg-red-500" : "bg-amber-400";
  const label = status === "ACCEPTED" ? "Confirmed" : status === "DECLINED" ? "Declined" : "Hasn't responded yet";
  return <span aria-hidden title={label} className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${color}`} />;
}

// Muted, pastel-ish colors keyed by calendar group — used for the
// month-calendar chips, which need to read as a scannable legend rather than
// compete for attention the way the status-colored Gantt bars do.
const CALENDAR_GROUP_CHIP_CLASS: Record<CalendarSegmentGroup, string> = {
  POST_CONSTRUCTION: "bg-purple-200 text-purple-900 hover:bg-purple-300",
  JANITORIAL_TURNOVER_REQUESTS: "bg-green-200 text-green-900 hover:bg-green-300",
  REAL_ESTATE: "bg-pink-200 text-pink-900 hover:bg-pink-300",
  OTHER: "bg-gray-200 text-gray-800 hover:bg-gray-300",
};

const CALENDAR_GROUP_SWATCH_CLASS: Record<CalendarSegmentGroup, string> = {
  POST_CONSTRUCTION: "bg-purple-200",
  JANITORIAL_TURNOVER_REQUESTS: "bg-green-200",
  REAL_ESTATE: "bg-pink-200",
  OTHER: "bg-gray-200",
};

// Restricts the scope picker to what was actually contracted for the unit
// (e.g. only "Clean"/"Paint" if that's all it has), then drops anything
// already marked complete, a finished item can't go back on the calendar.
// Falls back to every category when there's no linked TurnoverRequest to
// restrict against.
function availableScopeOptionsFor(p: ScheduleProject) {
  return (
    p.contractedScopeItems
      ? TURNOVER_SCOPE_OPTIONS.filter((opt) => p.contractedScopeItems!.includes(opt.value))
      : TURNOVER_SCOPE_OPTIONS
  ).filter((opt) => !p.completedScopeItems.includes(opt.value));
}

/** The specific things a single crew member on this day could be split
 * onto — an SOV item for Post-Construction, a turnover scope category for
 * Janitorial — mirroring whichever picks are currently set for the day
 * itself (eventSovPicks/eventScopePicks). Empty when the day has zero or
 * one thing picked: nothing to split a crew across yet, so callers use
 * this to decide whether a per-worker picker is worth showing at all —
 * with only one scope on the day, everyone added is on it by default. */
function dayScopeSplitOptions(
  p: ScheduleProject,
  sovPicks: string[],
  scopePicks: string[]
): { id: string; label: string }[] {
  const group = calendarSegmentGroup(p.segment);
  if (group === "POST_CONSTRUCTION") {
    return sovPicks
      .map((id) => p.sovItems.find((s) => s.id === id))
      .filter((s): s is ScheduleProject["sovItems"][number] => !!s)
      .map((s) => ({ id: s.id, label: s.description }));
  }
  if (group === "JANITORIAL_TURNOVER_REQUESTS") {
    return scopePicks.map((v) => ({ id: v, label: turnoverScopeLabel(v) }));
  }
  return [];
}

// Same-building turnover units sharing a calendar day collapse into one
// expandable chip (see the building-group rendering in SchedulePlanner)
// instead of stacking one chip per unit. Only turnover-segment projects with
// a linked TurnoverRequest (and therefore a buildingId) are ever groupable —
// legacy turnover rows with no TurnoverRequest (e.g. a monthly-contract
// project) always render as their own ungrouped chip.
function isGroupableTurnoverProject(p: ScheduleProject): boolean {
  return p.segment === "JANITORIAL_TURNOVER_REQUESTS" && !!p.buildingId;
}

/** "Building Name - Unit 204" → "Unit 204" — every turnover unit's jobTitle
 * follows that "{building} - {unit}" convention (see createProject.ts /
 * recurringContracts.ts), so once a building-group chip already headlines
 * the building name, repeating it on every nested unit chip is redundant.
 * Falls back to the full jobTitle for anything that doesn't match (legacy
 * rows, a building name that's since changed, etc.) rather than mangling it. */
function unitLabelForGroupedChip(p: ScheduleProject): string {
  if (p.buildingName && p.jobTitle.startsWith(`${p.buildingName} - `)) {
    return p.jobTitle.slice(p.buildingName.length + 3);
  }
  return p.jobTitle;
}

/** One turnover unit's chip state for a single calendar day, tagged with
 * whichever of the four existing chip "buckets" it belongs to (plus that
 * bucket's own extras, e.g. role/assignment) — used only to group same-
 * building units together; actual rendering still goes through the same
 * render*Chip functions used for ungrouped chips, so a unit looks and
 * behaves identically whether or not its building happens to collapse. */
type TurnoverEntry =
  | { kind: "needsSupervisor"; project: ScheduleProject; role: "start" | "end" }
  | { kind: "spanEndpoint"; project: ScheduleProject; role: "start" | "end" }
  | { kind: "confirmed"; project: ScheduleProject }
  | { kind: "planned"; assignment: ScheduleDayAssignment; project: ScheduleProject }
  /// A unit with no chip of its own today (see orphanedJanitorialUnits),
  /// only a change order scheduled this day — still counts toward its
  /// building's group so the CO shows up under the building dropdown even
  /// when the unit itself isn't otherwise on the schedule.
  | { kind: "coOnly"; project: ScheduleProject };

function formatClockTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h! >= 12 ? "PM" : "AM";
  const hour12 = h! % 12 === 0 ? 12 : h! % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

// "CO" (ProjectChangeOrder, blue) and "SOV" (ProjectSovScheduleRequest, amber,
// same as any other no-supervisor-assigned chip) aren't project segments,
// they're layered on top as their own filterable types alongside the
// segment-based groups.
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

type Person = { id: string; displayName: string };
/** Employees/contractors specifically — unlike a supervisor/PM (always an
 * ErpUser, always has an email), a crew member's email is optional, and
 * that's the one thing that gates whether they get a schedule invite at
 * all. Null surfaces a "no email on file" note wherever they're picked. */
type WorkerPerson = Person & { email: string | null };

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
            responseStatus: "PENDING",
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
              responseStatus: "PENDING",
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
            <div className="text-[9px] text-gray-400">
              Supervisor (needed to duplicate)
              <SearchableSelect
                value={fallbackSupervisorId}
                onChange={setFallbackSupervisorId}
                options={supervisors.map((s) => ({ value: s.id, label: s.displayName }))}
                placeholder="Search…"
                allLabel="— None —"
                className="mt-0.5"
              />
            </div>
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
  initialCoDayAssignments,
  initialCoWorkerAssignments,
}: {
  projects: ScheduleProject[];
  supervisors: Person[];
  projectManagers: Person[];
  changeOrders: ScheduleChangeOrder[];
  sovRequests: ScheduleSovRequest[];
  initialDayAssignments: ScheduleDayAssignment[];
  canFilterBySupervisor: boolean;
  employees: WorkerPerson[];
  contractors: WorkerPerson[];
  initialWorkerAssignments: ScheduleWorkerAssignment[];
  initialCoDayAssignments: ScheduleCoDayAssignment[];
  initialCoWorkerAssignments: ScheduleCoWorkerAssignment[];
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

  // Flattened CO list for the "+" day-assignment modal's change-order picker
  // — title plus its parent project's name, since two COs on different jobs
  // can easily share a title like "Change order 1".
  const changeOrderOptions = useMemo(
    () =>
      changeOrders.map((co) => ({
        id: co.id,
        title: co.title,
        projectId: co.projectId,
        projectTitle: projectById.get(co.projectId)?.jobTitle ?? "",
      })),
    [changeOrders, projectById],
  );

  // Deep link from elsewhere (e.g. the schedule-nudge popup's "Schedule it"
  // link) — ?scheduleProjectId=<id> opens today's assign-a-supervisor modal
  // pre-filled with that project, instead of landing on the bare calendar.
  const router = useRouter();
  const confirm = useConfirm();
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

  // Same two local-state pairs as above, but scoped directly to change
  // orders (ChangeOrderDayAssignment / ChangeOrderWorkerDayAssignment)
  // instead of the parent project — lets a CO be planned and staffed on its
  // own, see CoDayPopover.
  const [coDayAssignments, setCoDayAssignments] = useState(initialCoDayAssignments);
  const [coWorkerAssignments, setCoWorkerAssignments] = useState(initialCoWorkerAssignments);

  // Legacy ProjectSovScheduleRequest chips. The portal's "Schedule SOV Work"
  // flow now creates a real ProjectDayAssignment instead (see the API route),
  // so this only ever holds rows from before that change. Local state so
  // deleting one of these leftovers reflects immediately.
  const [sovRequestRows, setSovRequestRows] = useState(sovRequests);
  const [deletingSovRequestId, setDeletingSovRequestId] = useState<string | null>(null);

  async function handleDeleteSovRequest(id: string) {
    setDeletingSovRequestId(id);
    const previous = sovRequestRows;
    setSovRequestRows((prev) => prev.filter((r) => r.id !== id));
    try {
      const res = await fetch(`/api/erp/schedule/sov-requests/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to remove");
    } catch {
      setSovRequestRows(previous);
    } finally {
      setDeletingSovRequestId(null);
    }
  }

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
  // computeProjectSpanMarkersByDay in lib/erp/schedule.ts), it's just
  // projectDate/projectEndDate
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
  // Which scope this next worker covers, when the day has more than one
  // (see dayScopeSplitOptions) — a required pick in that case, ignored
  // otherwise (everyone's on the day's one-and-only scope by default).
  const [eventWorkerScopePick, setEventWorkerScopePick] = useState("");
  const [eventAddingWorker, setEventAddingWorker] = useState(false);
  const [eventWorkerError, setEventWorkerError] = useState("");
  // A worker legitimately can split a day across two jobs, so this is a
  // soft warning shown before the request fires, not a hard block.
  const [eventWorkerWarning, setEventWorkerWarning] = useState<string | null>(null);
  const [deletingEventWorkerId, setDeletingEventWorkerId] = useState<string | null>(null);
  // A worker's scope reassignment (via the dropdown next to their name in
  // the crew list) in flight, so its own row can show a "saving" state.
  const [reassigningWorkerId, setReassigningWorkerId] = useState<string | null>(null);
  // "Apply crew to other units in this building" bulk action — in flight +
  // its own result message, separate from eventWorkerError since it isn't
  // about the single-worker add form right below it.
  const [applyingCrewToBuilding, setApplyingCrewToBuilding] = useState(false);
  const [applyCrewResult, setApplyCrewResult] = useState<{ ok: boolean; msg: string } | null>(null);

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
    setEventWorkerScopePick("");
    setEventWorkerError("");
    setEventWorkerWarning(null);
    setApplyCrewResult(null);
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
              assignedSovItemId: w.assignedSovItemId,
              assignedScopeItem: w.assignedScopeItem,
            }),
          });
          const wData = (await wRes.json().catch(() => ({}))) as { id?: string };
          if (wRes.ok && wData.id) {
            newWorkers.push({
              id: wData.id,
              projectId,
              employeeId: w.employeeId,
              contractorId: w.contractorId,
              dateKey: toK,
              seriesId: null,
              assignedSovItemId: w.assignedSovItemId,
              assignedScopeItem: w.assignedScopeItem,
              // A new row on the new day, same as the server creates —
              // fresh PENDING, not a carry-over of the old day's response.
              responseStatus: "PENDING",
            });
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
          // A same-day edit (time/scope only) keeps whatever the supervisor
          // already answered; moving to a different day is a fresh row
          // server-side, so it starts PENDING again like any new one does.
          responseStatus: dateChanged ? "PENDING" : existingAssignment.responseStatus,
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

  // Same idea as movePlannedAssignment above, but for a CO's own planned
  // day (ChangeOrderDayAssignment) — drag-and-drop on a mid-span day that
  // isn't the CO's start/end date (those move ProjectChangeOrder.startDate/
  // endDate instead, see handleDropOnDay's "changeOrder" branch).
  async function moveCoPlannedAssignment(
    changeOrderId: string,
    assignmentId: string,
    fromK: string,
    toK: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const existingAssignment = coDayAssignments.find((a) => a.id === assignmentId);
    if (!existingAssignment) return { ok: false, error: "Assignment not found" };
    try {
      const dayRes = await fetch("/api/erp/schedule/co-day-assignments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          changeOrderId,
          date: toK,
          supervisorUserId: existingAssignment.supervisorUserId || undefined,
          projectManagerUserId: existingAssignment.projectManagerUserId || undefined,
          startTime: existingAssignment.startTime || undefined,
          endTime: existingAssignment.endTime || undefined,
          comment: existingAssignment.comment || undefined,
        }),
      });
      const dayData = (await dayRes.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!dayRes.ok || !dayData.id) return { ok: false, error: dayData.error || "Failed to save" };

      // Carry any planned workers on the old day over to the new one, same
      // migrate-then-delete-old-row dance movePlannedAssignment does.
      const oldWorkers = coWorkerAssignments.filter((w) => w.dateKey === fromK && w.changeOrderId === changeOrderId);
      const newWorkers: ScheduleCoWorkerAssignment[] = [];
      for (const w of oldWorkers) {
        const wRes = await fetch("/api/erp/schedule/co-worker-assignments", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            changeOrderId,
            employeeId: w.employeeId || undefined,
            contractorId: w.contractorId || undefined,
            date: toK,
          }),
        });
        const wData = (await wRes.json().catch(() => ({}))) as { id?: string };
        if (wRes.ok && wData.id) {
          newWorkers.push({ id: wData.id, changeOrderId, employeeId: w.employeeId, contractorId: w.contractorId, dateKey: toK });
        }
      }
      await fetch(`/api/erp/schedule/co-day-assignments/${assignmentId}`, { method: "DELETE" });

      setCoDayAssignments((prev) => [
        ...prev.filter((a) => a.id !== assignmentId && a.id !== dayData.id),
        {
          id: dayData.id!,
          changeOrderId,
          dateKey: toK,
          supervisorUserId: existingAssignment.supervisorUserId,
          projectManagerUserId: existingAssignment.projectManagerUserId,
          startTime: existingAssignment.startTime,
          endTime: existingAssignment.endTime,
          comment: existingAssignment.comment,
        },
      ]);
      setCoWorkerAssignments((prev) => [
        ...prev.filter((w) => !(w.dateKey === fromK && w.changeOrderId === changeOrderId)),
        ...newWorkers,
      ]);
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
    | { kind: "coPlanned"; changeOrderId: string; assignmentId: string; fromKey: string; jobTitle: string }
    | null
  >(null);
  const [dragOverDayKey, setDragOverDayKey] = useState<string | null>(null);
  const [dragError, setDragError] = useState<string | null>(null);

  // Same-building turnover units sharing a day collapse into one expandable
  // chip (see building-group rendering below) — keyed `${dayKey}:${buildingId}`
  // so each day/building's expand state is independent and resets on
  // navigation/reload like every other calendar interaction here.
  const [expandedBuildingGroups, setExpandedBuildingGroups] = useState<Set<string>>(new Set());
  function toggleBuildingGroup(groupKey: string) {
    setExpandedBuildingGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  }

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
    if (chip.kind === "coPlanned") {
      const result = await moveCoPlannedAssignment(chip.changeOrderId, chip.assignmentId, chip.fromKey, toKey);
      if (!result.ok) setDragError(`Couldn't move "${chip.jobTitle}" — ${result.error ?? "try again"}`);
      // dayAssignments/coDayAssignments update optimistically above, but a
      // change order attached to a project's own planned day (see
      // ProjectDayAssignment.changeOrders in page.tsx) is keyed off the
      // `changeOrders` prop's workDayKeys, which is server-computed and
      // never touched by local state — without this, a CO nested under a
      // moved unit went stale (still shown on the old day, or missing
      // entirely from the new one) until the next full reload.
      else router.refresh();
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
    // Same reason as the coPlanned branch above — resyncs `changeOrders` so
    // any CO attached to this unit's day (via its changeOrderIds) reflects
    // the new day instead of the one it just left.
    else router.refresh();
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
    // What was actually worked on this day, straight off the labor log
    // itself rather than what was planned — the union of every entry's SOV
    // items (Post-Construction) and/or task description (everything else,
    // including turnover scope categories, see ProjectLaborSection).
    const loggedScopes = [...new Set(entries.flatMap((e) => [...e.sovItemDescriptions, ...(e.taskDescription ? [e.taskDescription] : [])]))];
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

          {loggedScopes.length > 0 ? (
            <div className="mt-3 border-t border-gray-100 pt-2.5">
              <label className="block text-[10px] font-medium text-gray-500">Scope worked (from the labor log)</label>
              <div className="mt-1 flex flex-wrap gap-1">
                {loggedScopes.map((s) => (
                  <span key={s} className="rounded-full bg-pink-100 px-2 py-0.5 text-[10px] font-medium text-pink-700">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-3 border-t border-gray-100 pt-2.5">
            <div className="flex items-center justify-between">
              <label className="block text-[10px] font-medium text-gray-500">Logged labor</label>
              <span className="text-[10px] font-semibold text-gray-700">{formatHours(totalHours)} total</span>
            </div>
            {entries.length > 0 ? (
              <ul className="mt-1.5 space-y-1">
                {entries.map((e, i) => {
                  const scopeLabel = e.sovItemDescriptions.length > 0 ? e.sovItemDescriptions.join(", ") : e.taskDescription;
                  return (
                    <li
                      key={`${e.workerName}-${i}`}
                      className="rounded border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] text-gray-700"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium">{e.workerName}</span>
                        <span className="shrink-0 text-gray-500">
                          {e.contractorOnly ? (
                            <span title="Contractor engagement — no shift-level hours logged">Confirmed</span>
                          ) : (
                            <>
                              {formatHours(e.hours)}
                              {e.clockIn ? <span className="text-gray-400"> · started {formatClockTime(e.clockIn)}</span> : null}
                            </>
                          )}
                        </span>
                      </div>
                      {scopeLabel ? <div className="mt-0.5 truncate text-gray-500">{scopeLabel}</div> : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-1.5 text-[10px] text-gray-400">No labor entries found for this day.</p>
            )}
          </div>

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

          {eventError ? <p className="mt-1.5 text-[10px] text-red-500">{eventError}</p> : null}

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
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
            {p.status !== "COMPLETE" ? (
              <button
                type="button"
                onClick={() => void handleMarkComplete(p.id, p.jobTitle, k)}
                disabled={eventSaving}
                className="rounded border border-emerald-600 px-2 py-1 text-[10px] font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
              >
                {eventSaving ? "Saving…" : "Mark complete"}
              </button>
            ) : null}
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  // Change-order detail card — like the read-only labor card above, but
  // editable: a CO can be planned (supervisor/PM/time/comment + crew)
  // directly against itself here, same capability the project event
  // popover has. See CoDayPopover.
  const [coPopoverKey, setCoPopoverKey] = useState<string | null>(null);

  function openCoPopover(k: string, co: ScheduleChangeOrder) {
    setCoPopoverKey(`${k}:${co.id}`);
  }

  function renderCoPopover(k: string, co: ScheduleChangeOrder) {
    if (coPopoverKey !== `${k}:${co.id}`) return null;
    const parentProject = projectById.get(co.projectId);
    const assignment = coDayAssignments.find((a) => a.dateKey === k && a.changeOrderId === co.id);
    const workersForDay = coWorkerAssignments.filter((w) => w.dateKey === k && w.changeOrderId === co.id);
    return (
      <CoDayPopover
        co={co}
        dateKey={k}
        parentProjectTitle={parentProject?.jobTitle}
        assignment={assignment}
        workersForDay={workersForDay}
        supervisors={supervisors}
        projectManagers={projectManagers}
        employees={employees}
        contractors={contractors}
        onClose={() => setCoPopoverKey(null)}
        onAssignmentSaved={(a) => {
          setCoDayAssignments((prev) => [...prev.filter((x) => x.id !== a.id), a]);
          if (a.supervisorUserId) setCoSupervisorOverrides((o) => ({ ...o, [a.changeOrderId]: a.supervisorUserId }));
        }}
        onAssignmentDeleted={(id) => {
          setCoDayAssignments((prev) => prev.filter((a) => a.id !== id));
          setCoSupervisorOverrides((o) => ({ ...o, [co.id]: null }));
        }}
        onWorkerCreated={(w) => setCoWorkerAssignments((prev) => [...prev.filter((x) => x.id !== w.id), w])}
        onWorkerDeleted={(id) => setCoWorkerAssignments((prev) => prev.filter((w) => w.id !== id))}
      />
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
            // Editing an existing day's coverage never touches its response
            // server-side (see the day-assignments POST route) — only a
            // brand-new row starts PENDING.
            responseStatus: existing?.responseStatus ?? "PENDING",
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

  // Other turnover units in the same building that have anything scheduled
  // on day k — i.e. would show their own chip that day, reconstructed
  // directly from the underlying data rather than the day-cell's own
  // categorized lists (those are scoped to that render closure, not
  // reachable from here). Backs "Apply crew to other units in [Building]".
  function siblingTurnoverUnitIds(k: string, source: ScheduleProject): string[] {
    if (!source.buildingId) return [];
    return projects
      .filter((p) => p.id !== source.id && p.buildingId === source.buildingId && isGroupableTurnoverProject(p))
      .filter((p) => {
        const hasDayAssignment = dayAssignments.some((a) => a.projectId === p.id && a.dateKey === k);
        const hasWorker = workerAssignments.some((w) => w.projectId === p.id && w.dateKey === k);
        const hasLoggedWork = p.workDayKeys.includes(k);
        const isSpanDay = p.projectDate?.slice(0, 10) === k || p.projectEndDate?.slice(0, 10) === k;
        return hasDayAssignment || hasWorker || hasLoggedWork || isSpanDay;
      })
      .map((p) => p.id);
  }

  // Copies this unit's own crew (and supervisor/PM, if set) onto every
  // other turnover unit in the same building scheduled the same day — the
  // normal janitorial-turnover reality of one crew working across several
  // units in one building in one day, not a mistake to warn about, so this
  // deliberately skips findWorkerConflicts' "already scheduled elsewhere"
  // prompt. Each per-unit write is its own request; one unit failing (e.g.
  // a worker's PTO conflict) doesn't stop the rest — the result message
  // below reports how many actually went through.
  async function handleApplyCrewToBuilding(k: string, sourceProjectId: string) {
    const source = projectById.get(sourceProjectId);
    if (!source) return;
    const targetIds = siblingTurnoverUnitIds(k, source);
    if (targetIds.length === 0) return;

    setApplyCrewResult(null);
    setApplyingCrewToBuilding(true);
    try {
      const sourceDay = dayAssignments.find((a) => a.dateKey === k && a.projectId === sourceProjectId);
      const sourceWorkers = workerAssignments.filter((w) => w.dateKey === k && w.projectId === sourceProjectId);

      const results = await Promise.allSettled(
        targetIds.map(async (targetId) => {
          // Supervisor/PM — preserve whatever the target unit's day already
          // has (time/scope/SOV/comment), only overriding who's covering
          // it, so this can't silently wipe out that unit's own coverage
          // details the way a bare upsert with missing fields would.
          if (sourceDay?.supervisorUserId || sourceDay?.projectManagerUserId) {
            const targetDay = dayAssignments.find((a) => a.dateKey === k && a.projectId === targetId);
            const res = await fetch("/api/erp/schedule/day-assignments", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                projectId: targetId,
                date: k,
                supervisorUserId: sourceDay.supervisorUserId || undefined,
                projectManagerUserId: sourceDay.projectManagerUserId || undefined,
                startTime: targetDay?.startTime || undefined,
                endTime: targetDay?.endTime || undefined,
                sovItemIds: targetDay?.sovItemIds ?? [],
                scopeItems: targetDay?.scopeItems ?? [],
                changeOrderIds: targetDay?.changeOrderIds ?? [],
                comment: targetDay?.comment || undefined,
              }),
            });
            if (!res.ok) throw new Error("supervisor");
          }
          // Crew — same worker-assignments POST the single "Add worker" form
          // uses, one per person; already-there-on-this-unit is a no-op
          // upsert, not a duplicate.
          const workerResults = await Promise.allSettled(
            sourceWorkers.map((w) =>
              fetch("/api/erp/schedule/worker-assignments", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  projectId: targetId,
                  employeeId: w.employeeId || undefined,
                  contractorId: w.contractorId || undefined,
                  date: k,
                }),
              }).then((res) => {
                if (!res.ok) throw new Error("worker");
              })
            )
          );
          if (workerResults.some((r) => r.status === "rejected")) throw new Error("worker");
        })
      );

      const failed = results.filter((r) => r.status === "rejected").length;
      const succeeded = targetIds.length - failed;
      setApplyCrewResult(
        failed === 0
          ? { ok: true, msg: `Applied to ${succeeded} other unit${succeeded === 1 ? "" : "s"}.` }
          : { ok: false, msg: `Applied to ${succeeded} of ${targetIds.length} units — ${failed} had a conflict (e.g. time off) and were skipped.` }
      );
      router.refresh();
    } catch {
      setApplyCrewResult({ ok: false, msg: "Failed to apply crew to other units." });
    } finally {
      setApplyingCrewToBuilding(false);
    }
  }

  async function handleEventAddWorker(k: string, projectId: string, force = false) {
    setEventWorkerError("");
    if (!eventWorkerId) {
      setEventWorkerError(eventWorkerType === "employee" ? "Pick a worker" : "Pick a contractor");
      return;
    }
    // With 2+ scopes on the day (e.g. painting and cleaning both scheduled),
    // each worker needs to be tagged with which one they're covering — with
    // only one (or none), everyone added lands on it automatically, no pick
    // needed. See dayScopeSplitOptions.
    const p = projectById.get(projectId);
    const splitOptions = p ? dayScopeSplitOptions(p, eventSovPicks, eventScopePicks) : [];
    if (splitOptions.length > 1 && !eventWorkerScopePick) {
      setEventWorkerError("Pick which of today's scopes this worker is covering");
      return;
    }
    const soleOption = splitOptions.length === 1 ? splitOptions[0]!.id : null;
    const scopePick = splitOptions.length > 1 ? eventWorkerScopePick : soleOption;
    const group = p ? calendarSegmentGroup(p.segment) : null;
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
          assignedSovItemId: group === "POST_CONSTRUCTION" ? scopePick : null,
          assignedScopeItem: group === "JANITORIAL_TURNOVER_REQUESTS" ? scopePick : null,
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
            assignedSovItemId: group === "POST_CONSTRUCTION" ? scopePick : null,
            assignedScopeItem: group === "JANITORIAL_TURNOVER_REQUESTS" ? scopePick : null,
            responseStatus: "PENDING",
          },
        ]);
      }
      setEventWorkerQuery("");
      setEventWorkerId("");
      setEventWorkerScopePick("");
    } catch (err) {
      setEventWorkerError(err instanceof Error ? err.message : "Failed to add worker");
    } finally {
      setEventAddingWorker(false);
    }
  }

  // Reassigns which scope an already-added worker covers, via the dropdown
  // next to their name in the crew list — e.g. the day's scope was split
  // after the crew was already added.
  async function handleEventReassignWorkerScope(
    id: string,
    group: CalendarSegmentGroup | null,
    scopeId: string | null
  ) {
    setReassigningWorkerId(id);
    const previous = workerAssignments;
    setWorkerAssignments((prev) =>
      prev.map((a) =>
        a.id === id
          ? {
              ...a,
              assignedSovItemId: group === "POST_CONSTRUCTION" ? scopeId : a.assignedSovItemId,
              assignedScopeItem: group === "JANITORIAL_TURNOVER_REQUESTS" ? scopeId : a.assignedScopeItem,
            }
          : a
      )
    );
    try {
      const res = await fetch(`/api/erp/schedule/worker-assignments/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(group === "POST_CONSTRUCTION" ? { assignedSovItemId: scopeId } : {}),
          ...(group === "JANITORIAL_TURNOVER_REQUESTS" ? { assignedScopeItem: scopeId } : {}),
        }),
      });
      if (!res.ok) throw new Error("Failed to reassign");
    } catch {
      setWorkerAssignments(previous);
    } finally {
      setReassigningWorkerId(null);
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

  // Mark-complete from the calendar — sets the project's end date to
  // whichever day's card the user opened this popover from, and flips
  // status to COMPLETE in the same PATCH. The API route (not this handler)
  // owns the actual guards: turnover-segment projects require the quality
  // checklist finished first (unless the acting user can override it), so
  // that error comes back verbatim in `data.error` and is shown the same
  // way handleEventDatesSave's own errors are.
  async function handleMarkComplete(projectId: string, jobTitle: string, endDateKey: string) {
    if (
      !(await confirm({
        message: `Mark "${jobTitle}" complete with an end date of ${formatShortDate(endDateKey)}?`,
        danger: false,
        confirmLabel: "Mark complete",
      }))
    )
      return;
    setEventSaving(true);
    setEventError("");
    try {
      const res = await fetch(`/api/erp/projects/${projectId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectEndDate: endDateKey, status: "COMPLETE" }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setEventError(data.error || "Failed to mark complete");
        return;
      }
      // Reachable from either the date-editing popover or the read-only
      // labor popover (see renderLaborPopover's own "Mark complete" button)
      // — close whichever one is actually open.
      setEventPopoverKey(null);
      setLaborPopoverKey(null);
      router.refresh();
    } catch {
      setEventError("Failed to mark complete");
    } finally {
      setEventSaving(false);
    }
  }

  function renderEventPopover(k: string, p: ScheduleProject) {
    if (eventPopoverKey !== `${k}:${p.id}`) return null;

    const dayWorkers = workerAssignments.filter((a) => a.dateKey === k && a.projectId === p.id);
    // Only offered for turnover units with sibling units actually scheduled
    // this same day — see siblingTurnoverUnitIds/handleApplyCrewToBuilding.
    const siblingUnitIds = isGroupableTurnoverProject(p) ? siblingTurnoverUnitIds(k, p) : [];
    // Same day-specific supervisor handleApplyCrewToBuilding itself reads
    // (not currentSupervisorId(p), which is the project's own default —
    // this is the actual per-day override, if any).
    const eventDayAssignment = dayAssignments.find((a) => a.dateKey === k && a.projectId === p.id);
    const hasSupervisorThisDay = !!(eventDayAssignment?.supervisorUserId ?? eventDayAssignment?.projectManagerUserId);
    const workerOptions = eventWorkerType === "employee" ? employees : contractors;
    const filteredWorkerOptions = eventWorkerQuery.trim()
      ? workerOptions.filter((w) => matchesSearchQuery(w.displayName, eventWorkerQuery))
      : workerOptions;
    // What each crew member on this day can be split onto (SOV item or
    // turnover scope) — only meaningful once 2+ are picked for the day
    // itself, see dayScopeSplitOptions.
    const eventSplitGroup = calendarSegmentGroup(p.segment);
    const eventSplitOptions = dayScopeSplitOptions(p, eventSovPicks, eventScopePicks);

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
          {p.status !== "COMPLETE" ? (
            <button
              type="button"
              onClick={() => void handleMarkComplete(p.id, p.jobTitle, k)}
              disabled={eventSaving}
              className="rounded border border-emerald-600 px-2 py-1 text-[10px] font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
            >
              {eventSaving ? "Saving…" : "Mark complete"}
            </button>
          ) : null}
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
              <SearchableSelect
                value={eventDaySupervisorId}
                onChange={setEventDaySupervisorId}
                options={supervisors.map((s) => ({ value: s.id, label: s.displayName }))}
                placeholder="Search…"
                allLabel="— None —"
                className="mt-0.5"
              />
            </div>
            <div>
              <label className="block text-[9px] text-gray-400">PM (if no supervisor)</label>
              <SearchableSelect
                value={eventDayPmId}
                onChange={setEventDayPmId}
                options={projectManagers.map((pm) => ({ value: pm.id, label: pm.displayName }))}
                placeholder="Search…"
                allLabel="— None —"
                className="mt-0.5"
              />
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
          {eventSplitOptions.length > 1 ? (
            <p className="mt-0.5 text-[9px] text-gray-400">
              {eventSplitOptions.length} scopes on this day — tag each worker with which one they&apos;re covering.
            </p>
          ) : null}
          {dayWorkers.length > 0 ? (
            <ul className="mt-1 space-y-1">
              {dayWorkers.map((w) => {
                const worker = w.employeeId
                  ? employees.find((e) => e.id === w.employeeId)
                  : contractors.find((c) => c.id === w.contractorId);
                const assignedId =
                  eventSplitGroup === "POST_CONSTRUCTION"
                    ? w.assignedSovItemId
                    : eventSplitGroup === "JANITORIAL_TURNOVER_REQUESTS"
                    ? w.assignedScopeItem
                    : null;
                const assignedLabel = eventSplitOptions.find((o) => o.id === assignedId)?.label ?? null;
                return (
                  <li
                    key={w.id}
                    className="flex items-center justify-between gap-1.5 rounded border border-gray-200 bg-gray-50 px-1.5 py-1 text-[11px] text-gray-700"
                  >
                    <span className="flex min-w-0 items-center gap-1.5 truncate">
                      <span className="truncate">{worker?.displayName ?? "Unknown worker"}</span>
                      {worker && !worker.email ? (
                        <span className="shrink-0 text-gray-400" title="No email on file — didn't get a schedule invite">
                          (no email)
                        </span>
                      ) : (
                        <ResponseDot status={w.responseStatus} />
                      )}
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      {eventSplitOptions.length > 1 ? (
                        <select
                          value={assignedId ?? ""}
                          onChange={(e) =>
                            handleEventReassignWorkerScope(w.id, eventSplitGroup, e.target.value || null)
                          }
                          disabled={reassigningWorkerId === w.id}
                          title="Which scope this worker is covering"
                          className="max-w-[100px] rounded border border-gray-300 bg-white px-1 py-0.5 text-[9px] text-gray-700 focus:border-pink-400 focus:outline-none"
                        >
                          <option value="">— unassigned —</option>
                          {eventSplitOptions.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      ) : assignedLabel ? (
                        <span className="truncate rounded-full bg-pink-100 px-1.5 py-0.5 text-[9px] font-medium text-pink-700">
                          {assignedLabel}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => handleEventDeleteWorker(w.id)}
                        disabled={deletingEventWorkerId === w.id}
                        className="shrink-0 text-gray-400 hover:text-red-500 disabled:opacity-40"
                      >
                        ×
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-1 text-[10px] text-gray-400">None scheduled yet.</p>
          )}

          {siblingUnitIds.length > 0 ? (
            <div className="mt-1.5">
              <button
                type="button"
                onClick={() => void handleApplyCrewToBuilding(k, p.id)}
                disabled={applyingCrewToBuilding || (dayWorkers.length === 0 && !hasSupervisorThisDay)}
                title={
                  dayWorkers.length === 0 && !hasSupervisorThisDay
                    ? "Add a supervisor or crew to this unit first"
                    : undefined
                }
                className="rounded border border-pink-300 px-2 py-1 text-[10px] font-medium text-pink-700 hover:bg-pink-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {applyingCrewToBuilding
                  ? "Applying…"
                  : `Apply crew to ${siblingUnitIds.length} other unit${siblingUnitIds.length === 1 ? "" : "s"} in ${p.buildingName ?? "this building"} today`}
              </button>
              {applyCrewResult ? (
                <p className={`mt-1 text-[10px] ${applyCrewResult.ok ? "text-emerald-600" : "text-red-500"}`}>{applyCrewResult.msg}</p>
              ) : null}
            </div>
          ) : null}

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

          {eventSplitOptions.length > 1 ? (
            <select
              value={eventWorkerScopePick}
              onChange={(e) => setEventWorkerScopePick(e.target.value)}
              className="mt-1.5 w-full rounded border border-gray-300 bg-white px-1.5 py-1 text-xs text-gray-900 focus:border-pink-400 focus:outline-none"
            >
              <option value="">Covering which scope?</option>
              {eventSplitOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : null}

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
                    {!w.email ? <span className="text-gray-400"> (no email)</span> : null}
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

  // Same override pattern as supervisorOverrides above, scoped to change
  // orders — lets CoDayPopover's "needs a supervisor" alert disappear the
  // moment coverage is saved, instead of waiting on a full page refresh.
  const [coSupervisorOverrides, setCoSupervisorOverrides] = useState<Record<string, string | null>>({});

  function currentCoSupervisorId(co: ScheduleChangeOrder): string {
    return (co.id in coSupervisorOverrides ? coSupervisorOverrides[co.id] : co.supervisorUserId) ?? "";
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
    for (const r of sovRequestRows) {
      for (const k of r.workDayKeys) {
        const list = map.get(k) ?? [];
        list.push(r);
        map.set(k, list);
      }
    }
    return map;
  }, [sovRequestRows]);

  // A project's declared start/end date, on a day not otherwise covered by
  // logged work or a planned day-assignment, resolved to either a loud
  // "needs a supervisor" alert or a quiet "not otherwise scheduled" marker —
  // see computeProjectSpanMarkersByDay's own doc comment for why this is one
  // computation instead of two. Split into the two chip types below by
  // `kind`, purely so the render code and legend conditions below don't need
  // to change shape.
  const projectSpanMarkersByDay = useMemo(
    () => computeProjectSpanMarkersByDay(projects, dayAssignments, supervisorOverrides),
    [projects, dayAssignments, supervisorOverrides]
  );
  const hasNeedsSupervisorMarkers = useMemo(
    () => Array.from(projectSpanMarkersByDay.values()).some((list) => list.some((e) => e.kind === "needsSupervisor")),
    [projectSpanMarkersByDay]
  );

  // Same alert as projectSpanMarkersByDay's "needsSupervisor" kind above, but for change orders — a CO
  // with a start (or end) date, no logged labor, and no supervisor of its
  // own (ChangeOrderDayAssignment / supervisorUserId) yet, past or future.
  // Anchored to the CO's own scheduledDateKey/scheduledEndDateKey since
  // there's no other marker to place it by until one's assigned.
  const coNeedsSupervisorByDay = useMemo(() => {
    const plannedDayPairs = new Set(coDayAssignments.map((a) => `${a.changeOrderId}:${a.dateKey}`));
    const map = new Map<string, { co: ScheduleChangeOrder; role: "start" | "end" }[]>();
    for (const co of changeOrders) {
      const supervisorId = currentCoSupervisorId(co);
      if (supervisorId) continue;
      if (Object.keys(co.laborByDay).length > 0) continue;
      if (coIsComplete(co.status)) continue;
      if (!co.scheduledDateKey) continue;
      const occurrences: { k: string; role: "start" | "end" }[] =
        co.scheduledEndDateKey
          ? [{ k: co.scheduledDateKey, role: "start" }, { k: co.scheduledEndDateKey, role: "end" }]
          : [{ k: co.scheduledDateKey, role: "start" }];
      for (const { k, role } of occurrences) {
        if (plannedDayPairs.has(`${co.id}:${k}`)) continue;
        const list = map.get(k) ?? [];
        list.push({ co, role });
        map.set(k, list);
      }
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changeOrders, coDayAssignments, coSupervisorOverrides]);

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
          className={`flex h-8 w-8 items-center justify-center rounded border transition-colors ${
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
        className="w-40 rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-800 placeholder-gray-400 focus:border-pink-400 focus:outline-none"
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
        className="rounded border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 transition-colors hover:border-pink-300 hover:text-pink-600"
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

  // Which rows of the "How to read this" key below have anything to show —
  // each row only appears once its own state actually exists somewhere on
  // the visible calendar, same rule every individual legend entry already
  // followed; grouped here so the three rows (Type / Status / Icons) and
  // the overall show/hide can share one source of truth instead of each
  // re-deriving its own condition inline.
  const legendShowsOverdue = dayAssignments.some((a) => a.dateKey < todayKey) || coDayAssignments.some((a) => a.dateKey < todayKey);
  const legendShowsNeedsSupervisor = hasNeedsSupervisorMarkers || coNeedsSupervisorByDay.size > 0;
  const legendShowsNoSupervisorPlanned = dayAssignments.some((a) => !a.supervisorUserId && !a.projectManagerUserId);
  const legendShowsType = presentGroups.length > 0 || changeOrders.length > 0 || sovRequestRows.length > 0;
  const legendShowsStatus =
    presentGroups.length > 0 ||
    dayAssignments.length > 0 ||
    legendShowsOverdue ||
    legendShowsNeedsSupervisor ||
    legendShowsNoSupervisorPlanned;
  const legendShowsIcons = presentGroups.length > 0;
  const legendShowsGroupingTip = presentGroups.includes("JANITORIAL_TURNOVER_REQUESTS");
  const showLegend = legendShowsType || legendShowsStatus || legendShowsIcons || legendShowsGroupingTip;

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
                const daySpanMarkers = projectSpanMarkersByDay.get(k) ?? [];
                // Unassigned by definition, so a supervisor filter can never
                // match one — hide rather than show under the wrong supervisor.
                let dayNeedsSupervisor = selectedSupervisorId ? [] : daySpanMarkers.filter((e) => e.kind === "needsSupervisor");
                let dayCoNeedsSupervisor = selectedSupervisorId ? [] : coNeedsSupervisorByDay.get(k) ?? [];
                let dayProjectSpanEndpoints = daySpanMarkers.filter((e) => e.kind === "spanEndpoint");

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
                dayCoNeedsSupervisor = selectedTypes.has("CO") ? dayCoNeedsSupervisor : [];
                // Full set (turnover + everything else) — renderCoChip uses
                // this to still show the amber "needs a supervisor" warning
                // on a turnover CO even though it's nested under its unit
                // now, not floating separately (see the split below).
                const coNeedsSupervisorIds = new Set(dayCoNeedsSupervisor.map((x) => x.co.id));
                // Any CO with a parent project stays nested under that
                // project's own chip (and, for turnover, that unit's building
                // dropdown) even while it needs a supervisor — same as any
                // other CO on that project — rather than popping out to float
                // separately just because it isn't staffed yet. Only a CO
                // whose project can't be resolved at all (see looseChangeOrders
                // below) keeps the standalone amber chip, since there's
                // nowhere to nest it under.
                dayCoNeedsSupervisor = dayCoNeedsSupervisor.filter((x) => !projectById.has(x.co.projectId));
                if (dayCoNeedsSupervisor.length > 0) {
                  const flagged = new Set(dayCoNeedsSupervisor.map((x) => x.co.id));
                  dayChangeOrders = dayChangeOrders.filter((co) => !flagged.has(co.id));
                }
                dayProjectSpanEndpoints = dayProjectSpanEndpoints.filter((x) => selectedTypes.has(calendarSegmentGroup(x.project.segment)));

                const confirmedProjectIds = new Set(dayProjects.map((p) => p.id));
                // Planned assignments are only shown when there's no confirmed
                // labor log yet for that project/day — once real work is
                // logged, the confirmed chip takes over.
                const dayPlanned = dayPlannedRaw
                  .filter((a) => !confirmedProjectIds.has(a.projectId))
                  .map((a) => ({ assignment: a, project: projectById.get(a.projectId) }))
                  .filter((x): x is { assignment: ScheduleDayAssignment; project: ScheduleProject } => !!x.project);

                // A project's change order(s) hang directly below that
                // project's own chip instead of sitting in a flat, unrelated
                // CO list, so the two read as one unit — a Post-Construction
                // project's CO with logged labor used to render as a totally
                // separate "loose" chip on the same day with no visual link
                // to that project's own confirmed/planned chip, same as a
                // turnover unit's CO always has. Only a CO whose project
                // can't be resolved at all falls back to the flat list, since
                // there's nothing to nest it under.
                const coByProjectId = new Map<string, ScheduleChangeOrder[]>();
                const looseChangeOrders: ScheduleChangeOrder[] = [];
                for (const co of dayChangeOrders) {
                  const parent = projectById.get(co.projectId);
                  if (parent) {
                    const list = coByProjectId.get(co.projectId) ?? [];
                    list.push(co);
                    coByProjectId.set(co.projectId, list);
                  } else {
                    looseChangeOrders.push(co);
                  }
                }
                // A project's own chip today comes from one of the four
                // buckets below — but a CO's scheduled day doesn't have to
                // land on a day its project is otherwise on the calendar
                // (e.g. extra work scheduled well after the base job already
                // finished). Without this, that CO would never get a home to
                // nest under and would just silently not render at all
                // (still named "...JanitorialUnits" below — predates this
                // covering every segment, not just turnover). Any such
                // orphaned project gets a minimal chip of its own instead,
                // purely so the CO always renders "under" it and the two
                // stay visually linked, same as everywhere else.
                const projectIdsWithOwnChipToday = new Set<string>([
                  ...dayNeedsSupervisor.map(({ project }) => project.id),
                  ...dayProjectSpanEndpoints.map(({ project }) => project.id),
                  ...dayProjects.map((p) => p.id),
                  ...dayPlanned.map(({ project }) => project.id),
                ]);
                const orphanedJanitorialUnits = Array.from(coByProjectId.keys())
                  .filter((id) => !projectIdsWithOwnChipToday.has(id))
                  .map((id) => projectById.get(id))
                  .filter((p): p is ScheduleProject => !!p);

                function renderCoChip(co: ScheduleChangeOrder, nested: boolean) {
                  const summary = co.laborByDay[k];
                  const parentProject = projectById.get(co.projectId);
                  const role: "start" | "end" | null =
                    k === co.scheduledDateKey ? "start" : k === co.scheduledEndDateKey ? "end" : null;
                  // A day covered by the CO's own ChangeOrderDayAssignment
                  // (a supervisor/PM was actually assigned) with no logged
                  // labor yet is a plan, not a fact — dashed border, same
                  // "planned" treatment a project's own dashed chip gets.
                  // Applies whether or not this is also the CO's start/end
                  // day (isPlannedOnly is a misnomer carried over from before
                  // this covered start/end days too — kept the name to avoid
                  // a churn-y rename).
                  const coAssignment = coDayAssignments.find((a) => a.dateKey === k && a.changeOrderId === co.id);
                  const isPlannedOnly = !summary && !!coAssignment;
                  // Same rule as a project's own dayPlanned chip: a planned
                  // day whose date has already passed with nothing logged is
                  // a missed assignment, not just an upcoming plan — flagged
                  // red instead of gray.
                  const isOverdue = isPlannedOnly && !isFutureOrToday;
                  // A day with logged work never gets dragged, even when
                  // it's also the CO's own scheduled start/end day — real
                  // work already happened there, same rule a project's own
                  // confirmed chip already follows (never draggable at
                  // all). Previously this only checked `role`, so a CO
                  // whose logged labor happened to fall on its scheduled
                  // start/end day stayed draggable and could get its date
                  // dragged out from under already-logged work.
                  const draggableHere = !summary && (role !== null || (isPlannedOnly && role === null));
                  const coSupervisor = coAssignment?.supervisorUserId
                    ? supervisors.find((s) => s.id === coAssignment.supervisorUserId)
                    : null;
                  const coPm = !coSupervisor && coAssignment?.projectManagerUserId
                    ? projectManagers.find((p) => p.id === coAssignment.projectManagerUserId)
                    : null;
                  // Still flagged even though it's nested under its unit now
                  // instead of floating separately — see the
                  // coNeedsSupervisorIds split above.
                  const needsSupervisor = coNeedsSupervisorIds.has(co.id);
                  return (
                    <li
                      key={`co-${co.id}`}
                      className={`${inMonth ? "group relative" : "relative"} ${nested ? "ml-3 border-l-2 border-blue-200 pl-1.5" : ""}`}
                    >
                      <button
                        type="button"
                        draggable={draggableHere}
                        onDragStart={draggableHere ? (e) => {
                          e.dataTransfer.setData("text/plain", co.id);
                          e.dataTransfer.effectAllowed = "move";
                          setDraggingChip(
                            role !== null
                              ? { kind: "changeOrder", projectId: co.projectId, changeOrderId: co.id, fromKey: k, jobTitle: co.title, role }
                              : { kind: "coPlanned", changeOrderId: co.id, assignmentId: coAssignment!.id, fromKey: k, jobTitle: co.title },
                          );
                        } : undefined}
                        onDragEnd={draggableHere ? () => {
                          setDraggingChip(null);
                          setDragOverDayKey(null);
                        } : undefined}
                        onClick={() => openCoPopover(k, co)}
                        className={`flex w-full items-center gap-1 truncate rounded px-1.5 py-0.5 text-[10px] font-medium shadow-sm transition-colors ${draggableHere ? "cursor-grab active:cursor-grabbing" : ""} ${isPlannedOnly ? (isOverdue ? OVERDUE_PLANNED_CHIP_EXTRA_CLASS : PLANNED_CHIP_EXTRA_CLASS) : ""} ${needsSupervisor ? "border-2 border-amber-600 bg-amber-400 font-bold text-amber-950 hover:bg-amber-300" : CHANGE_ORDER_CHIP_CLASS} ${completionChipClass(coIsComplete(co.status))}`}
                      >
                        {needsSupervisor ? <span aria-hidden>⚠</span> : null}
                        {isOverdue ? <span aria-hidden className="shrink-0 text-sm font-bold text-red-600">⚠</span> : null}
                        <CompletionStatusIcon complete={coIsComplete(co.status)} />
                        <span className="truncate">{co.title}</span>
                      </button>
                      {renderCoPopover(k, co)}
                      {inMonth ? (
                        <div className={`pointer-events-none absolute z-30 hidden w-max max-w-[220px] rounded-lg bg-gray-900 px-2.5 py-1.5 text-[10px] leading-snug text-white shadow-lg group-hover:block ${tooltipPositionClass}`}>
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
                          ) : coSupervisor ? (
                            <div className="mt-1 text-gray-300">Supervisor: {coSupervisor.displayName}</div>
                          ) : coPm ? (
                            <div className="mt-1 text-gray-300">PM: {coPm.displayName}</div>
                          ) : needsSupervisor ? (
                            <div className="mt-1 text-amber-300">No supervisor assigned yet — click to assign one</div>
                          ) : null}
                          {isOverdue ? <div className="mt-1 text-red-400">Scheduled but never logged</div> : null}
                          {summary ? (
                            <div className="mt-1 text-gray-300">Logged for this day, not draggable</div>
                          ) : role === "start" ? (
                            <div className="mt-1 text-gray-300">Starts this day — drag to reschedule</div>
                          ) : role === "end" ? (
                            <div className="mt-1 text-gray-300">Ends this day — drag to reschedule</div>
                          ) : isPlannedOnly ? (
                            <div className="mt-1 text-gray-300">Planned, not yet logged — drag to reschedule</div>
                          ) : (
                            <div className="mt-1 text-gray-300">Logged for this day, not draggable</div>
                          )}
                        </div>
                      ) : null}
                    </li>
                  );
                }

                // A unit with no chip of its own today (see
                // orphanedJanitorialUnits) but with a change order scheduled
                // this day — a minimal, non-draggable label just so the
                // CO(s) below still nest under something identifying their
                // unit, instead of never rendering at all. This label is
                // just a placeholder holding the unit's title for its CO(s)
                // to nest under, not a read on the unit itself — the unit
                // can easily still be ongoing (no ✓ here, unlike every other
                // own-chip renderer that checks p.status) while the CO(s)
                // scheduled under it today are done. So it fades along with
                // its nested CO(s) instead: transparent once every CO
                // nested under it is complete, same "worst wins" rule
                // buildingGroupSeverity's allComplete uses for a group.
                function renderOrphanedUnitChip(p: ScheduleProject, compactLabel?: string) {
                  const nestedCos = coByProjectId.get(p.id) ?? [];
                  const allNestedCosComplete = nestedCos.length > 0 && nestedCos.every((co) => coIsComplete(co.status));
                  return (
                    <Fragment key={`co-only-${p.id}`}>
                    <li className={inMonth ? "group relative" : "relative"}>
                      <Link
                        href={`/erp/projects/${p.id}`}
                        className={`flex w-full items-center gap-1 truncate rounded border border-dashed px-1.5 py-0.5 text-[10px] font-medium transition-colors ${CALENDAR_GROUP_CHIP_CLASS[calendarSegmentGroup(p.segment)]} ${completionChipClass(allNestedCosComplete)}`}
                      >
                        <span className="truncate">{compactLabel ?? p.jobTitle}</span>
                      </Link>
                      {inMonth ? (
                        <div className={`pointer-events-none absolute z-30 hidden w-max max-w-[220px] rounded-lg bg-gray-900 px-2.5 py-1.5 text-[10px] leading-snug text-white shadow-lg group-hover:block ${tooltipPositionClass}`}>
                          <div className="font-semibold">{p.jobTitle}</div>
                          <div className="text-gray-300">Not otherwise scheduled this day — shown for its change order below</div>
                        </div>
                      ) : null}
                    </li>
                    {nestedCos.map((co) => renderCoChip(co, true))}
                    </Fragment>
                  );
                }

                function renderNeedsSupervisorChip(p: ScheduleProject, role: "start" | "end", compactLabel?: string) {
                  return (
                    <Fragment key={`needs-${p.id}-${role}`}>
                    <li className={inMonth ? "group relative" : "relative"}>
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
                        className={`w-full cursor-grab active:cursor-grabbing ${NEEDS_SUPERVISOR_CHIP_CLASS} ${completionChipClass(p.status === "COMPLETE")}`}
                      >
                        <span aria-hidden>⚠</span>
                        <CompletionStatusIcon complete={p.status === "COMPLETE"} />
                        <span className="truncate" title={p.jobTitle}>{compactLabel ?? p.jobTitle}</span>
                      </button>
                      {inMonth ? (
                        <div className={`pointer-events-none absolute z-30 hidden w-max max-w-[220px] rounded-lg bg-gray-900 px-2.5 py-1.5 text-[10px] leading-snug text-white shadow-lg group-hover:block ${tooltipPositionClass}`}>
                          <div className="font-semibold">{p.jobTitle}</div>
                          <div className="text-amber-300">
                            {isFutureOrToday
                              ? `${role === "end" ? (isToday ? "Ends today" : "Ends this day") : isToday ? "Starts today" : "Starts this day"} — no supervisor assigned yet`
                              : `${role === "end" ? "Ended" : "Started"} ${formatShortDate(k)} — never logged, no supervisor assigned`}
                          </div>
                          <div className="mt-1 text-gray-300">Click to view or assign one</div>
                        </div>
                      ) : null}
                      {renderEventPopover(k, p)}
                    </li>
                    {(coByProjectId.get(p.id) ?? []).map((co) => renderCoChip(co, true))}
                    </Fragment>
                  );
                }

                function renderSpanEndpointChip(p: ScheduleProject, role: "start" | "end", compactLabel?: string) {
                  // Same escalation renderPlannedChip already applies to a
                  // real ProjectDayAssignment once its day passes unlogged —
                  // this chip covers the case where there wasn't even an
                  // assignment to escalate, so without this it just kept
                  // rendering as a calm "planned" dash forever (or, before
                  // the todayK filter was removed from
                  // computeProjectSpanMarkersByDay, didn't render at all past
                  // its own date).
                  const isOverdue = !isFutureOrToday;
                  return (
                    <Fragment key={`span-${p.id}-${role}`}>
                    <li className={inMonth ? "group relative" : "relative"}>
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
                        className={`flex w-full cursor-grab items-center gap-1 truncate rounded py-0.5 pl-1.5 pr-4 text-[10px] font-medium shadow-sm transition-colors active:cursor-grabbing ${CALENDAR_GROUP_CHIP_CLASS[calendarSegmentGroup(p.segment)]} ${isOverdue ? OVERDUE_PLANNED_CHIP_EXTRA_CLASS : PLANNED_CHIP_EXTRA_CLASS} ${completionChipClass(p.status === "COMPLETE")}`}
                      >
                        {isOverdue ? <span aria-hidden className="shrink-0 text-sm font-bold text-red-600">⚠</span> : null}
                        <CompletionStatusIcon complete={p.status === "COMPLETE"} />
                        <span className="truncate">{compactLabel ?? p.jobTitle}</span>
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
                        <div className={`pointer-events-none absolute z-30 hidden w-max max-w-[220px] rounded-lg bg-gray-900 px-2.5 py-1.5 text-[10px] leading-snug text-white shadow-lg group-hover:block ${tooltipPositionClass}`}>
                          <div className="font-semibold">{p.jobTitle}</div>
                          <div className={isOverdue ? "text-red-400" : "text-gray-300"}>
                            {isOverdue
                              ? `${role === "end" ? "Ended" : "Started"} ${formatShortDate(k)} — nothing ever logged`
                              : `${role === "end" ? "Ends on this day" : "Starts on this day"} — not otherwise scheduled`}
                          </div>
                          <div className="mt-1 text-gray-300">Click to view or schedule it</div>
                        </div>
                      ) : null}
                      {renderEventPopover(k, p)}
                    </li>
                    {(coByProjectId.get(p.id) ?? []).map((co) => renderCoChip(co, true))}
                    </Fragment>
                  );
                }

                function renderConfirmedChip(p: ScheduleProject, compactLabel?: string) {
                  const summary = p.laborByDay[k];
                  const loggedWorkers = new Set(summary?.workers ?? []);
                  const plannedWorkers = (p.plannedWorkersByDay[k] ?? []).filter((w) => !loggedWorkers.has(w));
                  // What was actually worked on, straight off the labor log —
                  // same union renderLaborPopover shows, just surfaced in the
                  // hover tooltip too so it's visible without opening it.
                  const loggedScopes = [
                    ...new Set(
                      (p.laborEntriesByDay[k] ?? []).flatMap((e) => [...e.sovItemDescriptions, ...(e.taskDescription ? [e.taskDescription] : [])])
                    ),
                  ];
                  return (
                    <Fragment key={`p-${p.id}`}>
                    <li className={inMonth ? "group relative" : "relative"}>
                      <button
                        type="button"
                        onClick={() => openLaborPopover(k, p)}
                        className={`flex w-full items-center gap-1 truncate rounded px-1.5 py-0.5 text-[10px] font-medium shadow-sm transition-colors ${CALENDAR_GROUP_CHIP_CLASS[calendarSegmentGroup(p.segment)]} ${completionChipClass(p.status === "COMPLETE")}`}
                      >
                        <CompletionStatusIcon complete={p.status === "COMPLETE"} />
                        <span className="truncate">{compactLabel ?? p.jobTitle}</span>
                      </button>
                      {renderLaborPopover(k, p)}
                      {inMonth ? (
                        <div className={`pointer-events-none absolute z-30 hidden w-max max-w-[220px] rounded-lg bg-gray-900 px-2.5 py-1.5 text-[10px] leading-snug text-white shadow-lg group-hover:block ${tooltipPositionClass}`}>
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
                          {loggedScopes.length > 0 ? (
                            <div className="text-gray-300">Scope: {loggedScopes.join(", ")}</div>
                          ) : null}
                          {plannedWorkers.length > 0 ? (
                            <div className="mt-1 text-gray-300">Planned: {plannedWorkers.join(", ")}</div>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                    {(coByProjectId.get(p.id) ?? []).map((co) => renderCoChip(co, true))}
                    </Fragment>
                  );
                }

                function renderPlannedChip(assignment: ScheduleDayAssignment, project: ScheduleProject, compactLabel?: string) {
                  const isOverdue = !isFutureOrToday;
                  const plannedWorkers = project.plannedWorkersByDay[k] ?? [];
                  const supervisor = assignment.supervisorUserId ? supervisors.find((s) => s.id === assignment.supervisorUserId) : null;
                  const pm = !supervisor && assignment.projectManagerUserId ? projectManagers.find((p) => p.id === assignment.projectManagerUserId) : null;
                  const assignmentSovDescriptions = assignment.sovItemIds
                    .map((sovId) => project.sovItems.find((s) => s.id === sovId)?.description)
                    .filter((d): d is string => !!d);
                  const assignmentScopeLabels = assignment.scopeItems.map(turnoverScopeLabel);
                  const noSupervisor = !isOverdue && !supervisor && !pm;
                  return (
                  <Fragment key={`plan-${assignment.id}`}>
                  <li className={inMonth ? "group relative" : "relative"}>
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
                      className={`flex w-full cursor-grab items-center gap-1 truncate rounded py-0.5 pl-1.5 pr-4 text-[10px] font-medium shadow-sm transition-colors active:cursor-grabbing ${
                        noSupervisor
                          ? NO_SUPERVISOR_PLANNED_CHIP_CLASS
                          : `${CALENDAR_GROUP_CHIP_CLASS[calendarSegmentGroup(project.segment)]} ${isOverdue ? OVERDUE_PLANNED_CHIP_EXTRA_CLASS : PLANNED_CHIP_EXTRA_CLASS}`
                      } ${completionChipClass(project.status === "COMPLETE")}`}
                    >
                      {isOverdue ? (
                        <span aria-hidden className="shrink-0 text-sm font-bold text-red-600">⚠</span>
                      ) : noSupervisor ? (
                        <span aria-hidden title="No supervisor assigned" className="shrink-0 text-amber-950">⚠</span>
                      ) : null}
                      <CompletionStatusIcon complete={project.status === "COMPLETE"} />
                      <span className="truncate">{compactLabel ?? project.jobTitle}</span>
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
                      <div className={`pointer-events-none absolute z-30 hidden w-max max-w-[220px] rounded-lg bg-gray-900 px-2.5 py-1.5 text-[10px] leading-snug text-white shadow-lg group-hover:block ${tooltipPositionClass}`}>
                        <div className="font-semibold">{project.jobTitle}</div>
                        <div className="text-gray-300">
                          {isOverdue ? "Scheduled but never logged" : "Planned, not yet logged"}
                        </div>
                        {supervisor ? (
                          <div className="flex items-center gap-1 text-gray-300">
                            Supervisor: {supervisor.displayName}
                            <ResponseDot status={assignment.responseStatus} />
                          </div>
                        ) : pm ? (
                          <div className="text-gray-300">PM: {pm.displayName}</div>
                        ) : (
                          <div className="text-amber-400">No supervisor assigned yet</div>
                        )}
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
                  {(coByProjectId.get(project.id) ?? []).map((co) => renderCoChip(co, true))}
                  </Fragment>
                  );
                }

                // Same-building turnover units sharing this day, pulled out
                // of the four buckets above (not duplicated — each entry
                // still remembers which bucket/extras it came from) so they
                // can collapse into one expandable chip. Grouping happens
                // purely at render time; it doesn't change what's "planned"
                // vs. "confirmed" for any other logic on this day.
                const turnoverEntries: TurnoverEntry[] = [
                  ...dayNeedsSupervisor
                    .filter(({ project }) => isGroupableTurnoverProject(project))
                    .map(({ project, role }) => ({ kind: "needsSupervisor" as const, project, role })),
                  ...dayProjectSpanEndpoints
                    .filter(({ project }) => isGroupableTurnoverProject(project))
                    .map(({ project, role }) => ({ kind: "spanEndpoint" as const, project, role })),
                  ...dayProjects
                    .filter(isGroupableTurnoverProject)
                    .map((project) => ({ kind: "confirmed" as const, project })),
                  ...dayPlanned
                    .filter(({ project }) => isGroupableTurnoverProject(project))
                    .map(({ assignment, project }) => ({ kind: "planned" as const, assignment, project })),
                  // Counts toward its building's group even though it has no
                  // chip of its own today — see orphanedJanitorialUnits.
                  ...orphanedJanitorialUnits
                    .filter(isGroupableTurnoverProject)
                    .map((project) => ({ kind: "coOnly" as const, project })),
                ];
                const turnoverEntriesByBuilding = new Map<string, TurnoverEntry[]>();
                for (const entry of turnoverEntries) {
                  const buildingId = entry.project.buildingId!;
                  const list = turnoverEntriesByBuilding.get(buildingId) ?? [];
                  list.push(entry);
                  turnoverEntriesByBuilding.set(buildingId, list);
                }
                // Collapsing one unit into "1 unit, click to expand" saves
                // nothing over just showing it, so only buildings with 2+
                // turnover entries this day actually group.
                const buildingGroups = Array.from(turnoverEntriesByBuilding.entries())
                  .filter(([, entries]) => entries.length >= 2)
                  .map(([buildingId, entries]) => ({
                    buildingId,
                    buildingName: entries[0]!.project.buildingName ?? "Building",
                    entries,
                  }))
                  .sort((a, b) => a.buildingName.localeCompare(b.buildingName));
                const groupedBuildingIds = new Set(buildingGroups.map((g) => g.buildingId));
                const isGroupedOut = (p: ScheduleProject) => !!p.buildingId && groupedBuildingIds.has(p.buildingId);
                const dayNeedsSupervisorUngrouped = dayNeedsSupervisor.filter(({ project }) => !isGroupedOut(project));
                const dayProjectSpanEndpointsUngrouped = dayProjectSpanEndpoints.filter(({ project }) => !isGroupedOut(project));
                const dayProjectsUngrouped = dayProjects.filter((p) => !isGroupedOut(p));
                const dayPlannedUngrouped = dayPlanned.filter(({ project }) => !isGroupedOut(project));
                const orphanedJanitorialUnitsUngrouped = orphanedJanitorialUnits.filter((p) => !isGroupedOut(p));

                // Worst-state-wins, using the exact same severity levels the
                // ungrouped chips already use — a group is only as "healthy"
                // as its least-done unit, so nothing bad hides behind the
                // collapse.
                function buildingGroupSeverity(entries: TurnoverEntry[]): "needsSupervisor" | "overdue" | "planned" | "confirmed" {
                  const dayIsOverdue = !isFutureOrToday;
                  const needsSupervisor = entries.some(
                    (e) =>
                      e.kind === "needsSupervisor" ||
                      (e.kind === "planned" && !dayIsOverdue && !e.assignment.supervisorUserId && !e.assignment.projectManagerUserId),
                  );
                  if (needsSupervisor) return "needsSupervisor";
                  if (dayIsOverdue && entries.some((e) => e.kind === "planned")) return "overdue";
                  if (entries.some((e) => e.kind === "planned" || e.kind === "spanEndpoint")) return "planned";
                  return "confirmed";
                }

                function renderBuildingGroupChip(group: { buildingId: string; buildingName: string; entries: TurnoverEntry[] }) {
                  const { buildingId, buildingName, entries } = group;
                  const severity = buildingGroupSeverity(entries);
                  const groupKey = `${k}:${buildingId}`;
                  const isExpanded = expandedBuildingGroups.has(groupKey);
                  // Same "worst/least-done unit wins" rule severity already
                  // follows, just inverted: the heading only reads complete
                  // once every single unit in the group does.
                  const allComplete = entries.every((e) => e.project.status === "COMPLETE");
                  const severityClass =
                    severity === "needsSupervisor"
                      ? NEEDS_SUPERVISOR_CHIP_CLASS
                      : severity === "overdue"
                      ? `${CALENDAR_GROUP_CHIP_CLASS.JANITORIAL_TURNOVER_REQUESTS} ${OVERDUE_PLANNED_CHIP_EXTRA_CLASS}`
                      : severity === "planned"
                      ? `${CALENDAR_GROUP_CHIP_CLASS.JANITORIAL_TURNOVER_REQUESTS} ${PLANNED_CHIP_EXTRA_CLASS}`
                      : CALENDAR_GROUP_CHIP_CLASS.JANITORIAL_TURNOVER_REQUESTS;
                  return (
                    <Fragment key={`bldg-${buildingId}`}>
                    <li className={inMonth ? "group relative" : "relative"}>
                      <button
                        type="button"
                        onClick={() => toggleBuildingGroup(groupKey)}
                        title={buildingName}
                        // The unit count + chevron used to sit in this same
                        // flex row as the name (ml-auto pushing them right),
                        // which in a ~100px-wide day-cell chip left almost no
                        // room for the name itself — often just 1-2 visible
                        // characters. They're pulled out to an absolutely
                        // positioned badge below instead, reserving a fixed
                        // pr-8 gutter so the name gets the rest of the width.
                        className={`relative flex w-full items-center gap-1 truncate rounded py-0.5 pl-1.5 pr-8 text-[10px] font-medium shadow-sm transition-colors ${severityClass} ${completionChipClass(allComplete)}`}
                      >
                        {severity === "needsSupervisor" ? <span aria-hidden>⚠</span> : null}
                        {severity === "overdue" ? <span aria-hidden className="shrink-0 text-sm font-bold text-red-600">⚠</span> : null}
                        <CompletionStatusIcon complete={allComplete} />
                        <span className="truncate">{buildingName}</span>
                        <span className="pointer-events-none absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5 whitespace-nowrap text-[9px] font-normal opacity-80">
                          {entries.length}
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className={`h-3 w-3 shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2.5}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </span>
                      </button>
                      {inMonth ? (
                        <div className={`pointer-events-none absolute z-30 hidden w-max max-w-[220px] rounded-lg bg-gray-900 px-2.5 py-1.5 text-[10px] leading-snug text-white shadow-lg group-hover:block ${tooltipPositionClass}`}>
                          <div className="font-semibold">{buildingName}</div>
                          <div className="text-gray-300">
                            {entries.length} turnover units this day{allComplete ? " — all complete" : ""}
                          </div>
                          <ul className="mt-1 space-y-0.5">
                            {entries.map((e) => (
                              <li key={e.project.id} className="flex items-center gap-1 text-gray-300">
                                <span aria-hidden>
                                  {e.project.status === "COMPLETE" ? "✓" : e.kind === "needsSupervisor" ? "⚠" : "⋯"}
                                </span>
                                <span className="truncate">{unitLabelForGroupedChip(e.project)}</span>
                              </li>
                            ))}
                          </ul>
                          <div className="mt-1 text-gray-300">Click to {isExpanded ? "collapse" : "expand"}</div>
                        </div>
                      ) : null}
                    </li>
                    {isExpanded ? (
                      <ul className="ml-3 space-y-1 border-l-2 border-gray-200 pl-1.5">
                        {entries.map((e) => {
                          const compactLabel = unitLabelForGroupedChip(e.project);
                          switch (e.kind) {
                            case "needsSupervisor":
                              return renderNeedsSupervisorChip(e.project, e.role, compactLabel);
                            case "spanEndpoint":
                              return renderSpanEndpointChip(e.project, e.role, compactLabel);
                            case "confirmed":
                              return renderConfirmedChip(e.project, compactLabel);
                            case "planned":
                              return renderPlannedChip(e.assignment, e.project, compactLabel);
                            case "coOnly":
                              return renderOrphanedUnitChip(e.project, compactLabel);
                          }
                        })}
                      </ul>
                    ) : null}
                    </Fragment>
                  );
                }

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
                    {dayNeedsSupervisorUngrouped.length > 0 ? (
                      <ul className="mt-1 space-y-1">
                        {dayNeedsSupervisorUngrouped.map(({ project: p, role }) => renderNeedsSupervisorChip(p, role))}
                      </ul>
                    ) : null}
                    {dayCoNeedsSupervisor.length > 0 ? (
                      <ul className="mt-1 space-y-1">
                        {dayCoNeedsSupervisor.map(({ co, role }) => (
                          <li key={`co-needs-${co.id}-${role}`} className={inMonth ? "group relative" : "relative"}>
                            <button
                              type="button"
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.setData("text/plain", co.id);
                                e.dataTransfer.effectAllowed = "move";
                                setDraggingChip({ kind: "changeOrder", projectId: co.projectId, changeOrderId: co.id, fromKey: k, jobTitle: co.title, role });
                              }}
                              onDragEnd={() => {
                                setDraggingChip(null);
                                setDragOverDayKey(null);
                              }}
                              onClick={() => openCoPopover(k, co)}
                              className={`w-full cursor-grab active:cursor-grabbing ${NEEDS_SUPERVISOR_CHIP_CLASS}`}
                            >
                              <span aria-hidden>⚠</span>
                              <span className="truncate" title={co.title}>{co.title}</span>
                            </button>
                            {inMonth ? (
                              <div className={`pointer-events-none absolute z-30 hidden w-max max-w-[220px] rounded-lg bg-gray-900 px-2.5 py-1.5 text-[10px] leading-snug text-white shadow-lg group-hover:block ${tooltipPositionClass}`}>
                                <div className="font-semibold">{co.title}</div>
                                <div className="text-gray-300">{CHANGE_ORDER_LABEL}</div>
                                <div className="text-amber-300">
                                  {isFutureOrToday
                                    ? `${role === "end" ? (isToday ? "Ends today" : "Ends this day") : isToday ? "Starts today" : "Starts this day"} — no supervisor assigned yet`
                                    : `${role === "end" ? "Ended" : "Started"} ${formatShortDate(k)} — never logged, no supervisor assigned`}
                                </div>
                                <div className="mt-1 text-gray-300">Click to view or assign one</div>
                              </div>
                            ) : null}
                            {renderCoPopover(k, co)}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {buildingGroups.length > 0 ? (
                      <ul className="mt-1 space-y-1">
                        {buildingGroups.map((group) => renderBuildingGroupChip(group))}
                      </ul>
                    ) : null}
                    <ul className="mt-1 space-y-1">
                      {dayProjectSpanEndpointsUngrouped.map(({ project: p, role }) => renderSpanEndpointChip(p, role))}
                      {dayProjectsUngrouped.map((p) => renderConfirmedChip(p))}
                      {dayPlannedUngrouped.map(({ assignment, project }) => renderPlannedChip(assignment, project))}
                      {orphanedJanitorialUnitsUngrouped.map((p) => renderOrphanedUnitChip(p))}
                      {looseChangeOrders.map((co) => renderCoChip(co, false))}
                      {daySovRequests.map((r) => {
                        const parentProject = projectById.get(r.projectId);
                        return (
                          <li key={`sov-${r.id}`} className={inMonth ? "group relative" : "relative"}>
                            <Link
                              href={`/erp/projects/${r.projectId}`}
                              className={`flex items-center gap-1 truncate rounded py-0.5 pl-1.5 pr-4 text-[10px] font-medium shadow-sm transition-colors ${SOV_REQUEST_CHIP_CLASS}`}
                            >
                              <span aria-hidden title="No supervisor assigned" className="shrink-0">⚠</span>
                              <span className="truncate">{r.title}</span>
                            </Link>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                handleDeleteSovRequest(r.id);
                              }}
                              disabled={deletingSovRequestId === r.id}
                              title="Remove this request"
                              className="absolute right-0.5 top-1/2 -translate-y-1/2 z-20 px-0.5 text-[11px] font-bold leading-none opacity-60 hover:opacity-100 disabled:opacity-30"
                            >
                              ×
                            </button>
                            {inMonth ? (
                              <div className={`pointer-events-none absolute z-30 hidden w-max max-w-[220px] rounded-lg bg-gray-900 px-2.5 py-1.5 text-[10px] leading-snug text-white shadow-lg group-hover:block ${tooltipPositionClass}`}>
                                <div className="font-semibold">{r.title}</div>
                                <div className="text-gray-300">{SOV_REQUEST_LABEL}</div>
                                {parentProject ? <div className="text-gray-300">Project: {parentProject.jobTitle}</div> : null}
                                <div className="text-gray-300">Requested by: {r.requestedBy}</div>
                                <div className="text-amber-400">No supervisor assigned yet</div>
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
        {showLegend ? (
          <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
            {legendShowsType ? (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Type</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1.5">
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
                  {sovRequestRows.length > 0 ? (
                    <div className="flex items-center gap-1.5 text-[11px] text-gray-600">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${SOV_REQUEST_SWATCH_CLASS}`} />
                      {SOV_REQUEST_LABEL}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {legendShowsStatus ? (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Status</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                  {presentGroups.length > 0 ? (
                    <div className="flex items-center gap-1.5 text-[11px] text-gray-600">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-gray-300" />
                      Solid = work actually logged that day
                    </div>
                  ) : null}
                  {dayAssignments.length > 0 ? (
                    <div className="flex items-center gap-1.5 text-[11px] text-gray-600">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-sm bg-white ${PLANNED_CHIP_EXTRA_CLASS}`} />
                      Dashed = planned, not yet logged
                    </div>
                  ) : null}
                  {legendShowsOverdue ? (
                    <div className="flex items-center gap-1.5 text-[11px] text-gray-600">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-sm bg-white ${OVERDUE_PLANNED_CHIP_EXTRA_CLASS}`} />
                      <span aria-hidden className="text-red-600">⚠</span> = scheduled but never logged
                    </div>
                  ) : null}
                  {legendShowsNeedsSupervisor ? (
                    <div className="flex items-center gap-1.5 text-[11px] text-gray-600">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-sm border-2 border-amber-600 bg-amber-400" />
                      ⚠ = starting soon, needs a supervisor
                    </div>
                  ) : null}
                  {legendShowsNoSupervisorPlanned ? (
                    <div className="flex items-center gap-1.5 text-[11px] text-gray-600">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${NO_SUPERVISOR_PLANNED_CHIP_CLASS}`} />
                      <span aria-hidden className="text-amber-950">⚠</span> = planned, no supervisor assigned yet
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {legendShowsIcons ? (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Icons</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                  <div className="flex items-center gap-1.5 text-[11px] text-gray-600">
                    <span aria-hidden>⚙</span>
                    = in progress
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-gray-600">
                    <span aria-hidden className="text-emerald-700">✓</span>
                    = complete (faded)
                  </div>
                </div>
              </div>
            ) : null}

            {legendShowsGroupingTip ? (
              <p className="flex items-center gap-1.5 text-[11px] text-gray-400">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${CALENDAR_GROUP_SWATCH_CLASS.JANITORIAL_TURNOVER_REQUESTS}`} />
                Tip: same-building turnover units on a shared day group into one chip — click to expand.
              </p>
            ) : null}
          </div>
        ) : null}
      </CollapsibleSection>

      <CollapsibleSection title="Project timeline" headerExtra={allGanttWindows.length > 0 ? ganttNav : undefined}>
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
          changeOrderOptions={changeOrderOptions}
          supervisors={supervisors}
          projectManagers={projectManagers}
          employees={employees}
          contractors={contractors}
          existingWorkers={workerAssignments.filter((a) => a.dateKey === openDayKey)}
          existingCoWorkers={coWorkerAssignments.filter((a) => a.dateKey === openDayKey)}
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
          onWorkerUpdated={(a) => setWorkerAssignments((prev) => prev.map((x) => (x.id === a.id ? a : x)))}
          onCoCreated={(a) => {
            setCoDayAssignments((prev) => [...prev.filter((x) => x.id !== a.id), a]);
            if (a.supervisorUserId) setCoSupervisorOverrides((o) => ({ ...o, [a.changeOrderId]: a.supervisorUserId }));
          }}
          onCoWorkerCreated={(a) => setCoWorkerAssignments((prev) => [...prev.filter((x) => x.id !== a.id), a])}
          onCoWorkerDeleted={(id) => setCoWorkerAssignments((prev) => prev.filter((a) => a.id !== id))}
        />
      ) : null}
    </div>
  );
}
