"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { SearchableSelect } from "@/app/erp/components/SearchableSelect";
import { Button, Modal, inputClass, labelClass } from "@/app/erp/components/ui";
import { DownloadCsvButton } from "@/app/erp/components/DownloadCsvButton";
import { addDays, dayKey, formatHours, formatShortDate } from "@/lib/erp/schedule";
import { todayEasternAsUtcMidnight } from "@/lib/erp/dates";
import { formatTime12, shiftHours } from "@/lib/erp/janitorialSchedule";
import type { HoursSource, ResolvedShiftHours } from "@/lib/erp/janitorialHours";
import { buildCsv, downloadCsv, type CsvColumn } from "@/lib/erp/csv";

const SOURCE_BADGE: Record<HoursSource, { label: string; cls: string }> = {
  CLOCKED: { label: "Clocked", cls: "bg-emerald-100 text-emerald-800" },
  NO_CLOCK_OUT: { label: "No clock-out", cls: "bg-amber-100 text-amber-800" },
  IN_PROGRESS: { label: "Clocked in now", cls: "bg-sky-100 text-sky-800" },
  CORRECTED: { label: "Corrected", cls: "bg-violet-100 text-violet-800" },
  DIDNT_WORK: { label: "Didn't work", cls: "bg-gray-200 text-gray-700" },
  FROM_SCHEDULE: { label: "From schedule", cls: "bg-blue-50 text-blue-700" },
  TIME_OFF: { label: "Time off", cls: "bg-gray-100 text-gray-600" },
  SKIPPED: { label: "Skipped", cls: "bg-gray-100 text-gray-500" },
  UPCOMING: { label: "Upcoming", cls: "bg-white text-gray-400 ring-1 ring-inset ring-gray-200" },
};

function startOfWeek(d: Date): Date {
  return addDays(d, -d.getUTCDay());
}

function weekdayLabel(dateKey: string): string {
  return new Date(`${dateKey}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

function timeRange(start: string | null, end: string | null): string {
  if (!start) return "";
  return end ? `${formatTime12(start)} to ${formatTime12(end)}` : `${formatTime12(start)} to now`;
}

export function HoursReview() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(todayEasternAsUtcMidnight()));
  const [rows, setRows] = useState<ResolvedShiftHours[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [reviewOnly, setReviewOnly] = useState(false);
  const [editing, setEditing] = useState<ResolvedShiftHours | null>(null);

  const weekEnd = addDays(weekStart, 6);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/erp/janitorial/hours?start=${dayKey(weekStart)}&end=${dayKey(addDays(weekStart, 6))}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load hours");
      setRows(json.rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load hours");
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => {
    void load();
  }, [load]);

  const employeeOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const r of rows ?? []) byId.set(r.employeeId, r.employeeName);
    return Array.from(byId, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [rows]);

  const visible = (rows ?? []).filter((r) => (!employeeFilter || r.employeeId === employeeFilter) && (!reviewOnly || r.flags.length > 0));

  const groups = useMemo(() => {
    const byEmployee = new Map<string, { name: string; rows: ResolvedShiftHours[] }>();
    for (const r of visible) {
      const g = byEmployee.get(r.employeeId) ?? { name: r.employeeName, rows: [] };
      g.rows.push(r);
      byEmployee.set(r.employeeId, g);
    }
    return Array.from(byEmployee.entries()).sort((a, b) => a[1].name.localeCompare(b[1].name));
  }, [visible]);

  const all = rows ?? [];
  const totalHours = all.reduce((s, r) => s + r.hours, 0);
  const clockedCount = all.filter((r) => r.source === "CLOCKED").length;
  const scheduleCount = all.filter((r) => r.source === "FROM_SCHEDULE").length;
  const reviewCount = all.filter((r) => r.flags.length > 0).length;

  function exportCsv() {
    const columns: CsvColumn<ResolvedShiftHours>[] = [
      { header: "Janitor", get: (r) => r.employeeName },
      { header: "Date", get: (r) => r.date },
      { header: "Building", get: (r) => r.buildingName },
      { header: "Scheduled", get: (r) => (r.scheduledStart ? `${r.scheduledStart}-${r.scheduledEnd}` : "Not scheduled") },
      { header: "Worked", get: (r) => (r.actualStart ? `${r.actualStart}-${r.actualEnd ?? ""}` : "") },
      { header: "Hours", get: (r) => r.hours.toFixed(2) },
      { header: "Source", get: (r) => SOURCE_BADGE[r.source].label },
      { header: "Needs review", get: (r) => r.flags.join("; ") },
      { header: "Notes", get: (r) => r.notes ?? "" },
    ];
    const total = visible.reduce((s, r) => s + r.hours, 0);
    downloadCsv(
      `janitorial-hours-${dayKey(weekStart)}-to-${dayKey(weekEnd)}.csv`,
      buildCsv(columns, visible, [["TOTAL", "", "", "", "", total.toFixed(2), "", "", ""]])
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setWeekStart((w) => addDays(w, -7))}
            aria-label="Previous week"
            className="flex h-7 w-7 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-800"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="min-w-[170px] text-center text-sm font-semibold text-gray-800">
            {formatShortDate(dayKey(weekStart))} to {formatShortDate(dayKey(weekEnd))}
          </span>
          <button
            type="button"
            onClick={() => setWeekStart((w) => addDays(w, 7))}
            aria-label="Next week"
            className="flex h-7 w-7 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-800"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <Button variant="secondary" size="xs" className="ml-2" onClick={() => setWeekStart(startOfWeek(todayEasternAsUtcMidnight()))}>
            This week
          </Button>
          {loading && <span className="ml-2 text-xs text-gray-400">Loading…</span>}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SearchableSelect
            value={employeeFilter}
            onChange={setEmployeeFilter}
            options={employeeOptions}
            placeholder="Search janitors…"
            allLabel="All janitors"
            className="w-52"
          />
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={reviewOnly} onChange={(e) => setReviewOnly(e.target.checked)} className="h-4 w-4 text-pink-600" />
            Needs review only
          </label>
          <DownloadCsvButton onClick={exportCsv} disabled={visible.length === 0} title="Download the hours shown" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total hours", value: formatHours(Math.round(totalHours * 100) / 100) },
          { label: "Clocked shifts", value: String(clockedCount) },
          { label: "From schedule", value: String(scheduleCount), hint: "No clock-in, scheduled hours used" },
          { label: "Needs review", value: String(reviewCount), warn: reviewCount > 0 },
        ].map((t) => (
          <div key={t.label} className="rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm" title={t.hint}>
            <p className="text-xs text-gray-500">{t.label}</p>
            <p className={`mt-0.5 text-xl font-semibold tabular-nums ${t.warn ? "text-amber-600" : "text-gray-900"}`}>{t.value}</p>
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-gray-300 bg-gray-200 text-xs font-semibold uppercase text-gray-700">
              <tr>
                <th className="px-4 py-3">Day</th>
                <th className="px-4 py-3">Building</th>
                <th className="px-4 py-3">Scheduled</th>
                <th className="px-4 py-3">Worked</th>
                <th className="px-4 py-3 text-right">Hours</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows && groups.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    {reviewOnly ? "Nothing needs review this week." : "No janitorial shifts this week."}
                  </td>
                </tr>
              ) : (
                groups.map(([employeeId, g]) => {
                  const subtotal = g.rows.reduce((s, r) => s + r.hours, 0);
                  return (
                    <Fragment key={employeeId}>
                      <tr className="border-t border-gray-200 bg-gray-50">
                        <td colSpan={4} className="px-4 py-2 font-semibold text-gray-900">{g.name}</td>
                        <td className="px-4 py-2 text-right font-semibold tabular-nums text-gray-900">{formatHours(Math.round(subtotal * 100) / 100)}</td>
                        <td colSpan={2} />
                      </tr>
                      {g.rows.map((r) => {
                        const badge = SOURCE_BADGE[r.source];
                        const muted = r.source === "UPCOMING" || r.source === "SKIPPED" || r.source === "TIME_OFF";
                        return (
                          <tr key={r.key} className={`border-t border-gray-100 align-top ${muted ? "text-gray-400" : ""}`}>
                            <td className="whitespace-nowrap px-4 py-2.5">{weekdayLabel(r.date)}</td>
                            <td className="px-4 py-2.5">{r.buildingName}</td>
                            <td className="whitespace-nowrap px-4 py-2.5 text-gray-600">
                              {r.scheduledStart ? timeRange(r.scheduledStart, r.scheduledEnd) : <span className="text-amber-700">Not scheduled</span>}
                            </td>
                            <td className="whitespace-nowrap px-4 py-2.5">
                              {r.source === "FROM_SCHEDULE" ? <span className="text-gray-400">Same as scheduled</span> : timeRange(r.actualStart, r.actualEnd)}
                            </td>
                            <td className="px-4 py-2.5 text-right font-medium tabular-nums">{r.source === "UPCOMING" ? "" : r.hours.toFixed(2)}</td>
                            <td className="px-4 py-2.5">
                              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${badge.cls}`}>{badge.label}</span>
                              {r.flags.map((f) => (
                                <p key={f} className="mt-1 text-xs text-amber-700">{f}</p>
                              ))}
                              {r.notes && <p className="mt-1 text-xs text-gray-500">{r.notes}</p>}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              {r.source !== "UPCOMING" && r.source !== "IN_PROGRESS" && (
                                <button type="button" onClick={() => setEditing(r)} className="text-xs font-medium text-pink-600 hover:underline">
                                  {r.source === "CORRECTED" || r.source === "DIDNT_WORK" ? "Edit" : "Correct"}
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-xs text-gray-500">
        Hours come from the janitor&apos;s clock-in and clock-out. If they didn&apos;t clock in, their scheduled hours are used,
        unless they have time off logged or the shift was skipped on the calendar.
      </p>

      {editing && (
        <CorrectionDialog
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

function CorrectionDialog({ row, onClose, onSaved }: { row: ResolvedShiftHours; onClose: () => void; onSaved: () => void }) {
  const [worked, setWorked] = useState(row.source !== "DIDNT_WORK");
  const [startTime, setStartTime] = useState(row.actualStart ?? row.scheduledStart ?? "18:00");
  const [endTime, setEndTime] = useState(row.actualEnd ?? row.scheduledEnd ?? "22:00");
  const [notes, setNotes] = useState(row.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const isCorrected = row.source === "CORRECTED" || row.source === "DIDNT_WORK";

  async function send(url: string, method: string, body?: unknown) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Something went wrong");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    const target = row.entryId && row.unscheduled ? { entryId: row.entryId } : { shiftKey: row.shiftKey, date: row.date };
    void send("/api/erp/janitorial/time-entries", "PUT", { ...target, ...(worked ? { startTime, endTime } : { noShow: true }), notes });
  }

  const hours = worked && startTime && endTime && startTime !== endTime ? shiftHours(startTime, endTime) : 0;

  return (
    <Modal open onClose={onClose} size="md" dismissible={false}>
      <form onSubmit={save} className="space-y-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Correct hours</h3>
          <p className="text-sm text-gray-600">
            {row.employeeName}, {row.buildingName}, {weekdayLabel(row.date)}
          </p>
          {row.scheduledStart && <p className="text-xs text-gray-500">Scheduled {timeRange(row.scheduledStart, row.scheduledEnd)}</p>}
        </div>

        <div className="flex gap-2 rounded-md bg-gray-50 p-1 text-sm">
          {([
            [true, "Worked"],
            [false, "Didn't work"],
          ] as const).map(([value, label]) => (
            <button
              key={label}
              type="button"
              onClick={() => setWorked(value)}
              className={`flex-1 rounded px-3 py-1.5 font-medium ${worked === value ? "bg-white text-pink-600 shadow-sm" : "text-gray-600 hover:text-gray-900"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {worked && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass.default} htmlFor="cd-start">Start</label>
              <input id="cd-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputClass.md} />
            </div>
            <div>
              <label className={labelClass.default} htmlFor="cd-end">End</label>
              <input id="cd-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={inputClass.md} />
            </div>
            {hours > 0 && <p className="col-span-2 -mt-1 text-xs text-gray-500">{formatHours(hours)}</p>}
          </div>
        )}

        <div>
          <label className={labelClass.default} htmlFor="cd-notes">Note (optional)</label>
          <input id="cd-notes" type="text" placeholder="e.g. Forgot to clock out, confirmed with supervisor" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass.md} />
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="sm" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          {isCorrected && row.entryId && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              disabled={saving}
              onClick={() => send(`/api/erp/janitorial/time-entries/${row.entryId}/correction`, "DELETE")}
            >
              Undo correction
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
}
