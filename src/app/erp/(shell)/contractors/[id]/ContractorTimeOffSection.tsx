"use client";

import { useState } from "react";
import { inputClass, labelClass } from "@/app/erp/components/ui";

export type TimeOffRow = {
  id: string;
  startDate: string;
  endDate: string;
  type: "VACATION" | "SICK" | "HALF_DAY" | "UNPAID" | "OTHER";
  notes: string | null;
};

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
  const start = dateStr(row.startDate);
  const end = dateStr(row.endDate);
  if (today >= start && today <= end) return { label: "On PTO now", cls: "bg-amber-100 text-amber-800 border-amber-300" };
  if (today < start) return { label: "Upcoming", cls: "bg-blue-50 text-blue-700 border-blue-200" };
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
function daysForEntry(entry: TimeOffRow): number {
  const days = daysInclusive(entry.startDate, entry.endDate);
  return entry.type === "HALF_DAY" ? days * 0.5 : days;
}

export function ContractorTimeOffSection({
  contractorId,
  initialTimeOff,
}: {
  contractorId: string;
  initialTimeOff: TimeOffRow[];
}) {
  const [entries, setEntries] = useState<TimeOffRow[]>(initialTimeOff);
  const [showAddForm, setShowAddForm] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [type, setType] = useState<TimeOffRow["type"]>("VACATION");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [editType, setEditType] = useState<TimeOffRow["type"]>("VACATION");
  const [editNotes, setEditNotes] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  const today = todayUtcStr();
  const currentYear = today.slice(0, 4);
  const sorted = [...entries].sort((a, b) => dateStr(b.startDate).localeCompare(dateStr(a.startDate)));
  const totalDays = entries.reduce((sum, e) => sum + daysForEntry(e), 0);
  const thisYearDays = entries
    .filter((e) => dateStr(e.startDate).slice(0, 4) === currentYear)
    .reduce((sum, e) => sum + daysForEntry(e), 0);

  async function addTimeOff(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
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
      const res = await fetch(`/api/erp/contractors/${contractorId}/time-off`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ startDate, endDate, type, notes: notes.trim() || undefined }),
      });
      const data = (await res.json()) as TimeOffRow & { error?: string };
      if (!res.ok) {
        setError(data.error || "Failed to add time off");
        return;
      }
      setEntries((prev) => [data, ...prev]);
      setStartDate("");
      setEndDate("");
      setType("VACATION");
      setNotes("");
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
      const res = await fetch(`/api/erp/contractors/${contractorId}/time-off/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
    } catch {
      setEntries(previous);
    } finally {
      setDeletingId(null);
    }
  }

  function startEdit(entry: TimeOffRow) {
    setEditingId(entry.id);
    setEditStart(dateStr(entry.startDate));
    setEditEnd(dateStr(entry.endDate));
    setEditType(entry.type);
    setEditNotes(entry.notes ?? "");
    setEditError("");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError("");
  }

  async function saveEdit(id: string) {
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
      const res = await fetch(`/api/erp/contractors/${contractorId}/time-off/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ startDate: editStart, endDate: editEnd, type: editType, notes: editNotes.trim() || null }),
      });
      const data = (await res.json()) as TimeOffRow & { error?: string };
      if (!res.ok) {
        setEditError(data.error || "Failed to save changes");
        return;
      }
      setEntries((prev) => prev.map((e) => (e.id === id ? data : e)));
      setEditingId(null);
    } catch {
      setEditError("Network error");
    } finally {
      setEditSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {showAddForm && (
        <section className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Log time off</h2>
            <button type="button" onClick={() => setShowAddForm(false)} className="text-xs text-gray-400 hover:text-gray-600">
              Close
            </button>
          </div>
        <p className="mt-1 text-xs text-gray-500">
          Any time off logged here blocks scheduling this contractor on the calendar for those days. A PM or Admin can
          override and schedule them anyway if needed.
        </p>
        <form onSubmit={addTimeOff} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className={label} htmlFor="cpto-start">
              Start date
            </label>
            <input
              id="cpto-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={input}
            />
          </div>
          <div>
            <label className={label} htmlFor="cpto-end">
              End date
            </label>
            <input
              id="cpto-end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={input}
            />
          </div>
          <div>
            <label className={label} htmlFor="cpto-type">
              Type
            </label>
            <select
              id="cpto-type"
              value={type}
              onChange={(e) => setType(e.target.value as TimeOffRow["type"])}
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
            <label className={label} htmlFor="cpto-notes">
              Notes (optional)
            </label>
            <input id="cpto-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className={input} />
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            {error ? <p className="mb-2 text-xs text-red-500">{error}</p> : null}
            <button
              type="submit"
              disabled={loading}
              className="rounded-md bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50"
            >
              {loading ? "Adding…" : "Add time off"}
            </button>
          </div>
        </form>
        </section>
      )}

      <section className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Time off on file</h2>
          {!showAddForm && (
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              aria-label="Log time off"
              title="Log time off"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pink-600 text-lg font-semibold leading-none text-white shadow hover:bg-pink-500"
            >
              +
            </button>
          )}
        </div>
        <div className="mt-3 overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-100 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2 font-medium">Dates</th>
                <th className="px-3 py-2 font-medium">Days</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Notes</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-gray-500">
                    No time off logged yet.
                  </td>
                </tr>
              ) : (
                sorted.map((entry) => {
                  if (editingId === entry.id) {
                    return (
                      <tr key={entry.id} className="bg-pink-50/40">
                        <td colSpan={6} className="px-3 py-3">
                          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <div>
                              <label className={label} htmlFor={`cpto-edit-start-${entry.id}`}>
                                Start date
                              </label>
                              <input
                                id={`cpto-edit-start-${entry.id}`}
                                type="date"
                                value={editStart}
                                onChange={(e) => setEditStart(e.target.value)}
                                className={input}
                              />
                            </div>
                            <div>
                              <label className={label} htmlFor={`cpto-edit-end-${entry.id}`}>
                                End date
                              </label>
                              <input
                                id={`cpto-edit-end-${entry.id}`}
                                type="date"
                                value={editEnd}
                                onChange={(e) => setEditEnd(e.target.value)}
                                className={input}
                              />
                            </div>
                            <div>
                              <label className={label} htmlFor={`cpto-edit-type-${entry.id}`}>
                                Type
                              </label>
                              <select
                                id={`cpto-edit-type-${entry.id}`}
                                value={editType}
                                onChange={(e) => setEditType(e.target.value as TimeOffRow["type"])}
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
                              <label className={label} htmlFor={`cpto-edit-notes-${entry.id}`}>
                                Notes
                              </label>
                              <input
                                id={`cpto-edit-notes-${entry.id}`}
                                value={editNotes}
                                onChange={(e) => setEditNotes(e.target.value)}
                                className={input}
                              />
                            </div>
                          </div>
                          {editError ? <p className="mt-2 text-xs text-red-500">{editError}</p> : null}
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
                        </td>
                      </tr>
                    );
                  }

                  const status = statusFor(entry, today);
                  const typeLabel = TYPE_OPTIONS.find((o) => o.value === entry.type)?.label ?? entry.type;
                  return (
                    <tr key={entry.id} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-3 py-2 font-medium text-gray-900">
                        {formatDate(entry.startDate)}
                        {dateStr(entry.endDate) !== dateStr(entry.startDate) ? ` – ${formatDate(entry.endDate)}` : ""}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-gray-700">{daysForEntry(entry)}</td>
                      <td className="px-3 py-2">
                        <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-600">
                          {typeLabel}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${status.cls}`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="max-w-[220px] truncate px-3 py-2 text-gray-500" title={entry.notes ?? undefined}>
                        {entry.notes || "—"}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-3">
                          <button
                            type="button"
                            onClick={() => startEdit(entry)}
                            className="text-xs text-gray-400 hover:text-gray-700"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteTimeOff(entry.id)}
                            disabled={deletingId === entry.id}
                            className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {sorted.length > 0 && (
              <tfoot>
                <tr className="border-t border-gray-200 bg-gray-50">
                  <td className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">This year</td>
                  <td className="px-3 py-2 text-sm font-semibold tabular-nums text-gray-900">{thisYearDays}</td>
                  <td colSpan={4} className="px-3 py-2 text-xs text-gray-500">
                    {thisYearDays === 1 ? "day" : "days"} off logged in {currentYear}
                  </td>
                </tr>
                <tr className="border-t border-gray-200 bg-gray-50">
                  <td className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">All-time</td>
                  <td className="px-3 py-2 text-sm font-semibold tabular-nums text-gray-900">{totalDays}</td>
                  <td colSpan={4} className="px-3 py-2 text-xs text-gray-500">
                    {totalDays === 1 ? "day" : "days"} off logged across {entries.length}{" "}
                    {entries.length === 1 ? "entry" : "entries"}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
    </div>
  );
}
