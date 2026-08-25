"use client";

import { useState } from "react";
import {
  dayCellLabelWithYear,
  matchesSearchQuery,
  type ScheduleCoDayAssignment,
  type ScheduleCoWorkerAssignment,
  type ScheduleDayAssignment,
  type ScheduleWorkerAssignment,
} from "@/lib/erp/schedule";
import { calendarSegmentGroup, type CalendarSegmentGroup } from "@/lib/erp/projectSegments";
import { TURNOVER_SCOPE_OPTIONS, turnoverScopeLabel } from "@/lib/erp/turnoverScope";
import { SOVMultiCombobox, type SOVItemOption } from "@/app/erp/components/SOVCombobox";
import { SearchableSelect } from "@/app/erp/components/SearchableSelect";
import { MiniCalendarPicker } from "./MiniCalendarPicker";

/** The specific things a single crew member on a day could be split onto —
 * an SOV item for Post-Construction, a turnover scope category for
 * Janitorial — mirroring whichever picks are currently set in "Task
 * details" for that project. Empty when there's zero or one thing picked:
 * nothing to split a crew across, so callers use this to decide whether a
 * per-worker picker is worth showing at all. */
function scopeSplitOptions(
  group: CalendarSegmentGroup | null,
  project: ProjectOption | null,
  sovPicks: string[],
  scopePicks: string[]
): { id: string; label: string }[] {
  if (group === "POST_CONSTRUCTION" && project) {
    return sovPicks
      .map((id) => project.sovItems.find((s) => s.id === id))
      .filter((s): s is SOVItemOption => !!s)
      .map((s) => ({ id: s.id, label: s.description }));
  }
  if (group === "JANITORIAL_TURNOVER_REQUESTS") {
    return scopePicks.map((v) => ({ id: v, label: turnoverScopeLabel(v) }));
  }
  return [];
}

type ProjectOption = {
  id: string;
  jobTitle: string;
  segment: string;
  sovItems: SOVItemOption[];
  contractedScopeItems: string[] | null;
  completedScopeItems: string[];
  changeOrders: { id: string; title: string }[];
};
/** A flattened change order, for the "Change order" target mode's search —
 * carries its parent project's title too since two COs on different jobs
 * can share a title (e.g. "Change order 1"). */
type ChangeOrderOption = { id: string; title: string; projectId: string; projectTitle: string };
type Person = { id: string; displayName: string };
/** Employees/contractors specifically — unlike a supervisor/PM (always an
 * ErpUser, always has an email), a crew member's email is optional, and
 * that's the one thing that gates whether they get a schedule invite at
 * all. Null surfaces a "no email on file" note wherever they're picked. */
type WorkerPerson = Person & { email: string | null };

/**
 * Closed-by-default section for everything in this modal that isn't the
 * core "who's covering this day" ask — task details and crew, same idea as
 * the "Duplicate to more days" section this pattern was lifted from. Always
 * shows a one-line summary of what's already set even while closed, so
 * closed doesn't mean "you have to open this to know what's there."
 */
function CollapsibleField({
  label,
  summary,
  open,
  onToggle,
  children,
}: {
  label: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded border border-gray-200 p-2">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 text-xs font-medium text-gray-600"
      >
        <span>{label}</span>
        <span className="flex items-center gap-1.5 text-gray-400">
          {!open && summary ? <span className="truncate">{summary}</span> : null}
          <span className="shrink-0">{open ? "Hide" : "Show"}</span>
        </span>
      </button>
      {open ? <div className="mt-2 space-y-2">{children}</div> : null}
    </div>
  );
}

export function DayAssignmentModal({
  dateKey,
  projects,
  changeOrderOptions,
  supervisors,
  projectManagers,
  employees,
  contractors,
  existingWorkers,
  existingCoWorkers,
  initialProjectId,
  onClose,
  onCreated,
  onSeriesCreated,
  onSeriesDeleted,
  onWorkerCreated,
  onWorkerSeriesCreated,
  onWorkerDeleted,
  onWorkerUpdated,
  onCoCreated,
  onCoWorkerCreated,
  onCoWorkerDeleted,
}: {
  dateKey: string;
  projects: ProjectOption[];
  changeOrderOptions: ChangeOrderOption[];
  supervisors: Person[];
  projectManagers: Person[];
  employees: WorkerPerson[];
  contractors: WorkerPerson[];
  existingWorkers: ScheduleWorkerAssignment[];
  existingCoWorkers: ScheduleCoWorkerAssignment[];
  /** Pre-selects a project — e.g. jumping here from the "needs a supervisor" alert chip for a specific project. */
  initialProjectId?: string;
  onClose: () => void;
  onCreated: (assignment: ScheduleDayAssignment) => void;
  /** Fired instead of onCreated when a repeat/range is active, one row per generated day. */
  onSeriesCreated: (assignments: ScheduleDayAssignment[]) => void;
  /** Fired when a whole repeating series (every day it generated) is removed. */
  onSeriesDeleted: (seriesId: string) => void;
  onWorkerCreated: (assignment: ScheduleWorkerAssignment) => void;
  /** Fired instead of onWorkerCreated when a repeat/range is active, one row per generated day. */
  onWorkerSeriesCreated: (assignments: ScheduleWorkerAssignment[]) => void;
  onWorkerDeleted: (id: string) => void;
  /** Fired when an already-scheduled worker's scope split is reassigned. */
  onWorkerUpdated: (assignment: ScheduleWorkerAssignment) => void;
  /** Fired when a change order (rather than a project) gets its coverage saved. */
  onCoCreated: (assignment: ScheduleCoDayAssignment) => void;
  onCoWorkerCreated: (assignment: ScheduleCoWorkerAssignment) => void;
  onCoWorkerDeleted: (id: string) => void;
}) {
  // Which kind of thing this modal is scheduling — a project (the original,
  // full-featured flow: SOV/scope pickers, repeat/duplicate, project-level
  // series) or a change order directly (supervisor/PM/time/comment + crew
  // only, no repeat yet, see ChangeOrderDayAssignment).
  const [targetMode, setTargetMode] = useState<"project" | "co">("project");

  const [projectId, setProjectId] = useState(initialProjectId ?? "");
  const [projectQuery, setProjectQuery] = useState(
    () => projects.find((p) => p.id === initialProjectId)?.jobTitle ?? ""
  );
  const [coId, setCoId] = useState("");
  const [coQuery, setCoQuery] = useState("");
  const [supervisorUserId, setSupervisorUserId] = useState("");
  // Rare case: only the PM is on site that day, no supervisor. At least one
  // of supervisorUserId/projectManagerUserId is required to submit.
  const [projectManagerUserId, setProjectManagerUserId] = useState("");
  // Same idea, but an outside Contractor covered the day instead of a
  // supervisor (e.g. a subcontractor running the site solo).
  const [supervisorContractorId, setSupervisorContractorId] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  // Post-Construction: which SOV line item(s) this day's work is for.
  const [sovPicks, setSovPicks] = useState<string[]>([]);
  // Janitorial: which scope categories (clean, paint, etc.) this day covers.
  const [scopePicks, setScopePicks] = useState<string[]>([]);
  // Which change order(s), if any, this day's work is for — lets a CO be
  // scheduled on a day between its start/end, not just those two days.
  const [coPicks, setCoPicks] = useState<string[]>([]);
  // Free-text note, mainly for when there are no SOV items yet to pick from.
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deletingSeriesId, setDeletingSeriesId] = useState<string | null>(null);

  // Workers scheduled: either an Employee or a Contractor, picked via the
  // toggle below. Kept as separate id/query state per type so switching the
  // toggle doesn't lose whichever search was in progress on the other one.
  const [workerType, setWorkerType] = useState<"employee" | "contractor">("employee");
  const [employeeId, setEmployeeId] = useState("");
  const [employeeQuery, setEmployeeQuery] = useState("");
  const [contractorId, setContractorId] = useState("");
  const [contractorQuery, setContractorQuery] = useState("");
  // Which scope the next worker covers, when the project's day has more
  // than one (see scopeSplitOptions) — required in that case, ignored
  // otherwise (everyone's on the day's one-and-only scope by default).
  const [workerScopePick, setWorkerScopePick] = useState("");
  const [addingWorker, setAddingWorker] = useState(false);
  const [workerError, setWorkerError] = useState("");
  // A worker legitimately can split a day across two jobs, so this is a soft
  // warning shown before the request fires, not a hard block.
  const [workerWarning, setWorkerWarning] = useState<string | null>(null);
  const [deletingWorkerId, setDeletingWorkerId] = useState<string | null>(null);
  const [reassigningWorkerId, setReassigningWorkerId] = useState<string | null>(null);

  // Duplicates this same day's assignment onto whichever other days get
  // picked on the mini calendar below — not necessarily consecutive or a
  // weekly pattern, just an explicit set of extra days. Once a series is
  // created in this modal (either by assigning a supervisor or adding a
  // worker while this is open), activeSeriesId is reused so later adds in
  // the same session join the same series instead of creating a new one.
  const [repeatOpen, setRepeatOpen] = useState(false);
  const [pickedKeys, setPickedKeys] = useState<Set<string>>(new Set());
  const [activeSeriesId, setActiveSeriesId] = useState<string | null>(null);

  // Task details (SOV/scope/CO tags) and crew are both closed by default —
  // only "who's covering this day" (project/CO, supervisor, PM, time) shows
  // right away. Each section's toggle button shows a summary of what's
  // already set even while closed, see CollapsibleField above.
  const [taskDetailsOpen, setTaskDetailsOpen] = useState(false);
  const [crewOpen, setCrewOpen] = useState(false);

  const filteredProjects = projectQuery.trim()
    ? projects.filter((p) => matchesSearchQuery(p.jobTitle, projectQuery))
    : projects;

  // Matches on the CO's own title or its parent project's, so searching
  // "Brightview" finds every open CO on that job even if their titles don't
  // mention it.
  const filteredCos = coQuery.trim()
    ? changeOrderOptions.filter((co) => matchesSearchQuery(`${co.title} ${co.projectTitle}`, coQuery))
    : changeOrderOptions;
  const selectedCo = changeOrderOptions.find((co) => co.id === coId) ?? null;

  const selectedProject = projects.find((p) => p.id === projectId) ?? null;
  const selectedGroup = selectedProject ? calendarSegmentGroup(selectedProject.segment) : null;
  // Restrict to what was actually contracted for this unit (e.g. only
  // "Clean"/"Paint" if that's all it has), then drop anything already
  // marked complete, a finished item can't go back on the calendar. Falls
  // back to every category when there's no linked TurnoverRequest to
  // restrict against.
  const availableScopeOptions = (
    selectedProject?.contractedScopeItems
      ? TURNOVER_SCOPE_OPTIONS.filter((opt) => selectedProject.contractedScopeItems!.includes(opt.value))
      : TURNOVER_SCOPE_OPTIONS
  ).filter((opt) => !selectedProject?.completedScopeItems.includes(opt.value));

  // What a single crew member being added to the *selected* project could
  // be split onto — only meaningful once 2+ things are picked in Task
  // details, see scopeSplitOptions.
  const splitOptions = scopeSplitOptions(selectedGroup, selectedProject, sovPicks, scopePicks);

  const filteredEmployees = employeeQuery.trim()
    ? employees.filter((e) => matchesSearchQuery(e.displayName, employeeQuery))
    : employees;
  const filteredContractors = contractorQuery.trim()
    ? contractors.filter((c) => matchesSearchQuery(c.displayName, contractorQuery))
    : contractors;

  const allDateKeys = pickedKeys.size > 0 ? [...new Set([dateKey, ...pickedKeys])].sort() : null;

  // Whether there's anything to show under "Task details" at all for the
  // current project — same three cases (SOV items, turnover scope, tagged
  // change orders) the section's contents branch on below.
  const showTaskDetails =
    targetMode === "project" &&
    !!selectedProject &&
    (selectedGroup === "POST_CONSTRUCTION" ||
      (selectedGroup === "JANITORIAL_TURNOVER_REQUESTS" && availableScopeOptions.length > 0) ||
      selectedProject.changeOrders.length > 0);

  const taskDetailsSummary = !selectedProject
    ? ""
    : (() => {
        const parts: string[] = [];
        if (selectedGroup === "POST_CONSTRUCTION") {
          if (sovPicks.length > 0) parts.push(`${sovPicks.length} SOV item${sovPicks.length === 1 ? "" : "s"} picked`);
          else if (comment.trim()) parts.push("note added");
        }
        if (selectedGroup === "JANITORIAL_TURNOVER_REQUESTS" && scopePicks.length > 0) {
          parts.push(`${scopePicks.length} task${scopePicks.length === 1 ? "" : "s"} picked`);
        }
        if (coPicks.length > 0) parts.push(`${coPicks.length} change order${coPicks.length === 1 ? "" : "s"} tagged`);
        return parts.length > 0 ? parts.join(", ") : "not set yet";
      })();

  const crewCount = targetMode === "co" ? existingCoWorkers.length : existingWorkers.length;
  const crewSummary = crewCount > 0 ? `${crewCount} worker${crewCount === 1 ? "" : "s"} scheduled` : "none yet";

  function toggleDuplicateDay(k: string) {
    if (k === dateKey) return; // the anchor day is always included, not toggleable
    setPickedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!projectId) {
      setError("Pick a project");
      return;
    }
    // Supervisor/PM/SOV/scope/CO/comment are all optional. Saving with none
    // of them still puts the project on the calendar for this day, just
    // flagged with a "no supervisor assigned" warning until one's added.
    if ((startTime && !endTime) || (endTime && !startTime)) {
      setError("Set both a start and end time, or leave both blank for an all-day event");
      return;
    }
    if (startTime && endTime && endTime <= startTime) {
      setError("End time must be after start time");
      return;
    }
    setSaving(true);
    try {
      const usingSeries = !!allDateKeys;
      const res = await fetch("/api/erp/schedule/day-assignments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId,
          supervisorUserId: supervisorUserId || undefined,
          projectManagerUserId: projectManagerUserId || undefined,
          supervisorContractorId: supervisorContractorId || undefined,
          date: dateKey,
          startTime: startTime || undefined,
          endTime: endTime || undefined,
          sovItemIds: sovPicks.length > 0 ? sovPicks : undefined,
          scopeItems: scopePicks.length > 0 ? scopePicks : undefined,
          changeOrderIds: coPicks.length > 0 ? coPicks : undefined,
          comment: comment.trim() || undefined,
          ...(usingSeries ? { dates: allDateKeys } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        id?: string;
        seriesId?: string;
        assignments?: { id: string }[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Failed to assign");
      if (usingSeries && allDateKeys && data.seriesId && data.assignments) {
        setActiveSeriesId(data.seriesId);
        onSeriesCreated(
          data.assignments.map((a, i) => ({
            id: a.id,
            projectId,
            dateKey: allDateKeys[i]!,
            supervisorUserId: supervisorUserId || null,
            projectManagerUserId: projectManagerUserId || null,
            supervisorContractorId: supervisorContractorId || null,
            startTime: startTime || null,
            endTime: endTime || null,
            seriesId: data.seriesId!,
            sovItemIds: sovPicks,
            scopeItems: scopePicks,
            changeOrderIds: coPicks,
            comment: comment.trim() || null,
          }))
        );
      } else if (data.id) {
        onCreated({
          id: data.id,
          projectId,
          dateKey,
          supervisorUserId: supervisorUserId || null,
          projectManagerUserId: projectManagerUserId || null,
          supervisorContractorId: supervisorContractorId || null,
          startTime: startTime || null,
          endTime: endTime || null,
          seriesId: null,
          sovItemIds: sovPicks,
          scopeItems: scopePicks,
          changeOrderIds: coPicks,
          comment: comment.trim() || null,
        });
      }
      setProjectId("");
      setProjectQuery("");
      setSupervisorUserId("");
      setProjectManagerUserId("");
      setSupervisorContractorId("");
      setStartTime("");
      setSovPicks([]);
      setScopePicks([]);
      setCoPicks([]);
      setComment("");
      setEndTime("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign");
    } finally {
      setSaving(false);
    }
  }

  // Same idea as handleAssign above, but posts a ChangeOrderDayAssignment
  // instead — no repeat/duplicate or SOV/scope pickers, COs are assigned one
  // day at a time for now (see co-day-assignments route).
  async function handleAssignCo(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!coId) {
      setError("Pick a change order");
      return;
    }
    if ((startTime && !endTime) || (endTime && !startTime)) {
      setError("Set both a start and end time, or leave both blank for an all-day event");
      return;
    }
    if (startTime && endTime && endTime <= startTime) {
      setError("End time must be after start time");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/erp/schedule/co-day-assignments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          changeOrderId: coId,
          supervisorUserId: supervisorUserId || undefined,
          projectManagerUserId: projectManagerUserId || undefined,
          supervisorContractorId: supervisorContractorId || undefined,
          date: dateKey,
          startTime: startTime || undefined,
          endTime: endTime || undefined,
          comment: comment.trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !data.id) throw new Error(data.error || "Failed to assign");
      onCoCreated({
        id: data.id,
        changeOrderId: coId,
        dateKey,
        supervisorUserId: supervisorUserId || null,
        projectManagerUserId: projectManagerUserId || null,
        supervisorContractorId: supervisorContractorId || null,
        startTime: startTime || null,
        endTime: endTime || null,
        comment: comment.trim() || null,
      });
      setCoId("");
      setCoQuery("");
      setSupervisorUserId("");
      setProjectManagerUserId("");
      setSupervisorContractorId("");
      setStartTime("");
      setComment("");
      setEndTime("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteSeries(seriesId: string) {
    setDeletingSeriesId(seriesId);
    try {
      const res = await fetch(`/api/erp/schedule/series/${seriesId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to remove");
      onSeriesDeleted(seriesId);
      if (activeSeriesId === seriesId) setActiveSeriesId(null);
    } catch {
      // leave it in place; user can retry
    } finally {
      setDeletingSeriesId(null);
    }
  }

  async function handleAddWorker(force = false) {
    setWorkerError("");
    const workerId = workerType === "employee" ? employeeId : contractorId;
    if (!workerId) {
      setWorkerError(workerType === "employee" ? "Pick a worker" : "Pick a contractor");
      return;
    }

    if (targetMode === "co") {
      if (!coId) {
        setWorkerError("Pick a change order above first");
        return;
      }
      setWorkerWarning(null);
      setAddingWorker(true);
      try {
        const res = await fetch("/api/erp/schedule/co-worker-assignments", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            changeOrderId: coId,
            employeeId: workerType === "employee" ? workerId : undefined,
            contractorId: workerType === "contractor" ? workerId : undefined,
            date: dateKey,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
        if (!res.ok || !data.id) throw new Error(data.error || "Failed to assign worker");
        onCoWorkerCreated({
          id: data.id,
          changeOrderId: coId,
          employeeId: workerType === "employee" ? workerId : null,
          contractorId: workerType === "contractor" ? workerId : null,
          dateKey,
        });
        setEmployeeId("");
        setEmployeeQuery("");
        setContractorId("");
        setContractorQuery("");
      } catch (err) {
        setWorkerError(err instanceof Error ? err.message : "Failed to assign worker");
      } finally {
        setAddingWorker(false);
      }
      return;
    }

    if (!projectId) {
      setWorkerError("Pick a project above first");
      return;
    }
    // With 2+ scopes picked for this project's day (e.g. painting and
    // cleaning both scheduled), each worker needs to be tagged with which
    // one they're covering — with only one (or none), everyone added lands
    // on it automatically, no pick needed. See scopeSplitOptions.
    if (splitOptions.length > 1 && !workerScopePick) {
      setWorkerError("Pick which of today's scopes this worker is covering");
      return;
    }
    const soleOption = splitOptions.length === 1 ? splitOptions[0]!.id : null;
    const scopePick = splitOptions.length > 1 ? workerScopePick : soleOption;
    const assignedSovItemId = selectedGroup === "POST_CONSTRUCTION" ? scopePick : null;
    const assignedScopeItem = selectedGroup === "JANITORIAL_TURNOVER_REQUESTS" ? scopePick : null;
    if (!force) {
      const conflicts = existingWorkers.filter((w) => {
        if (w.projectId === projectId) return false;
        return workerType === "employee" ? w.employeeId === workerId : w.contractorId === workerId;
      });
      if (conflicts.length > 0) {
        const names = conflicts
          .map((c) => projects.find((p) => p.id === c.projectId)?.jobTitle ?? "another project")
          .join(", ");
        setWorkerWarning(`Already scheduled on ${names} this day — add anyway?`);
        return;
      }
    }
    setWorkerWarning(null);
    setAddingWorker(true);
    try {
      const usingSeries = !!(activeSeriesId || allDateKeys);
      const res = await fetch("/api/erp/schedule/worker-assignments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId,
          employeeId: workerType === "employee" ? workerId : undefined,
          contractorId: workerType === "contractor" ? workerId : undefined,
          date: dateKey,
          assignedSovItemId,
          assignedScopeItem,
          ...(usingSeries
            ? activeSeriesId
              ? { seriesId: activeSeriesId }
              : { dates: allDateKeys }
            : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        id?: string;
        seriesId?: string;
        assignments?: { id: string }[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Failed to assign worker");
      if (usingSeries && allDateKeys && data.seriesId && data.assignments) {
        setActiveSeriesId(data.seriesId);
        onWorkerSeriesCreated(
          data.assignments.map((a, i) => ({
            id: a.id,
            projectId,
            employeeId: workerType === "employee" ? workerId : null,
            contractorId: workerType === "contractor" ? workerId : null,
            dateKey: allDateKeys[i]!,
            seriesId: data.seriesId!,
            assignedSovItemId,
            assignedScopeItem,
          }))
        );
      } else if (data.id) {
        onWorkerCreated({
          id: data.id,
          projectId,
          employeeId: workerType === "employee" ? workerId : null,
          contractorId: workerType === "contractor" ? workerId : null,
          dateKey,
          seriesId: null,
          assignedSovItemId,
          assignedScopeItem,
        });
      }
      setEmployeeId("");
      setEmployeeQuery("");
      setContractorId("");
      setContractorQuery("");
      setWorkerScopePick("");
    } catch (err) {
      setWorkerError(err instanceof Error ? err.message : "Failed to assign worker");
    } finally {
      setAddingWorker(false);
    }
  }

  // Reassigns which scope an already-added worker covers, via the dropdown
  // next to their name in the crew list — e.g. the day's scope was split
  // after the crew was already added. Only offered for workers on the
  // currently selected project, see the crew list render below.
  async function handleReassignWorker(w: ScheduleWorkerAssignment, group: CalendarSegmentGroup | null, scopeId: string | null) {
    setReassigningWorkerId(w.id);
    try {
      const res = await fetch(`/api/erp/schedule/worker-assignments/${w.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(group === "POST_CONSTRUCTION" ? { assignedSovItemId: scopeId } : {}),
          ...(group === "JANITORIAL_TURNOVER_REQUESTS" ? { assignedScopeItem: scopeId } : {}),
        }),
      });
      if (!res.ok) throw new Error("Failed to reassign");
      onWorkerUpdated({
        ...w,
        assignedSovItemId: group === "POST_CONSTRUCTION" ? scopeId : w.assignedSovItemId,
        assignedScopeItem: group === "JANITORIAL_TURNOVER_REQUESTS" ? scopeId : w.assignedScopeItem,
      });
    } catch {
      // leave it in place; user can retry
    } finally {
      setReassigningWorkerId(null);
    }
  }

  async function handleDeleteWorker(id: string) {
    setDeletingWorkerId(id);
    try {
      const res = await fetch(`/api/erp/schedule/worker-assignments/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to remove");
      onWorkerDeleted(id);
    } catch {
      // leave it in place; user can retry
    } finally {
      setDeletingWorkerId(null);
    }
  }

  async function handleDeleteCoWorker(id: string) {
    setDeletingWorkerId(id);
    try {
      const res = await fetch(`/api/erp/schedule/co-worker-assignments/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to remove");
      onCoWorkerDeleted(id);
    } catch {
      // leave it in place; user can retry
    } finally {
      setDeletingWorkerId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col rounded-lg border border-gray-200 bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-gray-100 p-6 pb-4">
          <h2 className="text-lg font-semibold text-gray-900">Assign to this day</h2>
          <p className="mt-1 text-sm text-gray-500">{dayCellLabelWithYear(dateKey)}</p>
        </div>
        <div className="min-h-0 overflow-y-auto p-6 pt-4">
        <div className="flex gap-1 rounded border border-gray-200 bg-gray-50 p-1">
          <button
            type="button"
            onClick={() => {
              setTargetMode("project");
              setError("");
              setSupervisorUserId("");
              setProjectManagerUserId("");
              setSupervisorContractorId("");
              setStartTime("");
              setEndTime("");
              setComment("");
            }}
            className={`flex-1 rounded px-2 py-1 text-xs font-medium ${
              targetMode === "project" ? "bg-white text-pink-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Project
          </button>
          <button
            type="button"
            onClick={() => {
              setTargetMode("co");
              setError("");
              setProjectId("");
              setProjectQuery("");
              setSovPicks([]);
              setScopePicks([]);
              setCoPicks([]);
              setWorkerScopePick("");
              setSupervisorUserId("");
              setProjectManagerUserId("");
              setSupervisorContractorId("");
              setStartTime("");
              setEndTime("");
              setComment("");
            }}
            className={`flex-1 rounded px-2 py-1 text-xs font-medium ${
              targetMode === "co" ? "bg-white text-pink-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Change order
          </button>
        </div>
        <form onSubmit={targetMode === "co" ? handleAssignCo : handleAssign} className="mt-3 space-y-3">
          {targetMode === "co" ? (
            <div>
              <label className="block text-xs font-medium text-gray-600">Change order</label>
              <input
                type="text"
                value={coId ? `${selectedCo?.title ?? ""} (${selectedCo?.projectTitle ?? ""})` : coQuery}
                onChange={(e) => {
                  setCoQuery(e.target.value);
                  setCoId("");
                }}
                placeholder="Search change orders..."
                className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 placeholder-gray-400"
              />
              {coQuery && !coId ? (
                <div className="mt-1 max-h-40 overflow-auto rounded border border-gray-200 bg-white shadow-sm">
                  {filteredCos.slice(0, 8).map((co) => (
                    <button
                      key={co.id}
                      type="button"
                      onClick={() => {
                        setCoId(co.id);
                        setCoQuery(co.title);
                        setComment("");
                      }}
                      className="block w-full truncate px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-pink-50"
                      title={`${co.title} — ${co.projectTitle}`}
                    >
                      <span className="font-medium">{co.title}</span>
                      <span className="text-gray-400"> — {co.projectTitle}</span>
                    </button>
                  ))}
                  {filteredCos.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-gray-400">No matching change orders</div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
          <div>
            <label className="block text-xs font-medium text-gray-600">Project</label>
            <input
              type="text"
              value={projectId ? projects.find((p) => p.id === projectId)?.jobTitle ?? "" : projectQuery}
              onChange={(e) => {
                setProjectQuery(e.target.value);
                setProjectId("");
              }}
              placeholder="Search projects..."
              className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 placeholder-gray-400"
            />
            {projectQuery && !projectId ? (
              <div className="mt-1 max-h-40 overflow-auto rounded border border-gray-200 bg-white shadow-sm">
                {filteredProjects.slice(0, 8).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setProjectId(p.id);
                      setProjectQuery(p.jobTitle);
                      setSovPicks([]);
                      setScopePicks([]);
                      setCoPicks([]);
                      setWorkerScopePick("");
                      setComment("");
                    }}
                    className="block w-full truncate px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-pink-50"
                    title={p.jobTitle}
                  >
                    {p.jobTitle}
                  </button>
                ))}
                {filteredProjects.length === 0 ? (
                  <div className="px-2 py-1.5 text-xs text-gray-400">No matching projects</div>
                ) : null}
              </div>
            ) : null}
          </div>
          )}

          {showTaskDetails && selectedProject ? (
            <CollapsibleField
              label="Task details"
              summary={taskDetailsSummary}
              open={taskDetailsOpen}
              onToggle={() => setTaskDetailsOpen((v) => !v)}
            >
              {selectedGroup === "POST_CONSTRUCTION" ? (
                <div>
                  <label className="block text-xs font-medium text-gray-600">SOV item(s) being worked on</label>
                  <div className="mt-1">
                    {selectedProject.sovItems.length > 0 ? (
                      <SOVMultiCombobox sovItems={selectedProject.sovItems} selectedIds={sovPicks} onChange={setSovPicks} />
                    ) : (
                      <div>
                        <p className="text-xs text-gray-400">No SOV items on this project yet.</p>
                        <textarea
                          value={comment}
                          onChange={(e) => setComment(e.target.value)}
                          placeholder="Describe what's being worked on this day..."
                          rows={2}
                          className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 placeholder-gray-400"
                        />
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

              {selectedGroup === "JANITORIAL_TURNOVER_REQUESTS" && availableScopeOptions.length > 0 ? (
                <div>
                  <label className="block text-xs font-medium text-gray-600">Scope covered this day</label>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {availableScopeOptions.map((opt) => {
                      const active = scopePicks.includes(opt.value);
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() =>
                            setScopePicks((prev) =>
                              prev.includes(opt.value) ? prev.filter((v) => v !== opt.value) : [...prev, opt.value]
                            )
                          }
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
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

              {selectedProject.changeOrders.length > 0 ? (
                <div>
                  <label className="block text-xs font-medium text-gray-600">Change order(s) covered this day</label>
                  <p className="mt-0.5 text-[11px] text-gray-400">
                    Leave unchecked for plain project-scope work.
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {selectedProject.changeOrders.map((co) => {
                      const active = coPicks.includes(co.id);
                      return (
                        <button
                          key={co.id}
                          type="button"
                          onClick={() =>
                            setCoPicks((prev) =>
                              prev.includes(co.id) ? prev.filter((v) => v !== co.id) : [...prev, co.id]
                            )
                          }
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
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
            </CollapsibleField>
          ) : null}

          <div>
            <label className="block text-xs font-medium text-gray-600">Supervisor</label>
            <SearchableSelect
              value={supervisorUserId}
              onChange={setSupervisorUserId}
              options={supervisors.map((s) => ({ value: s.id, label: s.displayName }))}
              placeholder="Search supervisors…"
              allLabel="Select a supervisor..."
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-600">PM (if no supervisor)</label>
              <SearchableSelect
                value={projectManagerUserId}
                onChange={setProjectManagerUserId}
                options={projectManagers.map((p) => ({ value: p.id, label: p.displayName }))}
                placeholder="Search PMs…"
                allLabel="None"
                className="mt-1"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600">Contractor (if no supervisor)</label>
              <SearchableSelect
                value={supervisorContractorId}
                onChange={setSupervisorContractorId}
                options={contractors.map((c) => ({ value: c.id, label: c.displayName }))}
                placeholder="Search contractors…"
                allLabel="None"
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600">Time (optional — leave blank for all-day)</label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900"
              />
              <span className="text-xs text-gray-400">to</span>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900"
              />
            </div>
          </div>

          {targetMode === "project" ? (
            <CollapsibleField
              label="Duplicate to more days"
              summary={pickedKeys.size === 0 ? "not set" : `${allDateKeys!.length} days`}
              open={repeatOpen}
              onToggle={() => setRepeatOpen((v) => !v)}
            >
              <MiniCalendarPicker
                selectedKeys={new Set([dateKey, ...pickedKeys])}
                onToggle={toggleDuplicateDay}
                minDateKey={dateKey}
                initialMonthAnchor={dateKey}
              />
              <p className="text-xs text-gray-500">
                {pickedKeys.size === 0
                  ? "This day is always included — tap more days to also duplicate onto, they don't need to be in a row."
                  : `Duplicates to ${allDateKeys!.length} days: ${allDateKeys!.join(", ")}`}
              </p>
            </CollapsibleField>
          ) : (
            <p className="text-[11px] text-gray-400">
              Change orders are assigned one day at a time for now — repeat scheduling isn&apos;t available here yet.
            </p>
          )}

          {error ? (
            <div className="rounded border border-red-300 bg-red-50 p-2 text-xs text-red-600">{error}</div>
          ) : null}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded bg-pink-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-pink-500 disabled:opacity-50"
            >
              {saving ? "Assigning..." : "Assign"}
            </button>
          </div>
        </form>

        <div className="mt-4 border-t border-gray-100 pt-4">
        <CollapsibleField
          label="Crew for this day"
          summary={crewSummary}
          open={crewOpen}
          onToggle={() => setCrewOpen((v) => !v)}
        >
          {targetMode === "co" ? (
            existingCoWorkers.length > 0 ? (
              <ul className="space-y-1.5">
                {existingCoWorkers.map((w) => {
                  const co = changeOrderOptions.find((c) => c.id === w.changeOrderId);
                  const employee = w.employeeId ? employees.find((e) => e.id === w.employeeId) : null;
                  const contractor = w.contractorId ? contractors.find((c) => c.id === w.contractorId) : null;
                  const worker = employee ?? contractor;
                  const workerLabel = employee
                    ? employee.displayName
                    : contractor
                    ? `${contractor.displayName} (contractor)`
                    : "Unknown worker";
                  const noEmail = !!worker && !worker.email;
                  return (
                    <li
                      key={w.id}
                      className="flex items-center justify-between gap-2 rounded border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs"
                    >
                      <span className="truncate" title={co?.title}>
                        <span className="font-medium text-gray-800">{co?.title ?? "Unknown change order"}</span>
                        <span className="text-gray-500"> — {workerLabel}</span>
                        {noEmail ? (
                          <span className="text-gray-400" title="No email on file — didn't get a schedule invite">
                            {" "}
                            (no email)
                          </span>
                        ) : null}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteCoWorker(w.id)}
                        disabled={deletingWorkerId === w.id}
                        className="shrink-0 text-gray-400 hover:text-red-500 disabled:opacity-50"
                      >
                        ×
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-xs text-gray-400">No workers scheduled yet for this day.</p>
            )
          ) : existingWorkers.length > 0 ? (
            <ul className="space-y-1.5">
              {existingWorkers.map((w) => {
                const project = projects.find((p) => p.id === w.projectId);
                const employee = w.employeeId ? employees.find((e) => e.id === w.employeeId) : null;
                const contractor = w.contractorId ? contractors.find((c) => c.id === w.contractorId) : null;
                const workerLabel = employee
                  ? employee.displayName
                  : contractor
                  ? `${contractor.displayName} (contractor)`
                  : "Unknown worker";
                const noEmail = !!(employee ?? contractor) && !(employee ?? contractor)?.email;
                // Scope reassignment is only offered for the project
                // currently selected above (splitOptions reflects live
                // Task details picks for that one project) — other rows
                // just show a best-effort label from their own project.
                const isSelectedProject = w.projectId === projectId;
                const rowGroup = project ? calendarSegmentGroup(project.segment) : null;
                const assignedId = rowGroup === "POST_CONSTRUCTION" ? w.assignedSovItemId : w.assignedScopeItem;
                const assignedLabel =
                  rowGroup === "POST_CONSTRUCTION"
                    ? project?.sovItems.find((s) => s.id === assignedId)?.description ?? null
                    : assignedId
                    ? turnoverScopeLabel(assignedId)
                    : null;
                return (
                  <li
                    key={w.id}
                    className="flex items-center justify-between gap-2 rounded border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs"
                  >
                    <span className="truncate" title={project?.jobTitle}>
                      <span className="font-medium text-gray-800">{project?.jobTitle ?? "Unknown project"}</span>
                      <span className="text-gray-500"> — {workerLabel}</span>
                      {noEmail ? (
                        <span className="text-gray-400" title="No email on file — didn't get a schedule invite">
                          {" "}
                          (no email)
                        </span>
                      ) : null}
                      {w.seriesId ? <span className="text-gray-400"> · repeating</span> : null}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {isSelectedProject && splitOptions.length > 1 ? (
                        <select
                          value={assignedId ?? ""}
                          onChange={(e) => handleReassignWorker(w, rowGroup, e.target.value || null)}
                          disabled={reassigningWorkerId === w.id}
                          title="Which scope this worker is covering"
                          className="max-w-[90px] rounded border border-gray-300 bg-white px-1 py-0.5 text-[10px] text-gray-700"
                        >
                          <option value="">— unassigned —</option>
                          {splitOptions.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      ) : assignedLabel ? (
                        <span className="truncate rounded-full bg-pink-100 px-1.5 py-0.5 text-[10px] font-medium text-pink-700">
                          {assignedLabel}
                        </span>
                      ) : null}
                      {w.seriesId ? (
                        <button
                          type="button"
                          onClick={() => handleDeleteSeries(w.seriesId!)}
                          disabled={deletingSeriesId === w.seriesId}
                          title="Remove every day in this repeating series"
                          className="text-[10px] font-medium text-gray-400 hover:text-red-500 disabled:opacity-50"
                        >
                          remove all
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => handleDeleteWorker(w.id)}
                        disabled={deletingWorkerId === w.id}
                        className="text-gray-400 hover:text-red-500 disabled:opacity-50"
                      >
                        ×
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-xs text-gray-400">No workers scheduled yet for this day.</p>
          )}

          <p className="text-[11px] text-gray-400">
            Uses the {targetMode === "co" ? "change order" : "project"} selected above. Not emailed — for planning only.
          </p>

          {targetMode === "project" && splitOptions.length > 1 ? (
            <div>
              <label className="block text-[11px] font-medium text-gray-600">Next worker covers</label>
              <select
                value={workerScopePick}
                onChange={(e) => setWorkerScopePick(e.target.value)}
                className="mt-0.5 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900"
              >
                <option value="">Covering which scope?</option>
                {splitOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => {
                setWorkerType("employee");
                setWorkerWarning(null);
              }}
              className={`rounded px-2 py-1 text-[11px] font-medium ${
                workerType === "employee" ? "bg-gray-700 text-white" : "border border-gray-300 text-gray-600 hover:border-gray-400"
              }`}
            >
              Employee
            </button>
            <button
              type="button"
              onClick={() => {
                setWorkerType("contractor");
                setWorkerWarning(null);
              }}
              className={`rounded px-2 py-1 text-[11px] font-medium ${
                workerType === "contractor" ? "bg-gray-700 text-white" : "border border-gray-300 text-gray-600 hover:border-gray-400"
              }`}
            >
              Contractor
            </button>
          </div>

          <div className="mt-1.5 flex gap-2">
            {workerType === "employee" ? (
              <div className="relative flex-1">
                <input
                  type="text"
                  value={employeeId ? employees.find((e) => e.id === employeeId)?.displayName ?? "" : employeeQuery}
                  onChange={(e) => {
                    setEmployeeQuery(e.target.value);
                    setEmployeeId("");
                    setWorkerWarning(null);
                  }}
                  placeholder="Search workers..."
                  className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 placeholder-gray-400"
                />
                {employeeQuery && !employeeId ? (
                  <div className="absolute z-10 mt-1 max-h-40 w-full overflow-auto rounded border border-gray-200 bg-white shadow-sm">
                    {filteredEmployees.slice(0, 8).map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => {
                          setEmployeeId(e.id);
                          setEmployeeQuery(e.displayName);
                        }}
                        className="block w-full truncate px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-pink-50"
                      >
                        {e.displayName}
                        {!e.email ? <span className="text-gray-400"> (no email)</span> : null}
                      </button>
                    ))}
                    {filteredEmployees.length === 0 ? (
                      <div className="px-2 py-1.5 text-xs text-gray-400">No matching workers</div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="relative flex-1">
                <input
                  type="text"
                  value={contractorId ? contractors.find((c) => c.id === contractorId)?.displayName ?? "" : contractorQuery}
                  onChange={(e) => {
                    setContractorQuery(e.target.value);
                    setContractorId("");
                    setWorkerWarning(null);
                  }}
                  placeholder="Search contractors..."
                  className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 placeholder-gray-400"
                />
                {contractorQuery && !contractorId ? (
                  <div className="absolute z-10 mt-1 max-h-40 w-full overflow-auto rounded border border-gray-200 bg-white shadow-sm">
                    {filteredContractors.slice(0, 8).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setContractorId(c.id);
                          setContractorQuery(c.displayName);
                        }}
                        className="block w-full truncate px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-pink-50"
                      >
                        {c.displayName}
                        {!c.email ? <span className="text-gray-400"> (no email)</span> : null}
                      </button>
                    ))}
                    {filteredContractors.length === 0 ? (
                      <div className="px-2 py-1.5 text-xs text-gray-400">No matching contractors</div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}
            <button
              type="button"
              onClick={() => handleAddWorker()}
              disabled={addingWorker}
              className="shrink-0 rounded bg-gray-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-600 disabled:opacity-50"
            >
              {addingWorker ? "Adding..." : "Add"}
            </button>
          </div>
          {workerWarning ? (
            <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
              <p>⚠ {workerWarning}</p>
              <button
                type="button"
                onClick={() => handleAddWorker(true)}
                className="mt-1 font-semibold underline hover:no-underline"
              >
                Add anyway
              </button>
            </div>
          ) : null}
          {workerError ? (
            <div className="mt-2 rounded border border-red-300 bg-red-50 p-2 text-xs text-red-600">{workerError}</div>
          ) : null}
        </CollapsibleField>
        </div>
        </div>
      </div>
    </div>
  );
}
