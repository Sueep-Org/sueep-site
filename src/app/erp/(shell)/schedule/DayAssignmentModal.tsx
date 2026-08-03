"use client";

import { useState } from "react";
import type { ScheduleDayAssignment, ScheduleWorkerAssignment } from "@/lib/erp/schedule";
import { computeSeriesDates, SeriesDateRangeError } from "@/lib/erp/scheduleSeries";
import { calendarSegmentGroup } from "@/lib/erp/projectSegments";
import { TURNOVER_SCOPE_OPTIONS } from "@/lib/erp/turnoverScope";
import { SOVMultiCombobox, type SOVItemOption } from "@/app/erp/components/SOVCombobox";

type ProjectOption = {
  id: string;
  jobTitle: string;
  segment: string;
  sovItems: SOVItemOption[];
  contractedScopeItems: string[] | null;
  changeOrders: { id: string; title: string }[];
};
type Person = { id: string; displayName: string };

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function dateLabel(dateKey: string): string {
  return new Date(`${dateKey}T00:00:00.000Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h! >= 12 ? "PM" : "AM";
  const hour12 = h! % 12 === 0 ? 12 : h! % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

function formatTimeRange(startTime: string | null, endTime: string | null): string | null {
  if (!startTime || !endTime) return null;
  return `${formatTime(startTime)}–${formatTime(endTime)}`;
}

export function DayAssignmentModal({
  dateKey,
  projects,
  supervisors,
  projectManagers,
  employees,
  contractors,
  existing,
  existingWorkers,
  initialProjectId,
  onClose,
  onCreated,
  onSeriesCreated,
  onDeleted,
  onSeriesDeleted,
  onWorkerCreated,
  onWorkerSeriesCreated,
  onWorkerDeleted,
}: {
  dateKey: string;
  projects: ProjectOption[];
  supervisors: Person[];
  projectManagers: Person[];
  employees: Person[];
  contractors: Person[];
  existing: ScheduleDayAssignment[];
  existingWorkers: ScheduleWorkerAssignment[];
  /** Pre-selects a project — e.g. jumping here from the "needs a supervisor" alert chip for a specific project. */
  initialProjectId?: string;
  onClose: () => void;
  onCreated: (assignment: ScheduleDayAssignment) => void;
  /** Fired instead of onCreated when a repeat/range is active, one row per generated day. */
  onSeriesCreated: (assignments: ScheduleDayAssignment[]) => void;
  onDeleted: (id: string) => void;
  /** Fired when a whole repeating series (every day it generated) is removed. */
  onSeriesDeleted: (seriesId: string) => void;
  onWorkerCreated: (assignment: ScheduleWorkerAssignment) => void;
  /** Fired instead of onWorkerCreated when a repeat/range is active, one row per generated day. */
  onWorkerSeriesCreated: (assignments: ScheduleWorkerAssignment[]) => void;
  onWorkerDeleted: (id: string) => void;
}) {
  const [projectId, setProjectId] = useState(initialProjectId ?? "");
  const [projectQuery, setProjectQuery] = useState(
    () => projects.find((p) => p.id === initialProjectId)?.jobTitle ?? ""
  );
  const [supervisorUserId, setSupervisorUserId] = useState("");
  // Rare case: only the PM is on site that day, no supervisor. At least one
  // of supervisorUserId/projectManagerUserId is required to submit.
  const [projectManagerUserId, setProjectManagerUserId] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  // Post-Construction: which SOV line item(s) this day's work is for.
  const [sovPicks, setSovPicks] = useState<string[]>([]);
  // Janitorial: which scope categories (clean, paint, etc.) this day covers.
  const [scopePicks, setScopePicks] = useState<string[]>([]);
  // Which change order(s), if any, this day's work is for — lets a CO be
  // scheduled on a day between its start/end, not just those two days.
  const [coPicks, setCoPicks] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingSeriesId, setDeletingSeriesId] = useState<string | null>(null);

  // Workers scheduled: either an Employee or a Contractor, picked via the
  // toggle below. Kept as separate id/query state per type so switching the
  // toggle doesn't lose whichever search was in progress on the other one.
  const [workerType, setWorkerType] = useState<"employee" | "contractor">("employee");
  const [employeeId, setEmployeeId] = useState("");
  const [employeeQuery, setEmployeeQuery] = useState("");
  const [contractorId, setContractorId] = useState("");
  const [contractorQuery, setContractorQuery] = useState("");
  const [addingWorker, setAddingWorker] = useState(false);
  const [workerError, setWorkerError] = useState("");
  // A worker legitimately can split a day across two jobs, so this is a soft
  // warning shown before the request fires, not a hard block.
  const [workerWarning, setWorkerWarning] = useState<string | null>(null);
  const [deletingWorkerId, setDeletingWorkerId] = useState<string | null>(null);

  // A multi-day range and a weekly repeat are the same control here: pick
  // which weekdays to include and an end date. A Mon-Fri job just means
  // checking every weekday in between; "every Monday for 8 weeks" means
  // checking only Monday. Once a series is created in this modal (either by
  // assigning a supervisor or adding a worker while this is open),
  // activeSeriesId is reused so later adds in the same session join the
  // same series instead of creating a new one each time.
  const [repeatOpen, setRepeatOpen] = useState(false);
  const [repeatDays, setRepeatDays] = useState<number[]>(() => [new Date(`${dateKey}T00:00:00.000Z`).getUTCDay()]);
  const [repeatUntil, setRepeatUntil] = useState("");
  const [activeSeriesId, setActiveSeriesId] = useState<string | null>(null);

  const filteredProjects = projectQuery.trim()
    ? projects.filter((p) => p.jobTitle.toLowerCase().includes(projectQuery.toLowerCase()))
    : projects;

  const selectedProject = projects.find((p) => p.id === projectId) ?? null;
  const selectedGroup = selectedProject ? calendarSegmentGroup(selectedProject.segment) : null;
  // Restrict to what was actually contracted for this unit (e.g. only
  // "Clean"/"Paint" if that's all it has) — falls back to every category
  // when there's no linked TurnoverRequest to restrict against.
  const availableScopeOptions = selectedProject?.contractedScopeItems
    ? TURNOVER_SCOPE_OPTIONS.filter((opt) => selectedProject.contractedScopeItems!.includes(opt.value))
    : TURNOVER_SCOPE_OPTIONS;

  const filteredEmployees = employeeQuery.trim()
    ? employees.filter((e) => e.displayName.toLowerCase().includes(employeeQuery.toLowerCase()))
    : employees;
  const filteredContractors = contractorQuery.trim()
    ? contractors.filter((c) => c.displayName.toLowerCase().includes(contractorQuery.toLowerCase()))
    : contractors;

  function toggleRepeatDay(weekday: number) {
    setRepeatDays((prev) =>
      prev.includes(weekday) ? prev.filter((d) => d !== weekday) : [...prev, weekday].sort((a, b) => a - b)
    );
  }

  let seriesDates: Date[] | null = null;
  let seriesError = "";
  if (repeatOpen && repeatUntil) {
    try {
      seriesDates = computeSeriesDates(new Date(`${dateKey}T00:00:00.000Z`), new Date(`${repeatUntil}T00:00:00.000Z`), repeatDays);
      if (seriesDates.length === 0) seriesError = "No dates in range match the selected days";
    } catch (err) {
      seriesError = err instanceof SeriesDateRangeError ? err.message : "Invalid date range";
    }
  }
  const seriesDateKeys = seriesDates?.map((d) => d.toISOString().slice(0, 10)) ?? null;

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!projectId || (!supervisorUserId && !projectManagerUserId)) {
      setError("Pick a project and a supervisor or PM");
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
    if (repeatOpen && seriesError) {
      setError(seriesError);
      return;
    }
    setSaving(true);
    try {
      const usingSeries = repeatOpen && seriesDateKeys && seriesDateKeys.length > 0;
      const res = await fetch("/api/erp/schedule/day-assignments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId,
          supervisorUserId: supervisorUserId || undefined,
          projectManagerUserId: projectManagerUserId || undefined,
          date: dateKey,
          startTime: startTime || undefined,
          endTime: endTime || undefined,
          sovItemIds: sovPicks.length > 0 ? sovPicks : undefined,
          scopeItems: scopePicks.length > 0 ? scopePicks : undefined,
          changeOrderIds: coPicks.length > 0 ? coPicks : undefined,
          ...(usingSeries ? { repeatUntil, repeatDays } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        id?: string;
        seriesId?: string;
        assignments?: { id: string }[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Failed to assign");
      if (usingSeries && seriesDateKeys && data.seriesId && data.assignments) {
        setActiveSeriesId(data.seriesId);
        onSeriesCreated(
          data.assignments.map((a, i) => ({
            id: a.id,
            projectId,
            dateKey: seriesDateKeys[i]!,
            supervisorUserId: supervisorUserId || null,
            projectManagerUserId: projectManagerUserId || null,
            startTime: startTime || null,
            endTime: endTime || null,
            seriesId: data.seriesId!,
            sovItemIds: sovPicks,
            scopeItems: scopePicks,
            changeOrderIds: coPicks,
          }))
        );
      } else if (data.id) {
        onCreated({
          id: data.id,
          projectId,
          dateKey,
          supervisorUserId: supervisorUserId || null,
          projectManagerUserId: projectManagerUserId || null,
          startTime: startTime || null,
          endTime: endTime || null,
          seriesId: null,
          sovItemIds: sovPicks,
          scopeItems: scopePicks,
          changeOrderIds: coPicks,
        });
      }
      setProjectId("");
      setProjectQuery("");
      setSupervisorUserId("");
      setProjectManagerUserId("");
      setStartTime("");
      setSovPicks([]);
      setScopePicks([]);
      setCoPicks([]);
      setEndTime("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/erp/schedule/day-assignments/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to remove");
      onDeleted(id);
      // The server also clears planned workers for this project/day — mirror
      // that here so the list doesn't show now-deleted worker assignments.
      const deleted = existing.find((a) => a.id === id);
      if (deleted) {
        existingWorkers
          .filter((w) => w.projectId === deleted.projectId && w.dateKey === deleted.dateKey)
          .forEach((w) => onWorkerDeleted(w.id));
      }
    } catch {
      // leave it in place; user can retry
    } finally {
      setDeletingId(null);
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
    if (!projectId) {
      setWorkerError("Pick a project above first");
      return;
    }
    const workerId = workerType === "employee" ? employeeId : contractorId;
    if (!workerId) {
      setWorkerError(workerType === "employee" ? "Pick a worker" : "Pick a contractor");
      return;
    }
    if (repeatOpen && !activeSeriesId && seriesError) {
      setWorkerError(seriesError);
      return;
    }
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
      const usingSeries = repeatOpen && (activeSeriesId || (seriesDateKeys && seriesDateKeys.length > 0));
      const res = await fetch("/api/erp/schedule/worker-assignments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId,
          employeeId: workerType === "employee" ? workerId : undefined,
          contractorId: workerType === "contractor" ? workerId : undefined,
          date: dateKey,
          ...(usingSeries
            ? activeSeriesId
              ? { seriesId: activeSeriesId }
              : { repeatUntil, repeatDays }
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
      if (usingSeries && seriesDateKeys && data.seriesId && data.assignments) {
        setActiveSeriesId(data.seriesId);
        onWorkerSeriesCreated(
          data.assignments.map((a, i) => ({
            id: a.id,
            projectId,
            employeeId: workerType === "employee" ? workerId : null,
            contractorId: workerType === "contractor" ? workerId : null,
            dateKey: seriesDateKeys[i]!,
            seriesId: data.seriesId!,
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
        });
      }
      setEmployeeId("");
      setEmployeeQuery("");
      setContractorId("");
      setContractorQuery("");
    } catch (err) {
      setWorkerError(err instanceof Error ? err.message : "Failed to assign worker");
    } finally {
      setAddingWorker(false);
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col rounded-lg border border-gray-200 bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-gray-100 p-6 pb-4">
          <h2 className="text-lg font-semibold text-gray-900">Assign to this day</h2>
          <p className="mt-1 text-sm text-gray-500">{dateLabel(dateKey)}</p>
        </div>
        <div className="min-h-0 overflow-y-auto p-6 pt-4">
        {existing.length > 0 ? (
          <ul className="mt-4 space-y-1.5">
            {existing.map((a) => {
              const project = projects.find((p) => p.id === a.projectId);
              const supervisor = a.supervisorUserId ? supervisors.find((s) => s.id === a.supervisorUserId) : null;
              const pm = !supervisor && a.projectManagerUserId ? projectManagers.find((p) => p.id === a.projectManagerUserId) : null;
              const personLabel = supervisor
                ? supervisor.displayName
                : pm
                ? `${pm.displayName} (PM)`
                : "Unknown supervisor";
              return (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-2 rounded border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs"
                >
                  <span className="truncate" title={project?.jobTitle}>
                    <span className="font-medium text-gray-800">{project?.jobTitle ?? "Unknown project"}</span>
                    <span className="text-gray-500"> — {personLabel}</span>
                    {formatTimeRange(a.startTime, a.endTime) ? (
                      <span className="text-gray-400"> ({formatTimeRange(a.startTime, a.endTime)})</span>
                    ) : null}
                    {a.seriesId ? <span className="text-gray-400"> · repeating</span> : null}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {a.seriesId ? (
                      <button
                        type="button"
                        onClick={() => handleDeleteSeries(a.seriesId!)}
                        disabled={deletingSeriesId === a.seriesId}
                        title="Remove every day in this repeating series"
                        className="text-[10px] font-medium text-gray-400 hover:text-red-500 disabled:opacity-50"
                      >
                        remove all
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => handleDelete(a.id)}
                      disabled={deletingId === a.id}
                      className="text-gray-400 hover:text-red-500 disabled:opacity-50"
                    >
                      ×
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}

        <form onSubmit={handleAssign} className="mt-4 space-y-3 border-t border-gray-100 pt-4">
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

          {selectedProject && selectedGroup === "POST_CONSTRUCTION" ? (
            <div>
              <label className="block text-xs font-medium text-gray-600">SOV item(s) being worked on</label>
              <div className="mt-1">
                {selectedProject.sovItems.length > 0 ? (
                  <SOVMultiCombobox sovItems={selectedProject.sovItems} selectedIds={sovPicks} onChange={setSovPicks} />
                ) : (
                  <p className="text-xs text-gray-400">No SOV items on this project yet.</p>
                )}
              </div>
            </div>
          ) : null}

          {selectedProject && selectedGroup === "JANITORIAL_TURNOVER_REQUESTS" && availableScopeOptions.length > 0 ? (
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

          {selectedProject && selectedProject.changeOrders.length > 0 ? (
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

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-600">Supervisor</label>
              <select
                value={supervisorUserId}
                onChange={(e) => setSupervisorUserId(e.target.value)}
                className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900"
              >
                <option value="">Select a supervisor...</option>
                {supervisors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.displayName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600">PM (if no supervisor)</label>
              <select
                value={projectManagerUserId}
                onChange={(e) => setProjectManagerUserId(e.target.value)}
                className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900"
              >
                <option value="">None</option>
                {projectManagers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName}
                  </option>
                ))}
              </select>
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

          <div className="rounded border border-gray-200 p-2">
            <button
              type="button"
              onClick={() => setRepeatOpen((v) => !v)}
              className="flex w-full items-center justify-between text-xs font-medium text-gray-600"
            >
              <span>Repeat / multi-day range</span>
              <span className="text-gray-400">{repeatOpen ? "Hide" : "Set up"}</span>
            </button>
            {repeatOpen ? (
              <div className="mt-2 space-y-2">
                <div className="flex gap-1">
                  {WEEKDAY_LABELS.map((label, weekday) => (
                    <button
                      key={weekday}
                      type="button"
                      onClick={() => toggleRepeatDay(weekday)}
                      className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium ${
                        repeatDays.includes(weekday)
                          ? "bg-pink-600 text-white"
                          : "border border-gray-300 text-gray-500 hover:border-pink-400"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600">Ends on</label>
                  <input
                    type="date"
                    value={repeatUntil}
                    min={dateKey}
                    onChange={(e) => setRepeatUntil(e.target.value)}
                    className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900"
                  />
                </div>
                {repeatUntil ? (
                  seriesError ? (
                    <p className="text-xs text-red-600">{seriesError}</p>
                  ) : seriesDateKeys ? (
                    <p className="text-xs text-gray-500">
                      Applies to {seriesDateKeys.length} day{seriesDateKeys.length === 1 ? "" : "s"}: {dateKey} through {repeatUntil}
                    </p>
                  ) : null
                ) : null}
              </div>
            ) : null}
          </div>

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
          <label className="block text-xs font-medium text-gray-600">Workers scheduled</label>
          {existingWorkers.length > 0 ? (
            <ul className="mt-1.5 space-y-1.5">
              {existingWorkers.map((w) => {
                const project = projects.find((p) => p.id === w.projectId);
                const employee = w.employeeId ? employees.find((e) => e.id === w.employeeId) : null;
                const contractor = w.contractorId ? contractors.find((c) => c.id === w.contractorId) : null;
                const workerLabel = employee
                  ? employee.displayName
                  : contractor
                  ? `${contractor.displayName} (contractor)`
                  : "Unknown worker";
                return (
                  <li
                    key={w.id}
                    className="flex items-center justify-between gap-2 rounded border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs"
                  >
                    <span className="truncate" title={project?.jobTitle}>
                      <span className="font-medium text-gray-800">{project?.jobTitle ?? "Unknown project"}</span>
                      <span className="text-gray-500"> — {workerLabel}</span>
                      {w.seriesId ? <span className="text-gray-400"> · repeating</span> : null}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
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
            <p className="mt-1.5 text-xs text-gray-400">No workers scheduled yet for this day.</p>
          )}

          <p className="mt-3 text-[11px] text-gray-400">
            Uses the project selected above. Not emailed — for planning only.
          </p>

          <div className="mt-1.5 flex gap-1">
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
        </div>
        </div>
      </div>
    </div>
  );
}
