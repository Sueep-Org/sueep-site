"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { SearchableSelect } from "@/app/erp/components/SearchableSelect";
import { Button, Modal, inputClass, labelClass, useConfirm } from "@/app/erp/components/ui";
import { dayCellLabelWithYear, dayKey, formatHours, formatShortDate, monthLabel, monthMatrix, startOfMonth } from "@/lib/erp/schedule";
import { todayEasternAsUtcMidnight } from "@/lib/erp/dates";
import {
  WEEKDAY_SHORT,
  formatTime12,
  minutesToTime,
  shiftHours,
  timeToMinutes,
  type JanitorialShift,
} from "@/lib/erp/janitorialSchedule";
import { CollapsibleSection } from "./CollapsibleSection";

type Option = { id: string; name: string };
type ScheduleResponse = { shifts: JanitorialShift[]; canEdit: boolean; contracts: Option[]; employees: Option[] };

/** What the shift dialog is open for: a new shift on a day, or an existing one. */
type Editing = { kind: "new"; date: string; startTime: string } | { kind: "existing"; shift: JanitorialShift };

const DEFAULT_START_TIME = "18:00";

// Same pastel chip treatment as the Projects calendar (SchedulePlanner's
// CALENDAR_GROUP_CHIP_CLASS), one color per building so a contract reads the
// same across days.
const CONTRACT_CHIP_CLASSES = [
  "bg-teal-200 text-teal-900 hover:bg-teal-300",
  "bg-sky-200 text-sky-900 hover:bg-sky-300",
  "bg-violet-200 text-violet-900 hover:bg-violet-300",
  "bg-orange-200 text-orange-900 hover:bg-orange-300",
  "bg-lime-200 text-lime-900 hover:bg-lime-300",
  "bg-indigo-200 text-indigo-900 hover:bg-indigo-300",
  "bg-rose-200 text-rose-900 hover:bg-rose-300",
  "bg-yellow-200 text-yellow-900 hover:bg-yellow-300",
];

function chipClassFor(contractId: string): string {
  let h = 0;
  for (const ch of contractId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return CONTRACT_CHIP_CLASSES[h % CONTRACT_CHIP_CLASSES.length];
}

export function JanitorialCalendar({ initialContractId = "" }: { initialContractId?: string }) {
  const [cursor, setCursor] = useState(() => startOfMonth(todayEasternAsUtcMidnight()));
  const [data, setData] = useState<ScheduleResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [contractFilter, setContractFilter] = useState(initialContractId);
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState<Editing | null>(null);

  const todayKey = dayKey(todayEasternAsUtcMidnight());
  const matrix = useMemo(() => monthMatrix(cursor), [cursor]);
  const cells = matrix.flat();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const grid = monthMatrix(cursor).flat();
      const res = await fetch(`/api/erp/janitorial/schedule?start=${dayKey(grid[0])}&end=${dayKey(grid[grid.length - 1])}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load the schedule");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the schedule");
    } finally {
      setLoading(false);
    }
  }, [cursor]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!filterOpen) return;
    function onDown(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [filterOpen]);

  const visibleShifts = useMemo(
    () =>
      (data?.shifts ?? []).filter(
        (s) => (!contractFilter || s.contractId === contractFilter) && (!employeeFilter || s.employeeId === employeeFilter)
      ),
    [data, contractFilter, employeeFilter]
  );

  const shiftsByDay = useMemo(() => {
    const map = new Map<string, JanitorialShift[]>();
    for (const s of visibleShifts) {
      const list = map.get(s.date) ?? [];
      list.push(s);
      map.set(s.date, list);
    }
    return map;
  }, [visibleShifts]);

  // Totals only count this month (the grid also shows spill-over days).
  const monthKey = dayKey(cursor).slice(0, 7);
  const monthShifts = visibleShifts.filter((s) => s.status !== "CANCELLED" && s.date.slice(0, 7) === monthKey);
  const totalHours = monthShifts.reduce((sum, s) => sum + s.hours, 0);
  const needsCover = monthShifts.filter((s) => s.timeOffType && s.date >= todayKey).length;

  const employeeOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const e of data?.employees ?? []) byId.set(e.id, e.name);
    for (const s of data?.shifts ?? []) byId.set(s.employeeId, s.employeeName);
    return Array.from(byId, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [data]);

  const canEdit = !!data?.canEdit && (data?.contracts.length ?? 0) > 0;
  const filtersActive = contractFilter !== "" || employeeFilter !== "";

  const calendarNav = (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setCursor((c) => new Date(Date.UTC(c.getUTCFullYear(), c.getUTCMonth() - 1, 1)))}
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
          onClick={() => setCursor((c) => new Date(Date.UTC(c.getUTCFullYear(), c.getUTCMonth() + 1, 1)))}
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
            filtersActive ? "border-pink-300 bg-pink-50 text-pink-600" : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4.5h18M6.75 12h10.5M10.5 19.5h3" />
          </svg>
        </button>
        {filterOpen ? (
          <div className="absolute right-0 z-20 mt-2 w-64 space-y-3 rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Building</p>
              <SearchableSelect
                value={contractFilter}
                onChange={setContractFilter}
                options={(data?.contracts ?? []).map((c) => ({ value: c.id, label: c.name }))}
                placeholder="Search buildings…"
                allLabel="All buildings"
                className="mt-1.5"
              />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Janitor</p>
              <SearchableSelect
                value={employeeFilter}
                onChange={setEmployeeFilter}
                options={employeeOptions}
                placeholder="Search janitors…"
                allLabel="All janitors"
                className="mt-1.5"
              />
            </div>
            {filtersActive && (
              <button
                type="button"
                onClick={() => {
                  setContractFilter("");
                  setEmployeeFilter("");
                }}
                className="text-xs text-pink-600 hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <CollapsibleSection title="Calendar" headerExtra={calendarNav}>
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
          <span>
            {monthShifts.length} shift{monthShifts.length === 1 ? "" : "s"} this month, {formatHours(totalHours)}
          </span>
          {needsCover > 0 && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-700">
              {needsCover} need{needsCover === 1 ? "s" : ""} cover
            </span>
          )}
          {loading && <span className="text-gray-400">Loading…</span>}
          {error && <span className="text-red-600">{error}</span>}
          {data && data.canEdit && data.contracts.length === 0 && (
            <span>
              No active janitorial contracts yet. Create one on the{" "}
              <Link href="/erp/janitorial" className="text-pink-600 hover:underline">Janitorial page</Link> first.
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[720px]">
            <div className="grid grid-cols-7 gap-px rounded-lg border border-gray-200 bg-gray-200 text-center text-[10px] font-medium uppercase text-gray-500">
              {WEEKDAY_SHORT.map((d) => (
                <div key={d} className="bg-gray-50 py-2">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-px border border-t-0 border-gray-200 bg-gray-200">
              {cells.map((cell, i) => {
                const k = dayKey(cell);
                const inMonth = cell.getUTCMonth() === cursor.getUTCMonth();
                const isToday = k === todayKey;
                const isFutureOrToday = k >= todayKey;
                const isLastRow = Math.floor(i / 7) === matrix.length - 1;
                const isNearRightEdge = i % 7 >= 5;
                const tooltipPositionClass = `${isLastRow ? "bottom-full mb-1" : "top-full mt-1"} ${isNearRightEdge ? "right-0" : "left-0"}`;
                const dayShifts = shiftsByDay.get(k) ?? [];
                return (
                  <div key={k} className={`relative min-h-[92px] bg-white p-1.5 text-left ${isToday ? "ring-1 ring-inset ring-pink-400 bg-pink-50/40" : ""}`}>
                    <div className={inMonth ? "" : "opacity-40"}>
                      <div className="flex items-center justify-between">
                        <div
                          className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-medium ${
                            isToday ? "bg-pink-600 text-white" : "text-gray-500"
                          }`}
                        >
                          {cell.getUTCDate()}
                        </div>
                        {canEdit && isFutureOrToday ? (
                          <button
                            type="button"
                            onClick={() => setEditing({ kind: "new", date: k, startTime: DEFAULT_START_TIME })}
                            title="Add a janitor shift on this day"
                            className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-gray-300 text-base font-bold leading-none text-gray-400 hover:border-pink-400 hover:bg-pink-50 hover:text-pink-500"
                          >
                            +
                          </button>
                        ) : null}
                      </div>
                      {dayShifts.length > 0 ? (
                        <ul className="mt-1 space-y-1">
                          {dayShifts.map((s) => (
                            <ShiftChip
                              key={s.key}
                              shift={s}
                              inMonth={inMonth}
                              tooltipPositionClass={tooltipPositionClass}
                              onClick={() => setEditing({ kind: "existing", shift: s })}
                            />
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-5 rounded border border-dashed border-gray-500 bg-gray-100" /> Changed or one-time
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-5 rounded bg-gray-100 opacity-60" /> <span className="line-through">Skipped</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="font-bold text-red-600">⚠</span> Janitor has time off
          </span>
        </div>
      </CollapsibleSection>

      {editing && data && (
        <ShiftDialog
          key={editing.kind === "new" ? `new-${editing.date}` : editing.shift.key}
          editing={editing}
          canEdit={!!data.canEdit}
          contracts={data.contracts}
          employees={data.employees}
          defaultContractId={contractFilter}
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

function ShiftChip({
  shift: s,
  inMonth,
  tooltipPositionClass,
  onClick,
}: {
  shift: JanitorialShift;
  inMonth: boolean;
  tooltipPositionClass: string;
  onClick: () => void;
}) {
  const cancelled = s.status === "CANCELLED";
  const timeOff = !!s.timeOffType && !cancelled;
  const statusText =
    cancelled
      ? "Skipped this day"
      : s.status === "CHANGED"
        ? s.regularEmployeeName
          ? `Covering for ${s.regularEmployeeName}`
          : "Hours changed this day"
        : s.status === "EXTRA"
          ? "One-time shift"
          : "Weekly shift";
  return (
    <li className={inMonth ? "group relative" : "relative"}>
      <button
        type="button"
        onClick={onClick}
        className={`flex w-full items-center gap-1 truncate rounded px-1.5 py-0.5 text-[10px] font-medium shadow-sm transition-colors ${chipClassFor(s.contractId)} ${
          s.status === "CHANGED" || s.status === "EXTRA" ? "border border-dashed border-gray-500" : ""
        } ${cancelled ? "opacity-60 line-through" : ""}`}
      >
        {timeOff ? <span aria-hidden className="shrink-0 text-sm font-bold leading-none text-red-600">⚠</span> : null}
        <span className="shrink-0">{formatTime12(s.startTime)}</span>
        <span className="truncate">
          {s.employeeName.split(" ")[0]} · {s.buildingName}
        </span>
      </button>
      {inMonth ? (
        <div className={`pointer-events-none absolute z-30 hidden w-max max-w-[220px] rounded-lg bg-gray-900 px-2.5 py-1.5 text-[10px] leading-snug text-white shadow-lg group-hover:block ${tooltipPositionClass}`}>
          <div className="font-semibold">{s.buildingName}</div>
          <div className="text-gray-300">
            {s.employeeName}, {formatTime12(s.startTime)} to {formatTime12(s.endTime)} ({formatHours(s.hours)})
          </div>
          <div className="text-gray-300">{statusText}</div>
          {timeOff ? <div className="text-red-300">Time off logged, needs cover</div> : null}
          {s.notes ? <div className="text-gray-300">{s.notes}</div> : null}
        </div>
      ) : null}
    </li>
  );
}

async function sendJson(url: string, method: string, body?: unknown): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.ok) return null;
    const json = await res.json().catch(() => ({}));
    return json.error ?? "Something went wrong";
  } catch {
    return "Network error";
  }
}

/** One dialog for adding a shift and for viewing/changing an existing one. */
function ShiftDialog({
  editing,
  canEdit,
  contracts,
  employees,
  defaultContractId,
  onClose,
  onSaved,
}: {
  editing: Editing;
  canEdit: boolean;
  contracts: Option[];
  employees: Option[];
  defaultContractId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const confirm = useConfirm();
  const existing = editing.kind === "existing" ? editing.shift : null;
  const isPatternShift = !!existing?.pattern;

  // A new shift or an unchanged-yet existing one starts in edit mode for new, view mode otherwise.
  const [mode, setMode] = useState<"view" | "edit">(existing ? "view" : "edit");
  const [scope, setScope] = useState<"day" | "following">("day");

  const initialDate = existing ? existing.date : editing.kind === "new" ? editing.date : "";
  const initialStart = existing ? existing.startTime : editing.kind === "new" ? editing.startTime : "18:00";
  const [contractId, setContractId] = useState(existing?.contractId ?? defaultContractId);
  const [employeeId, setEmployeeId] = useState(existing?.employeeId ?? "");
  const [date, setDate] = useState(initialDate);
  const [startTime, setStartTime] = useState(initialStart);
  const [endTime, setEndTime] = useState(existing?.endTime ?? minutesToTime(timeToMinutes(initialStart) + 240));
  const [repeat, setRepeat] = useState(!existing);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(
    existing?.pattern?.daysOfWeek ?? [new Date(`${initialDate}T00:00:00Z`).getUTCDay()]
  );
  const [notes, setNotes] = useState(existing && existing.status !== "REGULAR" ? existing.notes ?? "" : existing?.pattern?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Switching to "this and following weeks" edits the weekly shift, so start
  // from its weekly values rather than this one day's cover/changed hours.
  function chooseScope(next: "day" | "following") {
    setScope(next);
    if (!existing?.pattern) return;
    const source = next === "following" ? existing.pattern : existing;
    setEmployeeId(source.employeeId);
    setStartTime(source.startTime);
    setEndTime(source.endTime);
  }

  function toggleDay(d: number) {
    setDaysOfWeek((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  }

  async function run(url: string, method: string, body?: unknown) {
    setSaving(true);
    setError("");
    const err = await sendJson(url, method, body);
    setSaving(false);
    if (err) setError(err);
    else onSaved();
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!contractId) return setError("Pick a building");
    if (!employeeId) return setError("Pick a janitor");

    if (!existing) {
      if (repeat) {
        void run(`/api/erp/janitorial/contracts/${contractId}/patterns`, "POST", {
          employeeId,
          daysOfWeek,
          startTime,
          endTime,
          effectiveFrom: date,
          notes,
        });
      } else {
        void run("/api/erp/janitorial/shift-exceptions", "POST", { kind: "EXTRA", contractId, date, employeeId, startTime, endTime, notes });
      }
      return;
    }

    if (existing.status === "EXTRA") {
      void run(`/api/erp/janitorial/shift-exceptions/${existing.exceptionId}`, "PATCH", { contractId, date, employeeId, startTime, endTime, notes });
    } else if (scope === "day") {
      void run("/api/erp/janitorial/shift-exceptions", "POST", {
        kind: "CHANGED",
        patternId: existing.patternId,
        date: existing.date,
        employeeId,
        startTime,
        endTime,
        notes,
      });
    } else {
      void run(`/api/erp/janitorial/patterns/${existing.patternId}/from-date`, "POST", {
        action: "update",
        date: existing.date,
        contractId,
        employeeId,
        daysOfWeek,
        startTime,
        endTime,
        notes,
      });
    }
  }

  async function skipDay() {
    if (!existing) return;
    await run("/api/erp/janitorial/shift-exceptions", "POST", { kind: "CANCELLED", patternId: existing.patternId, date: existing.date });
  }

  async function removeFollowing() {
    if (!existing) return;
    const ok = await confirm({
      title: "Remove this and following weeks?",
      message: `${existing.employeeName} will no longer be scheduled at ${existing.buildingName} from ${dayCellLabelWithYear(existing.date)} on. Earlier weeks stay as they were.`,
      confirmLabel: "Remove",
    });
    if (ok) await run(`/api/erp/janitorial/patterns/${existing.patternId}/from-date`, "POST", { action: "end", date: existing.date });
  }

  async function removeOneTime() {
    if (!existing) return;
    const ok = await confirm({ title: "Delete this shift?", message: "This one-time shift will be removed.", confirmLabel: "Delete" });
    if (ok) await run(`/api/erp/janitorial/shift-exceptions/${existing.exceptionId}`, "DELETE");
  }

  const hours = startTime && endTime && startTime !== endTime ? shiftHours(startTime, endTime) : 0;
  const lockBuildingAndDate = isPatternShift && scope === "day";
  const showDays = existing ? isPatternShift && scope === "following" : repeat;

  if (mode === "view" && existing) {
    const statusText =
      existing.status === "CANCELLED"
        ? "Skipped this day"
        : existing.status === "CHANGED"
          ? existing.regularEmployeeName
            ? `Covering for ${existing.regularEmployeeName} this day`
            : "Hours changed this day"
          : existing.status === "EXTRA"
            ? "One-time shift"
            : `Every ${existing.pattern!.daysOfWeek.map((d) => WEEKDAY_SHORT[d]).join(", ")}`;
    return (
      <Modal open onClose={onClose} size="md">
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <span className={`mt-1.5 h-3 w-3 shrink-0 rounded-sm ${chipClassFor(existing.contractId)}`} />
            <div>
              <h3 className="text-base font-semibold text-gray-900">{existing.buildingName}</h3>
              <p className="text-sm text-gray-700">{dayCellLabelWithYear(existing.date)}</p>
              <p className="text-sm text-gray-700">
                {formatTime12(existing.startTime)} to {formatTime12(existing.endTime)} ({formatHours(existing.hours)})
              </p>
              <p className="mt-1 text-sm font-medium text-gray-900">{existing.employeeName}</p>
              <p className="text-xs text-gray-500">{statusText}</p>
              {existing.notes && <p className="mt-1 text-xs text-gray-600">{existing.notes}</p>}
            </div>
          </div>
          {existing.timeOffType && existing.status !== "CANCELLED" && (
            <p className="rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-700">
              {existing.employeeName} has time off this day ({existing.timeOffType.toLowerCase().replace("_", " ")}). Change the janitor for this day or skip it.
            </p>
          )}
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-3">
            {canEdit && existing.status === "CANCELLED" && (
              <Button size="sm" disabled={saving} onClick={() => run(`/api/erp/janitorial/shift-exceptions/${existing.exceptionId}`, "DELETE")}>
                Put back on schedule
              </Button>
            )}
            {canEdit && existing.status !== "CANCELLED" && <Button size="sm" onClick={() => setMode("edit")}>Edit</Button>}
            {canEdit && existing.status === "CHANGED" && (
              <Button variant="secondary" size="sm" disabled={saving} onClick={() => run(`/api/erp/janitorial/shift-exceptions/${existing.exceptionId}`, "DELETE")}>
                Undo change
              </Button>
            )}
            {canEdit && (existing.status === "REGULAR" || existing.status === "CHANGED") && (
              <Button variant="secondary" size="sm" disabled={saving} onClick={skipDay}>Skip this day</Button>
            )}
            {canEdit && isPatternShift && (
              <Button variant="danger" size="sm" disabled={saving} onClick={removeFollowing}>Remove this and following</Button>
            )}
            {canEdit && existing.status === "EXTRA" && (
              <Button variant="danger" size="sm" disabled={saving} onClick={removeOneTime}>Delete</Button>
            )}
            <Button variant="ghost" size="sm" onClick={onClose} className="ml-auto">Close</Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} size="lg" dismissible={false}>
      <form onSubmit={save} className="space-y-3">
        <h3 className="text-base font-semibold text-gray-900">{existing ? "Edit shift" : "New shift"}</h3>

        {isPatternShift && (
          <div className="flex gap-2 rounded-md bg-gray-50 p-1 text-sm">
            {(
              [
                ["day", "This day only"],
                ["following", "This and following weeks"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => chooseScope(value)}
                className={`flex-1 rounded px-3 py-1.5 font-medium ${scope === value ? "bg-white text-pink-600 shadow-sm" : "text-gray-600 hover:text-gray-900"}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass.default} htmlFor="sd-contract">Building</label>
            {lockBuildingAndDate ? (
              <p className="mt-1 py-2 text-sm text-gray-900">{existing?.buildingName}</p>
            ) : (
              <SearchableSelect
                id="sd-contract"
                value={contractId}
                onChange={setContractId}
                options={contracts.map((c) => ({ value: c.id, label: c.name }))}
                placeholder="Search buildings…"
                allLabel="Pick a building"
                className="mt-1"
              />
            )}
          </div>
          <div>
            <label className={labelClass.default} htmlFor="sd-employee">Janitor</label>
            <SearchableSelect
              id="sd-employee"
              value={employeeId}
              onChange={setEmployeeId}
              options={employees.map((e) => ({ value: e.id, label: e.name }))}
              placeholder="Search employees…"
              allLabel="Pick a janitor"
              className="mt-1"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelClass.default} htmlFor="sd-date">{existing && isPatternShift && scope === "following" ? "Starting" : "Date"}</label>
            {existing && isPatternShift ? (
              <p className="mt-1 py-2 text-sm text-gray-900">{formatShortDate(existing.date)}</p>
            ) : (
              <input id="sd-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass.md} />
            )}
          </div>
          <div>
            <label className={labelClass.default} htmlFor="sd-start">Start</label>
            <input id="sd-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputClass.md} />
          </div>
          <div>
            <label className={labelClass.default} htmlFor="sd-end">End</label>
            <input id="sd-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={inputClass.md} />
          </div>
        </div>
        {hours > 0 && (
          <p className="-mt-1 text-xs text-gray-500">
            {formatHours(hours)}
            {endTime <= startTime ? ", ends the next morning" : ""}
          </p>
        )}

        {!existing && (
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} className="h-4 w-4 text-pink-600" />
            Repeat every week
          </label>
        )}

        {showDays && (
          <div>
            <span className={labelClass.default}>Repeats on</span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {WEEKDAY_SHORT.map((label, d) => {
                const on = daysOfWeek.includes(d);
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => toggleDay(d)}
                    aria-pressed={on}
                    className={`h-9 w-11 rounded-full border text-xs font-medium ${on ? "border-pink-600 bg-pink-600 text-white" : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {hours > 0 && daysOfWeek.length > 0 && (
              <p className="mt-1 text-xs text-gray-500">{formatHours(hours * daysOfWeek.length)} per week</p>
            )}
          </div>
        )}

        <div>
          <label className={labelClass.default} htmlFor="sd-notes">Note (optional)</label>
          <input id="sd-notes" type="text" placeholder="e.g. Lobby and gym only" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass.md} />
        </div>

        {existing && isPatternShift && scope === "following" && (
          <p className="text-xs text-gray-500">Weeks before {formatShortDate(existing.date)} keep the old schedule. One-day changes from this date on are cleared.</p>
        )}
        {error && <p className="text-xs text-red-500">{error}</p>}

        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          <Button variant="secondary" size="sm" onClick={existing ? () => setMode("view") : onClose}>Cancel</Button>
        </div>
      </form>
    </Modal>
  );
}
