"use client";

import { useState } from "react";
import { InfoTip, inputClass, labelClass } from "@/app/erp/components/ui";

export type TimeOffRow = {
  id: string;
  startDate: string;
  endDate: string;
  type: "VACATION" | "SICK" | "HALF_DAY" | "UNPAID" | "OTHER";
  notes: string | null;
  status: "PENDING" | "APPROVED" | "DENIED";
  requestedBy: string | null;
  reviewedBy: string | null;
  reviewNote: string | null;
  /** Employees only: set when an Admin let it go past the yearly limit */
  limitOverride: "PAID" | "UNPAID" | null;
  unpaidDays: number;
};

type OverLimit = { remaining: number; adding: number; overBy: number };

const TYPE_OPTIONS: { value: TimeOffRow["type"]; label: string }[] = [
  { value: "VACATION", label: "Vacation" },
  { value: "SICK", label: "Sick" },
  { value: "HALF_DAY", label: "Half Day" },
  { value: "UNPAID", label: "Unpaid" },
  { value: "OTHER", label: "Other" },
];

const input = inputClass.md;
const label = labelClass.default;

// yyyy-mm-dd, comparable directly against the ISO date strings this
// component stores (both are midnight-UTC, so string comparison is safe).
function todayUtcStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function dateStr(iso: string): string {
  return iso.slice(0, 10);
}

// "Aug 10, 2026": abbreviated month, day, year.
function formatDate(iso: string): string {
  return new Date(`${dateStr(iso)}T00:00:00.000Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function statusFor(row: TimeOffRow, today: string): { label: string; cls: string } {
  if (row.status === "PENDING") return { label: "Pending approval", cls: "bg-amber-50 text-amber-800 border-amber-300" };
  if (row.status === "DENIED") return { label: "Denied", cls: "bg-red-50 text-red-700 border-red-200" };
  const start = dateStr(row.startDate);
  const end = dateStr(row.endDate);
  if (today >= start && today <= end) return { label: "On PTO now", cls: "bg-amber-100 text-amber-800 border-amber-300" };
  if (today < start) return { label: "Approved", cls: "bg-green-50 text-green-700 border-green-200" };
  return { label: "Past", cls: "bg-gray-100 text-gray-500 border-gray-200" };
}

// Inclusive on both ends, so a single day off (start === end) counts as 1.
function daysInclusive(startIso: string, endIso: string): number {
  const start = new Date(`${dateStr(startIso)}T00:00:00.000Z`).getTime();
  const end = new Date(`${dateStr(endIso)}T00:00:00.000Z`).getTime();
  return Math.round((end - start) / 86_400_000) + 1;
}

// Half Day entries count as half a day regardless of the date range length,
// everything else counts full calendar days.
function daysForEntry(entry: Pick<TimeOffRow, "startDate" | "endDate" | "type">): number {
  const days = daysInclusive(entry.startDate, entry.endDate);
  return entry.type === "HALF_DAY" ? days * 0.5 : days;
}

// Same rule as paidTimeOffDaysUsed on the server: pending counts, denied,
// Unpaid entries, and days an Admin made unpaid don't.
function paidDaysForEntry(entry: TimeOffRow): number {
  if (entry.status === "DENIED" || entry.type === "UNPAID") return 0;
  return Math.max(0, daysForEntry(entry) - entry.unpaidDays);
}

/** Time off log for one employee or contractor, with approve/deny.
 * `reviewBlock` is why the viewer can't approve this person's time off (null
 * if they can), from timeOffReviewBlock on the server. `paidDayLimit` is set
 * for employees only. */
export function TimeOffSection({
  kind,
  personId,
  initialTimeOff,
  reviewBlock,
  isAdmin,
  paidDayLimit,
}: {
  kind: "employee" | "contractor";
  personId: string;
  initialTimeOff: TimeOffRow[];
  reviewBlock: string | null;
  isAdmin: boolean;
  paidDayLimit?: number;
}) {
  const apiBase = `/api/erp/${kind === "employee" ? "employees" : "contractors"}/${personId}/time-off`;
  const idPrefix = kind === "employee" ? "pto" : "cpto";

  const [entries, setEntries] = useState<TimeOffRow[]>(initialTimeOff);
  const [showAddForm, setShowAddForm] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [type, setType] = useState<TimeOffRow["type"]>("VACATION");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [overLimit, setOverLimit] = useState<OverLimit | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [editType, setEditType] = useState<TimeOffRow["type"]>("VACATION");
  const [editNotes, setEditNotes] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [editOverLimit, setEditOverLimit] = useState<OverLimit | null>(null);

  const today = todayUtcStr();
  const currentYear = today.slice(0, 4);
  const sorted = [...entries].sort((a, b) => dateStr(b.startDate).localeCompare(dateStr(a.startDate)));
  const counted = entries.filter((e) => e.status !== "DENIED");
  const thisYear = counted.filter((e) => dateStr(e.startDate).slice(0, 4) === currentYear);
  const thisYearDays = thisYear.reduce((sum, e) => sum + daysForEntry(e), 0);
  const paidUsed = thisYear.reduce((sum, e) => sum + paidDaysForEntry(e), 0);
  const pendingCount = entries.filter((e) => e.status === "PENDING").length;
  const approvedPaid = thisYear.filter((e) => e.status === "APPROVED").reduce((sum, e) => sum + paidDaysForEntry(e), 0);
  const pendingPaid = paidUsed - approvedPaid;
  const unpaidThisYear = thisYear.reduce((sum, e) => sum + (e.type === "UNPAID" ? daysForEntry(e) : e.unpaidDays), 0);

  async function addTimeOff(limitOverride?: "PAID" | "UNPAID") {
    setError("");
    if (!startDate || !endDate) {
      setError("Start and end date are required.");
      return;
    }
    if (endDate < startDate) {
      setError("End date must be on or after start date.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ startDate, endDate, type, notes: notes.trim() || undefined, limitOverride }),
      });
      const data = (await res.json()) as TimeOffRow & { error?: string; overLimit?: OverLimit };
      if (!res.ok) {
        setError(data.error || "Failed to add time off");
        setOverLimit(data.overLimit ?? null);
        return;
      }
      setEntries((prev) => [data, ...prev]);
      setStartDate("");
      setEndDate("");
      setType("VACATION");
      setNotes("");
      setOverLimit(null);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function deleteTimeOff(id: string) {
    setDeletingId(id);
    const previous = entries;
    setEntries((prev) => prev.filter((e) => e.id !== id));
    try {
      const res = await fetch(`${apiBase}/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
    } catch {
      setEntries(previous);
    } finally {
      setDeletingId(null);
    }
  }

  async function review(id: string, decision: "APPROVED" | "DENIED") {
    setReviewError("");
    setReviewingId(id);
    try {
      const res = await fetch(`${apiBase}/${id}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const data = (await res.json()) as TimeOffRow & { error?: string };
      if (!res.ok) {
        setReviewError(data.error || "Failed to save");
        return;
      }
      setEntries((prev) => prev.map((e) => (e.id === id ? data : e)));
    } catch {
      setReviewError("Network error");
    } finally {
      setReviewingId(null);
    }
  }

  function startEdit(entry: TimeOffRow) {
    setEditingId(entry.id);
    setEditStart(dateStr(entry.startDate));
    setEditEnd(dateStr(entry.endDate));
    setEditType(entry.type);
    setEditNotes(entry.notes ?? "");
    setEditError("");
    setEditOverLimit(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError("");
    setEditOverLimit(null);
  }

  async function saveEdit(id: string, limitOverride?: "PAID" | "UNPAID") {
    setEditError("");
    if (!editStart || !editEnd) {
      setEditError("Start and end date are required.");
      return;
    }
    if (editEnd < editStart) {
      setEditError("End date must be on or after start date.");
      return;
    }
    setEditSaving(true);
    try {
      const res = await fetch(`${apiBase}/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ startDate: editStart, endDate: editEnd, type: editType, notes: editNotes.trim() || null, limitOverride }),
      });
      const data = (await res.json()) as TimeOffRow & { error?: string; overLimit?: OverLimit };
      if (!res.ok) {
        setEditError(data.error || "Failed to save changes");
        setEditOverLimit(data.overLimit ?? null);
        return;
      }
      setEntries((prev) => prev.map((e) => (e.id === id ? data : e)));
      setEditingId(null);
      setEditOverLimit(null);
    } catch {
      setEditError("Network error");
    } finally {
      setEditSaving(false);
    }
  }

  // Shown under a form when the server refused it for going past the
  // yearly limit. Admins get the two override choices.
  function overridePanel(over: OverLimit, busy: boolean, submit: (o: "PAID" | "UNPAID") => void) {
    if (!isAdmin) return null;
    const dayWord = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        <span className="font-medium">Admin override:</span>
        <button
          type="button"
          disabled={busy}
          onClick={() => submit("PAID")}
          className="rounded-md border border-amber-300 bg-white px-2.5 py-1 font-medium hover:bg-amber-100 disabled:opacity-50"
        >
          Allow, keep paid
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => submit("UNPAID")}
          className="rounded-md border border-amber-300 bg-white px-2.5 py-1 font-medium hover:bg-amber-100 disabled:opacity-50"
        >
          Allow, {dayWord(over.overBy)} unpaid
        </button>
        <InfoTip text="Paid: all days are paid. Unpaid: the days past the limit come off a salaried employee's pay in Payroll once approved. It still needs approval either way." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {paidDayLimit !== undefined && (
        <PaidDaysBar
          year={currentYear}
          limit={paidDayLimit}
          approved={approvedPaid}
          pending={pendingPaid}
          unpaid={unpaidThisYear}
        />
      )}
      {showAddForm && (
        <section className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="flex items-start justify-between gap-2">
            <h2 className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Request time off
              <InfoTip
                text={`Starts as pending. Once an Admin or PM approves it, it blocks scheduling this ${kind} for those days (a PM or Admin can still override).${
                  paidDayLimit !== undefined
                    ? ` Paid time off is capped at ${paidDayLimit} days a year; only an Admin can go past it. Unpaid days come off a salaried employee's pay once approved.`
                    : ""
                }`}
              />
            </h2>
            <button type="button" onClick={() => setShowAddForm(false)} className="text-xs text-gray-400 hover:text-gray-600">
              Close
            </button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void addTimeOff();
            }}
            className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            <div>
              <label className={label} htmlFor={`${idPrefix}-start`}>
                Start date
              </label>
              <input
                id={`${idPrefix}-start`}
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setOverLimit(null);
                }}
                className={input}
              />
            </div>
            <div>
              <label className={label} htmlFor={`${idPrefix}-end`}>
                End date
              </label>
              <input
                id={`${idPrefix}-end`}
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setOverLimit(null);
                }}
                className={input}
              />
            </div>
            <div>
              <label className={label} htmlFor={`${idPrefix}-type`}>
                Type
              </label>
              <select
                id={`${idPrefix}-type`}
                value={type}
                onChange={(e) => {
                  setType(e.target.value as TimeOffRow["type"]);
                  setOverLimit(null);
                }}
                className={input}
              >
                {TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2 lg:col-span-1">
              <label className={label} htmlFor={`${idPrefix}-notes`}>
                Notes (optional)
              </label>
              <input id={`${idPrefix}-notes`} value={notes} onChange={(e) => setNotes(e.target.value)} className={input} />
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              {error ? <p className="mb-2 text-xs text-red-500">{error}</p> : null}
              {overLimit ? overridePanel(overLimit, loading, (o) => void addTimeOff(o)) : null}
              <button
                type="submit"
                disabled={loading}
                className="mt-2 rounded-md bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50"
              >
                {loading ? "Submitting…" : "Submit request"}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Time off
            {pendingCount > 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold normal-case text-amber-800">
                {pendingCount} pending
              </span>
            )}
            {paidDayLimit === undefined && thisYearDays > 0 && (
              <span className="text-[11px] font-normal normal-case tracking-normal text-gray-400">
                {fmtDays(thisYearDays)} {thisYearDays === 1 ? "day" : "days"} in {currentYear}
              </span>
            )}
          </h2>
          {!showAddForm && (
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              aria-label="Request time off"
              title="Request time off"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pink-600 text-lg font-semibold leading-none text-white shadow hover:bg-pink-500"
            >
              +
            </button>
          )}
        </div>
        {reviewError ? <p className="px-4 pt-2 text-xs text-red-500">{reviewError}</p> : null}
        {sorted.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">No time off yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {sorted.map((entry) => {
              if (editingId === entry.id) {
                return (
                  <li key={entry.id} className="bg-pink-50/40 px-4 py-3">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <label className={label} htmlFor={`${idPrefix}-edit-start-${entry.id}`}>
                          Start date
                        </label>
                        <input
                          id={`${idPrefix}-edit-start-${entry.id}`}
                          type="date"
                          value={editStart}
                          onChange={(e) => {
                            setEditStart(e.target.value);
                            setEditOverLimit(null);
                          }}
                          className={input}
                        />
                      </div>
                      <div>
                        <label className={label} htmlFor={`${idPrefix}-edit-end-${entry.id}`}>
                          End date
                        </label>
                        <input
                          id={`${idPrefix}-edit-end-${entry.id}`}
                          type="date"
                          value={editEnd}
                          onChange={(e) => {
                            setEditEnd(e.target.value);
                            setEditOverLimit(null);
                          }}
                          className={input}
                        />
                      </div>
                      <div>
                        <label className={label} htmlFor={`${idPrefix}-edit-type-${entry.id}`}>
                          Type
                        </label>
                        <select
                          id={`${idPrefix}-edit-type-${entry.id}`}
                          value={editType}
                          onChange={(e) => {
                            setEditType(e.target.value as TimeOffRow["type"]);
                            setEditOverLimit(null);
                          }}
                          className={input}
                        >
                          {TYPE_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={label} htmlFor={`${idPrefix}-edit-notes-${entry.id}`}>
                          Notes
                        </label>
                        <input
                          id={`${idPrefix}-edit-notes-${entry.id}`}
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          className={input}
                        />
                      </div>
                    </div>
                    {editError ? <p className="mt-2 text-xs text-red-500">{editError}</p> : null}
                    {editOverLimit ? overridePanel(editOverLimit, editSaving, (o) => void saveEdit(entry.id, o)) : null}
                    {entry.status !== "PENDING" && (
                      <p className="mt-2 text-xs text-gray-500">Changing the dates or type sends it back for approval.</p>
                    )}
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => void saveEdit(entry.id)}
                        disabled={editSaving}
                        className="rounded-md bg-pink-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-pink-500 disabled:opacity-50"
                      >
                        {editSaving ? "Saving…" : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        disabled={editSaving}
                        className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </li>
                );
              }

              const status = statusFor(entry, today);
              const typeLabel = TYPE_OPTIONS.find((o) => o.value === entry.type)?.label ?? entry.type;
              const days = daysForEntry(entry);
              const reviewInfo = [
                entry.requestedBy ? `Requested by ${entry.requestedBy}` : null,
                entry.reviewedBy ? `${entry.status === "DENIED" ? "Denied" : "Approved"} by ${entry.reviewedBy}` : null,
                entry.reviewNote ? `Note: ${entry.reviewNote}` : null,
                entry.status === "PENDING" && reviewBlock ? reviewBlock : null,
              ]
                .filter(Boolean)
                .join(". ");
              const canReview = !reviewBlock;
              const busy = reviewingId === entry.id;
              return (
                <li key={entry.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className={`min-w-0 ${entry.status === "DENIED" ? "opacity-50" : ""}`}>
                    <p className={`text-sm font-medium text-gray-900 ${entry.status === "DENIED" ? "line-through" : ""}`}>
                      {formatRange(entry.startDate, entry.endDate)}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-gray-500">
                      <span>
                        {fmtDays(days)} {days === 1 ? "day" : "days"}
                      </span>
                      <span className="text-gray-300">·</span>
                      <span>{typeLabel}</span>
                      {entry.limitOverride && (
                        <span
                          className="rounded-full bg-amber-50 px-1.5 text-[10px] font-medium text-amber-800"
                          title={`Admin let this go past the ${paidDayLimit ?? 15}-day paid limit`}
                        >
                          {entry.limitOverride === "UNPAID" ? `${fmtDays(entry.unpaidDays)} unpaid` : "Over limit, paid"}
                        </span>
                      )}
                      {entry.notes && (
                        <>
                          <span className="text-gray-300">·</span>
                          <span className="max-w-[260px] truncate" title={entry.notes}>
                            {entry.notes}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span
                      className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${status.cls}`}
                      title={reviewInfo || undefined}
                    >
                      {status.label}
                    </span>
                    {canReview && entry.status === "PENDING" && (
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => void review(entry.id, "APPROVED")}
                          disabled={busy}
                          className="rounded-md bg-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-500 disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => void review(entry.id, "DENIED")}
                          disabled={busy}
                          className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          Deny
                        </button>
                      </div>
                    )}
                    <div className="flex gap-3 text-xs text-gray-400">
                      {canReview && entry.status === "APPROVED" && (
                        <button type="button" onClick={() => void review(entry.id, "DENIED")} disabled={busy} className="hover:text-gray-700 disabled:opacity-40">
                          Revoke
                        </button>
                      )}
                      {canReview && entry.status === "DENIED" && (
                        <button type="button" onClick={() => void review(entry.id, "APPROVED")} disabled={busy} className="hover:text-gray-700 disabled:opacity-40">
                          Approve
                        </button>
                      )}
                      <button type="button" onClick={() => startEdit(entry)} className="hover:text-gray-700">
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteTimeOff(entry.id)}
                        disabled={deletingId === entry.id}
                        className="hover:text-red-600 disabled:opacity-40"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

// "Aug 10 – 14, 2026", "Aug 28 – Sep 2, 2026", or one date for a single day.
function formatRange(startIso: string, endIso: string): string {
  const start = new Date(`${dateStr(startIso)}T00:00:00.000Z`);
  const end = new Date(`${dateStr(endIso)}T00:00:00.000Z`);
  if (dateStr(startIso) === dateStr(endIso)) return formatDate(startIso);
  const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) => d.toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  const sameMonth = sameYear && start.getUTCMonth() === end.getUTCMonth();
  if (sameMonth) return `${fmt(start, { month: "short", day: "numeric" })} – ${fmt(end, { day: "numeric" })}, ${end.getUTCFullYear()}`;
  if (sameYear) return `${fmt(start, { month: "short", day: "numeric" })} – ${fmt(end, { month: "short", day: "numeric" })}, ${end.getUTCFullYear()}`;
  return `${formatDate(startIso)} – ${formatDate(endIso)}`;
}

// Days count as "1" / "1.5" (half days), never "1.50".
function fmtDays(n: number): string {
  return String(Math.round(n * 10) / 10);
}

/** This year's paid days against the yearly limit, same look as the
 * commission accelerator bar: approved solid, pending lighter, red once
 * an Admin let it go past the limit. */
function PaidDaysBar({
  year,
  limit,
  approved,
  pending,
  unpaid,
}: {
  year: string;
  limit: number;
  approved: number;
  pending: number;
  unpaid: number;
}) {
  const used = approved + pending;
  const over = used > limit;
  const remaining = Math.max(0, limit - used);
  const scale = Math.max(limit, used);
  const approvedPct = (approved / scale) * 100;
  const pendingPct = (pending / scale) * 100;
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Paid time off {year}
          <InfoTip text={`${limit} paid days a year. Pending requests count so they can't stack past it. Unpaid days don't count.`} />
        </h2>
        <span className="text-xs tabular-nums text-gray-700">
          <span className="font-semibold">{fmtDays(used)}</span> of {limit} days used
        </span>
      </div>
      <div className={`mt-1.5 flex h-2.5 w-full overflow-hidden rounded-full ${over ? "bg-red-100" : "bg-gray-100"}`}>
        <div className={`h-full ${over ? "bg-red-500" : "bg-pink-600"}`} style={{ width: `${approvedPct}%` }} />
        <div className={`h-full ${over ? "bg-red-300" : "bg-pink-300"}`} style={{ width: `${pendingPct}%` }} />
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-500">
        <span className="flex items-center gap-1">
          <span className={`inline-block h-2 w-2 rounded-full ${over ? "bg-red-500" : "bg-pink-600"}`} />
          {fmtDays(approved)} approved
        </span>
        {pending > 0 && (
          <span className="flex items-center gap-1">
            <span className={`inline-block h-2 w-2 rounded-full ${over ? "bg-red-300" : "bg-pink-300"}`} />
            {fmtDays(pending)} pending
          </span>
        )}
        {over ? (
          <span className="font-semibold text-red-600">{fmtDays(used - limit)} over the limit (Admin override)</span>
        ) : (
          <span className="font-medium text-gray-700">{fmtDays(remaining)} remaining</span>
        )}
        {unpaid > 0 && <span>{fmtDays(unpaid)} unpaid, not counted</span>}
      </div>
    </section>
  );
}
