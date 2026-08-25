"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import {
  coIsComplete,
  dayCellLabel,
  formatHours,
  matchesSearchQuery,
  type ScheduleChangeOrder,
  type ScheduleCoDayAssignment,
  type ScheduleCoWorkerAssignment,
} from "@/lib/erp/schedule";
import { SearchableSelect } from "@/app/erp/components/SearchableSelect";
import { useConfirm } from "@/app/erp/components/ui";

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

type Person = { id: string; displayName: string };
/** Employees/contractors specifically — unlike a supervisor/PM (always an
 * ErpUser, always has an email), a crew member's email is optional, and
 * that's the one thing that gates whether they get a schedule invite at
 * all. Null surfaces a "no email on file" note wherever they're picked. */
type WorkerPerson = Person & { email: string | null };

/** Click-through popover for a change-order chip on the month calendar —
 * always shows logged labor for the day (read-only). Once that day is done
 * — either logged labor already exists for it, or the CO itself is
 * complete/billing — the rest of the card goes read-only too (coverage +
 * crew as plain text, no forms), same as a project's own confirmed chip
 * gives a read-only labor card instead of its editable planning one. Only a
 * day that's still just a plan gets the editable "plan a supervisor/PM/
 * time/comment" (ChangeOrderDayAssignment) and crew (
 * ChangeOrderWorkerDayAssignment) forms, the same capabilities a project's
 * own event popover already has. Kept as its own component (rather than
 * folded into SchedulePlanner's already-large state) the same way
 * DuplicateToMoreDaysSection is. */
export function CoDayPopover({
  co,
  dateKey,
  parentProjectTitle,
  assignment,
  workersForDay,
  supervisors,
  projectManagers,
  employees,
  contractors,
  onClose,
  onAssignmentSaved,
  onAssignmentDeleted,
  onWorkerCreated,
  onWorkerDeleted,
}: {
  co: ScheduleChangeOrder;
  dateKey: string;
  parentProjectTitle: string | undefined;
  assignment: ScheduleCoDayAssignment | undefined;
  workersForDay: ScheduleCoWorkerAssignment[];
  supervisors: Person[];
  projectManagers: Person[];
  employees: WorkerPerson[];
  contractors: WorkerPerson[];
  onClose: () => void;
  onAssignmentSaved: (a: ScheduleCoDayAssignment) => void;
  onAssignmentDeleted: (id: string) => void;
  onWorkerCreated: (w: ScheduleCoWorkerAssignment) => void;
  onWorkerDeleted: (id: string) => void;
}) {
  const summary = co.laborByDay[dateKey];
  const router = useRouter();
  const confirm = useConfirm();

  // This day already happened — either it has actual logged labor, or the
  // CO as a whole is done — so offering a "plan supervisor/PM/crew" form for
  // it reads as backwards. Falls back to the plain read-only coverage/crew
  // view instead, same idea as a project's confirmed chip getting the
  // read-only labor card instead of its editable planned one.
  const readOnly = coIsComplete(co.status) || !!(summary && (summary.hours > 0 || summary.workers.length > 0));
  const supervisorName = assignment?.supervisorUserId
    ? supervisors.find((s) => s.id === assignment.supervisorUserId)?.displayName
    : null;
  const pmName =
    !supervisorName && assignment?.projectManagerUserId
      ? projectManagers.find((p) => p.id === assignment.projectManagerUserId)?.displayName
      : null;
  const contractorName =
    !supervisorName && !pmName && assignment?.supervisorContractorId
      ? contractors.find((c) => c.id === assignment.supervisorContractorId)?.displayName
      : null;

  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState("");

  // Same request shape as the CO detail page's own "Mark complete" button
  // (ChangeOrderDetailEditor.tsx) — status COMPLETED plus endDate in one
  // PATCH, which the API mirrors onto completedAt itself.
  async function handleMarkComplete() {
    if (
      !(await confirm({
        message: `Mark "${co.title}" complete with an end date of ${dayCellLabel(dateKey)}?`,
        danger: false,
        confirmLabel: "Mark complete",
      }))
    )
      return;
    setCompleting(true);
    setCompleteError("");
    try {
      const res = await fetch(`/api/erp/projects/${co.projectId}/change-orders/${co.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "COMPLETED", endDate: dateKey }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setCompleteError(data.error || "Failed to mark complete");
        return;
      }
      onClose();
      router.refresh();
    } catch {
      setCompleteError("Failed to mark complete");
    } finally {
      setCompleting(false);
    }
  }

  const [supervisorUserId, setSupervisorUserId] = useState(assignment?.supervisorUserId ?? "");
  const [projectManagerUserId, setProjectManagerUserId] = useState(assignment?.projectManagerUserId ?? "");
  const [supervisorContractorId, setSupervisorContractorId] = useState(assignment?.supervisorContractorId ?? "");
  const [startTime, setStartTime] = useState(assignment?.startTime ?? "");
  const [endTime, setEndTime] = useState(assignment?.endTime ?? "");
  const [comment, setComment] = useState(assignment?.comment ?? "");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState("");

  const [workerType, setWorkerType] = useState<"employee" | "contractor">("employee");
  const [workerQuery, setWorkerQuery] = useState("");
  const [workerId, setWorkerId] = useState("");
  const [addingWorker, setAddingWorker] = useState(false);
  const [workerError, setWorkerError] = useState("");
  const [deletingWorkerId, setDeletingWorkerId] = useState<string | null>(null);

  const workerOptions = workerType === "employee" ? employees : contractors;
  const filteredWorkerOptions = workerQuery.trim()
    ? workerOptions.filter((w) => matchesSearchQuery(w.displayName, workerQuery))
    : workerOptions;

  async function handleSaveCoverage() {
    setError("");
    if ((startTime && !endTime) || (endTime && !startTime)) {
      setError("Set both a start and end time, or leave both blank for an all-day event");
      return;
    }
    if (startTime && endTime && (!TIME_RE.test(startTime) || !TIME_RE.test(endTime) || endTime <= startTime)) {
      setError("End time must be after start time");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/erp/schedule/co-day-assignments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          changeOrderId: co.id,
          date: dateKey,
          supervisorUserId: supervisorUserId || undefined,
          projectManagerUserId: projectManagerUserId || undefined,
          supervisorContractorId: supervisorContractorId || undefined,
          startTime: startTime || undefined,
          endTime: endTime || undefined,
          comment: comment.trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !data.id) throw new Error(data.error || "Failed to save");
      onAssignmentSaved({
        id: data.id,
        changeOrderId: co.id,
        dateKey,
        supervisorUserId: supervisorUserId || null,
        projectManagerUserId: projectManagerUserId || null,
        supervisorContractorId: supervisorContractorId || null,
        startTime: startTime || null,
        endTime: endTime || null,
        comment: comment.trim() || null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveCoverage() {
    if (!assignment) return;
    setRemoving(true);
    try {
      const res = await fetch(`/api/erp/schedule/co-day-assignments/${assignment.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to remove");
      onAssignmentDeleted(assignment.id);
      setSupervisorUserId("");
      setProjectManagerUserId("");
      setSupervisorContractorId("");
      setStartTime("");
      setEndTime("");
      setComment("");
    } catch {
      setError("Failed to remove");
    } finally {
      setRemoving(false);
    }
  }

  async function handleAddWorker() {
    setWorkerError("");
    const id = workerId;
    if (!id) {
      setWorkerError(workerType === "employee" ? "Pick a worker" : "Pick a contractor");
      return;
    }
    setAddingWorker(true);
    try {
      const res = await fetch("/api/erp/schedule/co-worker-assignments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          changeOrderId: co.id,
          employeeId: workerType === "employee" ? id : undefined,
          contractorId: workerType === "contractor" ? id : undefined,
          date: dateKey,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !data.id) throw new Error(data.error || "Failed to add worker");
      onWorkerCreated({
        id: data.id,
        changeOrderId: co.id,
        employeeId: workerType === "employee" ? id : null,
        contractorId: workerType === "contractor" ? id : null,
        dateKey,
      });
      setWorkerQuery("");
      setWorkerId("");
    } catch (err) {
      setWorkerError(err instanceof Error ? err.message : "Failed to add worker");
    } finally {
      setAddingWorker(false);
    }
  }

  async function handleDeleteWorker(id: string) {
    setDeletingWorkerId(id);
    try {
      const res = await fetch(`/api/erp/schedule/co-worker-assignments/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to remove");
      onWorkerDeleted(id);
    } catch {
      // leave it in place; user can retry
    } finally {
      setDeletingWorkerId(null);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-lg border border-gray-200 bg-white p-4 text-left shadow-xl"
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-semibold text-gray-800">{co.title}</p>
          <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 text-gray-400 hover:text-gray-600">
            ×
          </button>
        </div>
        <p className="mt-0.5 text-[10px] text-gray-400">Change order (CO) · {dayCellLabel(dateKey)}</p>
        {parentProjectTitle ? <p className="mt-0.5 text-[10px] text-gray-400">Project: {parentProjectTitle}</p> : null}
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

        {readOnly ? (
          <>
            {assignment && (supervisorName || pmName || contractorName || assignment.startTime || assignment.comment) ? (
              <div className="mt-3 border-t border-gray-100 pt-2.5">
                <label className="block text-[10px] font-medium text-gray-500">Coverage</label>
                {supervisorName ? <p className="mt-1 text-[11px] text-gray-600">Supervisor: {supervisorName}</p> : null}
                {pmName ? <p className="mt-1 text-[11px] text-gray-600">PM: {pmName}</p> : null}
                {contractorName ? <p className="mt-1 text-[11px] text-gray-600">Contractor: {contractorName}</p> : null}
                {assignment.startTime && assignment.endTime ? (
                  <p className="mt-1 text-[11px] text-gray-600">
                    {assignment.startTime} to {assignment.endTime}
                  </p>
                ) : null}
                {assignment.comment ? <p className="mt-1 text-[11px] text-gray-600">Note: {assignment.comment}</p> : null}
              </div>
            ) : null}

            {workersForDay.length > 0 ? (
              <div className="mt-3 border-t border-gray-100 pt-2.5">
                <label className="block text-[10px] font-medium text-gray-500">Crew scheduled this day</label>
                <p className="mt-1.5 text-[11px] text-gray-600">
                  {workersForDay
                    .map((w) =>
                      w.employeeId
                        ? employees.find((e) => e.id === w.employeeId)?.displayName
                        : contractors.find((c) => c.id === w.contractorId)?.displayName,
                    )
                    .filter((name): name is string => !!name)
                    .join(", ")}
                </p>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <div className="mt-3 border-t border-gray-100 pt-2.5">
              <label className="block text-[10px] font-medium text-gray-500">Plan supervisor / PM / contractor for this day</label>
              <div className="mt-1 grid grid-cols-3 gap-1.5">
                <SearchableSelect
                  value={supervisorUserId}
                  onChange={setSupervisorUserId}
                  options={supervisors.map((s) => ({ value: s.id, label: s.displayName }))}
                  placeholder="Search…"
                  allLabel="Supervisor..."
                />
                <SearchableSelect
                  value={projectManagerUserId}
                  onChange={setProjectManagerUserId}
                  options={projectManagers.map((p) => ({ value: p.id, label: p.displayName }))}
                  placeholder="Search…"
                  allLabel="PM (if no supervisor)"
                />
                <SearchableSelect
                  value={supervisorContractorId}
                  onChange={setSupervisorContractorId}
                  options={contractors.map((c) => ({ value: c.id, label: c.displayName }))}
                  placeholder="Search…"
                  allLabel="Contractor (if no supervisor)"
                />
              </div>
              <div className="mt-1.5 flex items-center gap-1.5">
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full rounded border border-gray-300 bg-white px-1.5 py-1 text-xs text-gray-900"
                />
                <span className="text-[10px] text-gray-400">to</span>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full rounded border border-gray-300 bg-white px-1.5 py-1 text-xs text-gray-900"
                />
              </div>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Note about this day's coverage..."
                rows={2}
                className="mt-1.5 w-full rounded border border-gray-300 bg-white px-1.5 py-1 text-xs text-gray-900 placeholder-gray-400"
              />
              {error ? <p className="mt-1 text-[10px] text-red-500">{error}</p> : null}
              <div className="mt-1.5 flex gap-1.5">
                <button
                  type="button"
                  onClick={handleSaveCoverage}
                  disabled={saving}
                  className="rounded bg-pink-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-pink-500 disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save coverage"}
                </button>
                {assignment ? (
                  <button
                    type="button"
                    onClick={handleRemoveCoverage}
                    disabled={removing}
                    className="rounded border border-gray-300 px-2 py-1 text-[10px] font-medium text-gray-600 hover:border-red-300 hover:text-red-600 disabled:opacity-50"
                  >
                    {removing ? "Removing…" : "Remove"}
                  </button>
                ) : null}
              </div>
            </div>

            <div className="mt-3 border-t border-gray-100 pt-2.5">
              <label className="block text-[10px] font-medium text-gray-500">Workers scheduled this day</label>
              {workersForDay.length > 0 ? (
                <ul className="mt-1 space-y-1">
                  {workersForDay.map((w) => {
                    const worker = w.employeeId
                      ? employees.find((e) => e.id === w.employeeId)
                      : contractors.find((c) => c.id === w.contractorId);
                    return (
                      <li
                        key={w.id}
                        className="flex items-center justify-between gap-1.5 rounded border border-gray-200 bg-gray-50 px-1.5 py-1 text-[11px] text-gray-700"
                      >
                        <span className="truncate">
                          {worker?.displayName ?? "Unknown worker"}
                          {worker && !worker.email ? (
                            <span className="text-gray-400" title="No email on file — didn't get a schedule invite">
                              {" "}
                              (no email)
                            </span>
                          ) : null}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteWorker(w.id)}
                          disabled={deletingWorkerId === w.id}
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
                    setWorkerType("employee");
                    setWorkerQuery("");
                    setWorkerId("");
                  }}
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    workerType === "employee" ? "bg-gray-700 text-white" : "border border-gray-300 text-gray-600 hover:border-gray-400"
                  }`}
                >
                  Employee
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWorkerType("contractor");
                    setWorkerQuery("");
                    setWorkerId("");
                  }}
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    workerType === "contractor" ? "bg-gray-700 text-white" : "border border-gray-300 text-gray-600 hover:border-gray-400"
                  }`}
                >
                  Contractor
                </button>
              </div>

              <div className="relative mt-1.5">
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={workerId ? workerOptions.find((w) => w.id === workerId)?.displayName ?? "" : workerQuery}
                    onChange={(e) => {
                      setWorkerQuery(e.target.value);
                      setWorkerId("");
                    }}
                    placeholder={workerType === "employee" ? "Search workers..." : "Search contractors..."}
                    className="w-full rounded border border-gray-300 bg-white px-1.5 py-1 text-xs text-gray-900 placeholder-gray-400 focus:border-pink-400 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleAddWorker}
                    disabled={addingWorker}
                    className="shrink-0 rounded bg-gray-700 px-2 py-1 text-[10px] font-medium text-white hover:bg-gray-600 disabled:opacity-50"
                  >
                    {addingWorker ? "Adding…" : "Add"}
                  </button>
                </div>
                {workerQuery && !workerId ? (
                  <div className="absolute z-10 mt-1 max-h-32 w-full overflow-auto rounded border border-gray-200 bg-white shadow-sm">
                    {filteredWorkerOptions.slice(0, 8).map((w) => (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => {
                          setWorkerId(w.id);
                          setWorkerQuery(w.displayName);
                        }}
                        className="block w-full truncate px-1.5 py-1 text-left text-[11px] text-gray-700 hover:bg-pink-50"
                      >
                        {w.displayName}
                        {!w.email ? <span className="text-gray-400"> (no email)</span> : null}
                      </button>
                    ))}
                    {filteredWorkerOptions.length === 0 ? <div className="px-1.5 py-1 text-[11px] text-gray-400">No matches</div> : null}
                  </div>
                ) : null}
              </div>
              {workerError ? <p className="mt-1.5 text-[10px] text-red-500">{workerError}</p> : null}
            </div>
          </>
        )}

        {completeError ? <p className="mt-2.5 text-[10px] text-red-500">{completeError}</p> : null}

        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-gray-100 pt-2.5">
          <Link
            href={`/erp/projects/${co.projectId}/change-orders/${co.id}`}
            className="rounded bg-pink-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-pink-500"
          >
            View change order
          </Link>
          {co.status !== "COMPLETED" && co.status !== "BILLING" ? (
            <button
              type="button"
              onClick={() => void handleMarkComplete()}
              disabled={completing}
              className="rounded border border-emerald-600 px-2 py-1 text-[10px] font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
            >
              {completing ? "Saving…" : "Mark complete"}
            </button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
