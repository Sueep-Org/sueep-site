"use client";

import { useState } from "react";
import type { ScheduleDayAssignment, ScheduleWorkerAssignment } from "@/lib/erp/schedule";

type ProjectOption = { id: string; jobTitle: string };
type Supervisor = { id: string; displayName: string };
type Employee = { id: string; displayName: string };

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
  employees,
  existing,
  existingWorkers,
  initialProjectId,
  onClose,
  onCreated,
  onDeleted,
  onWorkerCreated,
  onWorkerDeleted,
}: {
  dateKey: string;
  projects: ProjectOption[];
  supervisors: Supervisor[];
  employees: Employee[];
  existing: ScheduleDayAssignment[];
  existingWorkers: ScheduleWorkerAssignment[];
  /** Pre-selects a project — e.g. jumping here from the "needs a supervisor" alert chip for a specific project. */
  initialProjectId?: string;
  onClose: () => void;
  onCreated: (assignment: ScheduleDayAssignment) => void;
  onDeleted: (id: string) => void;
  onWorkerCreated: (assignment: ScheduleWorkerAssignment) => void;
  onWorkerDeleted: (id: string) => void;
}) {
  const [projectId, setProjectId] = useState(initialProjectId ?? "");
  const [projectQuery, setProjectQuery] = useState(
    () => projects.find((p) => p.id === initialProjectId)?.jobTitle ?? ""
  );
  const [supervisorUserId, setSupervisorUserId] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [employeeId, setEmployeeId] = useState("");
  const [employeeQuery, setEmployeeQuery] = useState("");
  const [addingWorker, setAddingWorker] = useState(false);
  const [workerError, setWorkerError] = useState("");
  const [deletingWorkerId, setDeletingWorkerId] = useState<string | null>(null);

  const filteredProjects = projectQuery.trim()
    ? projects.filter((p) => p.jobTitle.toLowerCase().includes(projectQuery.toLowerCase()))
    : projects;

  const filteredEmployees = employeeQuery.trim()
    ? employees.filter((e) => e.displayName.toLowerCase().includes(employeeQuery.toLowerCase()))
    : employees;

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!projectId || !supervisorUserId) {
      setError("Pick a project and a supervisor");
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
      const res = await fetch("/api/erp/schedule/day-assignments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId,
          supervisorUserId,
          date: dateKey,
          startTime: startTime || undefined,
          endTime: endTime || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { id: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to assign");
      onCreated({
        id: data.id,
        projectId,
        dateKey,
        supervisorUserId,
        startTime: startTime || null,
        endTime: endTime || null,
      });
      setProjectId("");
      setProjectQuery("");
      setSupervisorUserId("");
      setStartTime("");
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

  async function handleAddWorker() {
    setWorkerError("");
    if (!projectId) {
      setWorkerError("Pick a project above first");
      return;
    }
    if (!employeeId) {
      setWorkerError("Pick a worker");
      return;
    }
    setAddingWorker(true);
    try {
      const res = await fetch("/api/erp/schedule/worker-assignments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId, employeeId, date: dateKey }),
      });
      const data = (await res.json().catch(() => ({}))) as { id: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to assign worker");
      onWorkerCreated({ id: data.id, projectId, employeeId, dateKey });
      setEmployeeId("");
      setEmployeeQuery("");
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
        className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-gray-900">Assign to this day</h2>
        <p className="mt-1 text-sm text-gray-500">{dateLabel(dateKey)}</p>

        {existing.length > 0 ? (
          <ul className="mt-4 space-y-1.5">
            {existing.map((a) => {
              const project = projects.find((p) => p.id === a.projectId);
              const supervisor = supervisors.find((s) => s.id === a.supervisorUserId);
              return (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-2 rounded border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs"
                >
                  <span className="truncate">
                    <span className="font-medium text-gray-800">{project?.jobTitle ?? "Unknown project"}</span>
                    <span className="text-gray-500"> — {supervisor?.displayName ?? "Unknown supervisor"}</span>
                    {formatTimeRange(a.startTime, a.endTime) ? (
                      <span className="text-gray-400"> ({formatTimeRange(a.startTime, a.endTime)})</span>
                    ) : null}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDelete(a.id)}
                    disabled={deletingId === a.id}
                    className="shrink-0 text-gray-400 hover:text-red-500 disabled:opacity-50"
                  >
                    ×
                  </button>
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
                    }}
                    className="block w-full truncate px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-pink-50"
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
              {saving ? "Assigning..." : "Assign supervisor"}
            </button>
          </div>
        </form>

        <div className="mt-4 border-t border-gray-100 pt-4">
          <label className="block text-xs font-medium text-gray-600">Workers scheduled</label>
          {existingWorkers.length > 0 ? (
            <ul className="mt-1.5 space-y-1.5">
              {existingWorkers.map((w) => {
                const project = projects.find((p) => p.id === w.projectId);
                const employee = employees.find((e) => e.id === w.employeeId);
                return (
                  <li
                    key={w.id}
                    className="flex items-center justify-between gap-2 rounded border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs"
                  >
                    <span className="truncate">
                      <span className="font-medium text-gray-800">{project?.jobTitle ?? "Unknown project"}</span>
                      <span className="text-gray-500"> — {employee?.displayName ?? "Unknown worker"}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteWorker(w.id)}
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
            <p className="mt-1.5 text-xs text-gray-400">No workers scheduled yet for this day.</p>
          )}

          <p className="mt-3 text-[11px] text-gray-400">
            Uses the project selected above. Not emailed — for planning only.
          </p>
          <div className="mt-1.5 flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={employeeId ? employees.find((e) => e.id === employeeId)?.displayName ?? "" : employeeQuery}
                onChange={(e) => {
                  setEmployeeQuery(e.target.value);
                  setEmployeeId("");
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
            <button
              type="button"
              onClick={handleAddWorker}
              disabled={addingWorker}
              className="shrink-0 rounded bg-gray-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-600 disabled:opacity-50"
            >
              {addingWorker ? "Adding..." : "Add"}
            </button>
          </div>
          {workerError ? (
            <div className="mt-2 rounded border border-red-300 bg-red-50 p-2 text-xs text-red-600">{workerError}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
