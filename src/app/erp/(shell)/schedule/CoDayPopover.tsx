"use client";

import { useRef, useState } from "react";
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
import { InfoTip, useConfirm } from "@/app/erp/components/ui";
import { useInsuranceCheck } from "@/app/erp/components/useInsuranceCheck";
import { useFloatingMenu } from "@/app/erp/components/useFloatingMenu";
import { centsToDollars } from "@/lib/erp/money";
import { addDaysKey, daysBetween } from "@/lib/erp/managementCalendar";
import { AnswerMark, CoverageAnswer, answerUid, type Answers } from "./AnswerMark";

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** pickable false: shown by name where already assigned, but not offered in pickers. */
type Person = { id: string; displayName: string; pickable?: boolean };
/** Employees/contractors specifically — unlike a supervisor/PM (always an
 * ErpUser, always has an email), a crew member's email is optional, and
 * that's the one thing that gates whether they get a schedule invite at
 * all. Null surfaces a "no email on file" note wherever they're picked. */
type WorkerPerson = Person & { email: string | null; insuranceWarning?: string | null };

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
  coDays,
  canSetSubPay = false,
  workersForDay,
  supervisors,
  projectManagers,
  employees,
  contractors,
  answers = {},
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
  /** All of this CO's planned days, to find the visit a day belongs to (see subPay.ts). */
  coDays: ScheduleCoDayAssignment[];
  /** Roles that see prices get the contractor pay box. */
  canSetSubPay?: boolean;
  workersForDay: ScheduleCoWorkerAssignment[];
  supervisors: Person[];
  projectManagers: Person[];
  employees: WorkerPerson[];
  contractors: WorkerPerson[];
  /** Confirm / Can't make it answers by invite uid (AnswerMark.tsx) */
  answers?: Answers;
  onClose: () => void;
  onAssignmentSaved: (a: ScheduleCoDayAssignment) => void;
  onAssignmentDeleted: (id: string) => void;
  onWorkerCreated: (w: ScheduleCoWorkerAssignment) => void;
  onWorkerDeleted: (id: string) => void;
}) {
  const summary = co.laborByDay[dateKey];
  const router = useRouter();
  const confirm = useConfirm();
  const checkInsurance = useInsuranceCheck(contractors);

  // This day already happened — either it has actual logged labor, or the
  // CO as a whole is done — so offering a "plan supervisor/PM/crew" form for
  // it reads as backwards. Falls back to the plain read-only coverage/crew
  // view instead, same idea as a project's confirmed chip getting the
  // read-only labor card instead of its editable planned one.
  const hasLoggedLabor = !!(summary && (summary.hours > 0 || summary.workers.length > 0));
  const readOnly = coIsComplete(co.status) || hasLoggedLabor;
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
  const supervisorAnswer = assignment?.supervisorUserId ? answers[answerUid.coDay(assignment.id)] : undefined;
  const contractorAnswer = assignment?.supervisorContractorId ? answers[answerUid.coDaySub(assignment.id, assignment.supervisorContractorId)] : undefined;

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

  // A day that's only on the calendar because it's the CO's own start/end
  // date has no planned-day row to remove, so taking it off means clearing
  // that date. The calendar falls back to requestedDate when startDate is
  // empty, so the start day clears both, plus endDate when it's the same day
  // (scheduledEndDateKey is null then).
  const dateRole: "start" | "end" | null =
    dateKey === co.scheduledDateKey ? "start" : dateKey === co.scheduledEndDateKey ? "end" : null;
  const canTakeOffDay = dateRole !== null && !assignment && !hasLoggedLabor && !coIsComplete(co.status);
  const [takingOff, setTakingOff] = useState(false);
  const [takeOffError, setTakeOffError] = useState("");

  async function handleTakeOffDay() {
    if (
      !(await confirm({
        title: "Take off this day?",
        message:
          dateRole === "end"
            ? `Clears the end date of "${co.title}". You can set a new one on the change order.`
            : `Clears the start date of "${co.title}" so it's off the schedule. You can set a new one on the change order.`,
        confirmLabel: "Take off",
      }))
    )
      return;
    setTakingOff(true);
    setTakeOffError("");
    try {
      const body =
        dateRole === "end"
          ? { endDate: null }
          : { startDate: null, requestedDate: null, ...(co.scheduledEndDateKey ? {} : { endDate: null }) };
      const res = await fetch(`/api/erp/projects/${co.projectId}/change-orders/${co.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setTakeOffError(data.error || "Couldn't take it off this day");
        return;
      }
      onClose();
      router.refresh();
    } catch {
      setTakeOffError("Couldn't take it off this day");
    } finally {
      setTakingOff(false);
    }
  }

  const [supervisorUserId, setSupervisorUserId] = useState(assignment?.supervisorUserId ?? "");
  const [projectManagerUserId, setProjectManagerUserId] = useState(assignment?.projectManagerUserId ?? "");
  const [supervisorContractorId, setSupervisorContractorId] = useState(assignment?.supervisorContractorId ?? "");
  const [startTime, setStartTime] = useState(assignment?.startTime ?? "");
  const [endTime, setEndTime] = useState(assignment?.endTime ?? "");
  const [comment, setComment] = useState(assignment?.comment ?? "");
  const [internalNote, setInternalNote] = useState(assignment?.internalNote ?? "");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState("");

  // Contractor pay for this visit: the days in a row this sub runs on the CO, paid once (see subPay.ts).
  function visitKeys(contractorId: string): string[] {
    const has = (d: string) => coDays.some((a) => a.dateKey === d && a.supervisorContractorId === contractorId);
    let first = dateKey;
    let last = dateKey;
    while (has(addDaysKey(first, -1))) first = addDaysKey(first, -1);
    while (has(addDaysKey(last, 1))) last = addDaysKey(last, 1);
    return Array.from({ length: daysBetween(first, last) + 1 }, (_, i) => addDaysKey(first, i));
  }
  function savedPayCents(contractorId: string): number | null {
    if (!contractorId) return null;
    return visitKeys(contractorId).map((d) => co.subPayByDay[`${contractorId}:${d}`]).find((v) => v != null) ?? null;
  }
  /** Pay from the CO's Contractors tab covering this visit. Shown, not editable, so it isn't paid twice. */
  function paySetElsewhere(contractorId: string): number | null {
    if (!contractorId || savedPayCents(contractorId) != null) return null;
    const keys = visitKeys(contractorId);
    return (co.subPayTabLines[contractorId] ?? []).find((l) => keys.some((d) => d >= l.from && d <= l.to))?.cents ?? null;
  }
  const centsToInput = (c: number | null) => (c == null ? "" : (c / 100).toFixed(2).replace(/\.00$/, ""));
  const [subPay, setSubPay] = useState(() => centsToInput(savedPayCents(assignment?.supervisorContractorId ?? "")));
  const showSubPay = canSetSubPay && !!supervisorContractorId;
  const tabPay = showSubPay ? paySetElsewhere(supervisorContractorId) : null;

  const [workerType, setWorkerType] = useState<"employee" | "contractor">("employee");
  const [workerQuery, setWorkerQuery] = useState("");
  const [workerId, setWorkerId] = useState("");
  // Matches float over the card so its bottom edge can't cut them off.
  const workerInputRef = useRef<HTMLInputElement>(null);
  const workerMenuRef = useRef<HTMLDivElement>(null);
  const workerMenuStyle = useFloatingMenu(!!workerQuery && !workerId, workerInputRef, workerMenuRef, workerQuery.length, 0);
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
    const sendPay = showSubPay && tabPay == null;
    const payCents = subPay.trim() ? Math.round(Number(subPay.replace(/[$,\s]/g, "")) * 100) : null;
    if (sendPay && payCents != null && (!Number.isFinite(payCents) || payCents < 0)) {
      setError("Contractor pay needs to be a dollar amount");
      return;
    }
    const payChanged = sendPay && payCents !== savedPayCents(supervisorContractorId);
    if (!(await checkInsurance(supervisorContractorId, assignment?.supervisorContractorId))) return;
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
          internalNote: internalNote.trim(),
          ...(sendPay ? { subPayCents: payCents } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string; subPay?: string | null };
      if (!res.ok || !data.id) throw new Error(data.error || "Failed to save");
      // The visit's other days, and pay entered in the Contractors tab meanwhile, come from the server.
      if (payChanged || data.subPay === "set-elsewhere") router.refresh();
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
        internalNote: internalNote.trim() || null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveCoverage(): Promise<boolean> {
    if (!assignment) return false;
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
      return true;
    } catch {
      setError("Failed to remove");
      return false;
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
    if (workerType === "contractor" && !(await checkInsurance(id))) return;
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
            {assignment && (supervisorName || pmName || contractorName || assignment.startTime || assignment.comment || assignment.internalNote) ? (
              <div className="mt-3 border-t border-gray-100 pt-2.5">
                <label className="block text-[10px] font-medium text-gray-500">Coverage</label>
                {supervisorName ? <p className="mt-1 text-[11px] text-gray-600">Supervisor: {supervisorName}<AnswerMark status={supervisorAnswer} /></p> : null}
                {pmName ? <p className="mt-1 text-[11px] text-gray-600">PM: {pmName}</p> : null}
                {contractorName ? <p className="mt-1 text-[11px] text-gray-600">Contractor: {contractorName}<AnswerMark status={contractorAnswer} /></p> : null}
                {assignment.startTime && assignment.endTime ? (
                  <p className="mt-1 text-[11px] text-gray-600">
                    {assignment.startTime} to {assignment.endTime}
                  </p>
                ) : null}
                {assignment.comment ? <p className="mt-1 text-[11px] text-gray-600">Note: {assignment.comment}</p> : null}
                {assignment.internalNote ? <p className="mt-1 text-[11px] text-amber-700">Internal: {assignment.internalNote}</p> : null}
              </div>
            ) : null}

            {/* A completed CO can still carry a stray planned day (e.g. one
                scheduled on the wrong date after the fact). With no labor
                logged on it there's nothing to protect, so let it be removed. */}
            {assignment && !hasLoggedLabor ? (
              <div className="mt-2">
                {error ? <p className="mb-1 text-[10px] text-red-500">{error}</p> : null}
                <button
                  type="button"
                  onClick={async () => {
                    if (await handleRemoveCoverage()) onClose();
                  }}
                  disabled={removing}
                  className="rounded border border-gray-300 px-2 py-1 text-[10px] font-medium text-gray-600 hover:border-red-300 hover:text-red-600 disabled:opacity-50"
                >
                  {removing ? "Removing…" : "Remove this day"}
                </button>
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
                  options={projectManagers.filter((p) => p.pickable !== false || p.id === projectManagerUserId).map((p) => ({ value: p.id, label: p.displayName }))}
                  placeholder="Search…"
                  allLabel="PM (if no supervisor)"
                />
                <SearchableSelect
                  value={supervisorContractorId}
                  onChange={(v) => {
                    setSupervisorContractorId(v);
                    setSubPay(centsToInput(savedPayCents(v)));
                  }}
                  options={contractors.map((c) => ({ value: c.id, label: c.displayName }))}
                  placeholder="Search…"
                  allLabel="Contractor (if no supervisor)"
                />
              </div>
              <CoverageAnswer name={supervisorName} status={supervisorAnswer} />
              <CoverageAnswer name={contractorName} status={contractorAnswer} />
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
              {tabPay != null ? (
                <div className="mt-1.5 flex items-center gap-1 text-[10px] text-gray-500">
                  Contractor pay {centsToDollars(tabPay)}, set in the change order&apos;s Contractors tab
                  <InfoTip text="Change it there. The calendar doesn't add its own pay on top, so the contractor isn't paid twice." />
                </div>
              ) : showSubPay ? (
                <div className="mt-1.5">
                  <div className="flex items-center gap-1 text-[9px] text-gray-400">
                    Contractor pay (this visit)
                    <InfoTip text="Their pay for this visit (the days in a row they run this change order), not per day. Shows on their invites for those days and saves as their cost on the change order, paid on the visit's last day. Leave blank to keep pay off the invite." />
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <div className="relative w-28">
                      <span className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                      <input
                        inputMode="decimal"
                        value={subPay}
                        onChange={(e) => setSubPay(e.target.value)}
                        placeholder="0"
                        className="w-full rounded border border-gray-300 bg-white py-1 pl-4 pr-1.5 text-xs text-gray-800 focus:border-pink-400 focus:outline-none"
                      />
                    </div>
                    {co.contractValueCents ? (
                      <span className="text-[10px] text-gray-500">CO price {centsToDollars(co.contractValueCents)}</span>
                    ) : (
                      <span className="text-[10px] text-gray-400">No price on this change order</span>
                    )}
                  </div>
                </div>
              ) : null}
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Note for contractors (sent with invites)..."
                rows={2}
                className="mt-1.5 w-full rounded border border-gray-300 bg-white px-1.5 py-1 text-xs text-gray-900 placeholder-gray-400"
              />
              <textarea
                value={internalNote}
                onChange={(e) => setInternalNote(e.target.value)}
                placeholder="Internal note (staff only, never sent)..."
                rows={2}
                className="mt-1.5 w-full rounded border border-amber-200 bg-amber-50 px-1.5 py-1 text-xs text-gray-900 placeholder-gray-400"
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
                          <AnswerMark status={answers[answerUid.coWorker(w.id)]} />
                          {worker && !worker.email ? (
                            <span className="text-gray-400" title="No email on file - didn't get a schedule invite">
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
                    ref={workerInputRef}
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
                  <div ref={workerMenuRef} style={workerMenuStyle} className="overflow-auto rounded border border-gray-200 bg-white shadow-lg">
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
        {takeOffError ? <p className="mt-2.5 text-[10px] text-red-500">{takeOffError}</p> : null}

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
          {canTakeOffDay ? (
            <button
              type="button"
              onClick={() => void handleTakeOffDay()}
              disabled={takingOff}
              className="rounded border border-gray-300 px-2 py-1 text-[10px] font-medium text-gray-600 hover:border-red-300 hover:text-red-600 disabled:opacity-50"
            >
              {takingOff ? "Removing…" : "Take off this day"}
            </button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
