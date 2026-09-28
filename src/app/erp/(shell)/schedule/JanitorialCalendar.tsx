"use client";

import { Fragment, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
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
type EmployeeOption = Option & { hasClockLink: boolean; defaultContractId: string | null };
type ScheduleResponse = { shifts: JanitorialShift[]; canEdit: boolean; contracts: Option[]; employees: EmployeeOption[] };

/** What the shift dialog is open for: a new shift on a day, or an existing one. */
/** Values a new-shift form can start from, e.g. "Add another janitor" copying an existing shift. */
type NewShiftPrefill = { contractId?: string; endTime?: string; daysOfWeek?: number[]; repeat?: boolean; notes?: string };
type Editing = ({ kind: "new"; date: string; startTime: string } & NewShiftPrefill) | { kind: "existing"; shift: JanitorialShift };

const DEFAULT_START_TIME = "18:00";

// Same pastel chip treatment as the Projects calendar (SchedulePlanner's
// CALENDAR_GROUP_CHIP_CLASS), one color per building so a contract reads the
// same across days. No green: the Projects calendar uses it for turnover.
const CONTRACT_CHIP_CLASSES = [
  "bg-teal-200 text-teal-900 hover:bg-teal-300",
  "bg-sky-200 text-sky-900 hover:bg-sky-300",
  "bg-violet-200 text-violet-900 hover:bg-violet-300",
  "bg-orange-200 text-orange-900 hover:bg-orange-300",
  "bg-lime-200 text-lime-900 hover:bg-lime-300",
  "bg-indigo-200 text-indigo-900 hover:bg-indigo-300",
  "bg-rose-200 text-rose-900 hover:bg-rose-300",
  "bg-yellow-200 text-yellow-900 hover:bg-yellow-300",
  "bg-cyan-200 text-cyan-900 hover:bg-cyan-300",
  "bg-fuchsia-200 text-fuchsia-900 hover:bg-fuchsia-300",
  "bg-amber-200 text-amber-900 hover:bg-amber-300",
  "bg-blue-200 text-blue-900 hover:bg-blue-300",
];

/** Colors are handed out in order (by building name), not hashed from the
 * id, so two buildings only share a color once there are more buildings
 * than colors. */
const ChipColorContext = createContext<Map<string, number>>(new Map());

function useChipClass(): (contractId: string) => string {
  const indexById = useContext(ChipColorContext);
  return (contractId) => CONTRACT_CHIP_CLASSES[(indexById.get(contractId) ?? 0) % CONTRACT_CHIP_CLASSES.length];
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
  // Expanded building groups, keyed `${dayKey}:${contractId}`, same as the
  // Projects calendar's turnover building groups.
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  // Drag and drop: moving one day's shift to another day.
  const [dragging, setDragging] = useState<{ shiftKey: string; fromDate: string; label: string } | null>(null);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);
  const [dragError, setDragError] = useState<string | null>(null);
  const [skipDayFor, setSkipDayFor] = useState<string | null>(null);
  function toggleGroup(groupKey: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  }

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

  async function dropOnDay(toDate: string) {
    const d = dragging;
    setDragging(null);
    setDragOverDay(null);
    if (!d || d.fromDate === toDate) return;
    setDragError(null);
    const err = await sendJson("/api/erp/janitorial/shift-exceptions/move", "POST", { shiftKey: d.shiftKey, toDate });
    if (err) setDragError(`Couldn't move ${d.label}: ${err}`);
    void load();
  }

  const dragProps = (s: JanitorialShift) =>
    canEdit && s.status !== "CANCELLED"
      ? {
          draggable: true,
          onDragStart: (e: React.DragEvent) => {
            e.dataTransfer.setData("text/plain", s.key);
            e.dataTransfer.effectAllowed = "move";
            setDragging({ shiftKey: s.key, fromDate: s.date, label: `${s.employeeName}'s shift` });
          },
          onDragEnd: () => {
            setDragging(null);
            setDragOverDay(null);
          },
        }
      : {};

  // Active contracts plus any other building on the calendar (e.g. an ended
  // contract's past shifts), sorted by name, each given the next color.
  const colorIndexById = useMemo(() => {
    const names = new Map<string, string>();
    for (const c of data?.contracts ?? []) names.set(c.id, c.name);
    for (const s of data?.shifts ?? []) if (!names.has(s.contractId)) names.set(s.contractId, s.buildingName);
    const ordered = Array.from(names.entries()).sort((a, b) => a[1].localeCompare(b[1]));
    return new Map(ordered.map(([id], i) => [id, i]));
  }, [data]);
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
      {data?.canEdit && (data?.contracts.length ?? 0) > 0 ? (
        <button
          type="button"
          onClick={() => setSkipDayFor(todayKey)}
          title="Skip every shift on a holiday or closure"
          className="h-8 rounded border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-600 transition-colors hover:border-gray-300"
        >
          Skip a day
        </button>
      ) : null}
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
    <ChipColorContext.Provider value={colorIndexById}>
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
                  <div
                    key={k}
                    onDragOver={(e) => {
                      if (!dragging) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (dragOverDay !== k) setDragOverDay(k);
                    }}
                    onDragLeave={() => {
                      if (dragOverDay === k) setDragOverDay(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      void dropOnDay(k);
                    }}
                    className={`relative min-h-[92px] bg-white p-1.5 text-left ${isToday ? "ring-1 ring-inset ring-pink-400 bg-pink-50/40" : ""} ${
                      dragOverDay === k ? "ring-2 ring-inset ring-pink-500 bg-pink-50" : ""
                    }`}
                  >
                    <div className={inMonth ? "" : "opacity-40"}>
                      <div className="flex items-center justify-between">
                        {canEdit && dayShifts.some((s) => s.patternId && s.status !== "CANCELLED") ? (
                          <button
                            type="button"
                            onClick={() => setSkipDayFor(k)}
                            title="Skip shifts on this day (holiday or closure)"
                            className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-medium hover:ring-1 hover:ring-pink-400 ${
                              isToday ? "bg-pink-600 text-white" : "text-gray-500"
                            }`}
                          >
                            {cell.getUTCDate()}
                          </button>
                        ) : (
                          <div
                            className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-medium ${
                              isToday ? "bg-pink-600 text-white" : "text-gray-500"
                            }`}
                          >
                            {cell.getUTCDate()}
                          </div>
                        )}
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
                          {groupByBuilding(dayShifts).map((group) => {
                            // One shift at a building stays its own chip; grouping it saves nothing.
                            if (group.shifts.length === 1) {
                              const s = group.shifts[0];
                              return (
                                <ShiftChip
                                  key={s.key}
                                  shift={s}
                                  dragProps={dragProps(s)}
                                  inMonth={inMonth}
                                  tooltipPositionClass={tooltipPositionClass}
                                  onClick={() => setEditing({ kind: "existing", shift: s })}
                                />
                              );
                            }
                            const groupKey = `${k}:${group.contractId}`;
                            const isExpanded = expandedGroups.has(groupKey);
                            return (
                              <Fragment key={groupKey}>
                                <BuildingGroupChip
                                  group={group}
                                  expanded={isExpanded}
                                  inMonth={inMonth}
                                  tooltipPositionClass={tooltipPositionClass}
                                  onToggle={() => toggleGroup(groupKey)}
                                />
                                {isExpanded ? (
                                  <li>
                                    <ul className="ml-3 space-y-1 border-l-2 border-gray-200 pl-1.5">
                                      {group.shifts.map((s) => (
                                        <ShiftChip
                                          key={s.key}
                                          shift={s}
                                          dragProps={dragProps(s)}
                                          compact
                                          inMonth={inMonth}
                                          tooltipPositionClass={tooltipPositionClass}
                                          onClick={() => setEditing({ kind: "existing", shift: s })}
                                        />
                                      ))}
                                    </ul>
                                  </li>
                                ) : null}
                              </Fragment>
                            );
                          })}
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
            <span className="rounded bg-gray-100 px-1 text-[10px] font-medium text-gray-700">Building 3 ▾</span> Several janitors, click to see each
          </span>
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

      {skipDayFor && data && (
        <SkipDayDialog
          initialDate={skipDayFor}
          contracts={data.contracts}
          loadedShifts={data.shifts}
          loadedRange={{ start: dayKey(cells[0]), end: dayKey(cells[cells.length - 1]) }}
          onClose={() => setSkipDayFor(null)}
          onDone={() => {
            setSkipDayFor(null);
            void load();
          }}
        />
      )}

      {editing && data && (
        <ShiftDialog
          key={editing.kind === "new" ? `new-${editing.date}-${editing.contractId ?? ""}-${editing.startTime}` : editing.shift.key}
          editing={editing}
          canEdit={!!data.canEdit}
          contracts={data.contracts}
          employees={data.employees}
          defaultContractId={contractFilter}
          onAddAnother={(shift) =>
            setEditing({
              kind: "new",
              date: shift.date,
              startTime: shift.startTime,
              endTime: shift.endTime,
              contractId: shift.contractId,
              daysOfWeek: shift.pattern?.daysOfWeek ?? [new Date(`${shift.date}T00:00:00Z`).getUTCDay()],
              repeat: !!shift.pattern,
            })
          }
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
    </div>
    </ChipColorContext.Provider>
  );
}

type BuildingGroup = { contractId: string; buildingName: string; shifts: JanitorialShift[] };

/** A day's shifts by building, in order of each building's earliest shift. */
function groupByBuilding(shifts: JanitorialShift[]): BuildingGroup[] {
  const groups = new Map<string, BuildingGroup>();
  for (const s of shifts) {
    const g = groups.get(s.contractId) ?? { contractId: s.contractId, buildingName: s.buildingName, shifts: [] };
    g.shifts.push(s);
    groups.set(s.contractId, g);
  }
  return Array.from(groups.values());
}

/** Collapsed "The George, 3" chip for a building with several shifts that day. */
function BuildingGroupChip({
  group,
  expanded,
  inMonth,
  tooltipPositionClass,
  onToggle,
}: {
  group: BuildingGroup;
  expanded: boolean;
  inMonth: boolean;
  tooltipPositionClass: string;
  onToggle: () => void;
}) {
  const active = group.shifts.filter((s) => s.status !== "CANCELLED");
  // Worst state wins, so nothing needing attention hides behind the collapse.
  const needsCover = active.some((s) => s.timeOffType);
  const allSkipped = active.length === 0;
  const hours = active.reduce((sum, s) => sum + s.hours, 0);
  const chipClassFor = useChipClass();
  return (
    <li className={inMonth ? "group relative" : "relative"}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        title={group.buildingName}
        className={`relative flex w-full items-center gap-1 truncate rounded py-0.5 pl-1.5 pr-8 text-[10px] font-medium shadow-sm transition-colors ${chipClassFor(group.contractId)} ${
          allSkipped ? "opacity-60 line-through" : ""
        }`}
      >
        {needsCover ? <span aria-hidden className="shrink-0 text-sm font-bold leading-none text-red-600">⚠</span> : null}
        <span className="truncate">{group.buildingName}</span>
        <span className="pointer-events-none absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5 whitespace-nowrap text-[9px] font-normal opacity-80">
          {group.shifts.length}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`h-3 w-3 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
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
          <div className="font-semibold">{group.buildingName}</div>
          <div className="text-gray-300">
            {group.shifts.length} janitors this day, {formatHours(hours)}
          </div>
          <ul className="mt-1 space-y-0.5">
            {group.shifts.map((s) => (
              <li key={s.key} className={`text-gray-300 ${s.status === "CANCELLED" ? "line-through" : ""}`}>
                {s.timeOffType && s.status !== "CANCELLED" ? "⚠ " : ""}
                {formatTime12(s.startTime)} {s.employeeName}
              </li>
            ))}
          </ul>
          <div className="mt-1 text-gray-300">Click to {expanded ? "collapse" : "expand"}</div>
        </div>
      ) : null}
    </li>
  );
}

type ChipDragProps = { draggable?: boolean; onDragStart?: (e: React.DragEvent) => void; onDragEnd?: () => void };

function ShiftChip({
  shift: s,
  compact = false,
  dragProps = {},
  inMonth,
  tooltipPositionClass,
  onClick,
}: {
  shift: JanitorialShift;
  dragProps?: ChipDragProps;
  /** Inside a building group: the building name is already on the group chip. */
  compact?: boolean;
  inMonth: boolean;
  tooltipPositionClass: string;
  onClick: () => void;
}) {
  const chipClassFor = useChipClass();
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
        {...dragProps}
        className={`flex w-full items-center gap-1 truncate rounded px-1.5 py-0.5 text-[10px] font-medium shadow-sm transition-colors ${dragProps.draggable ? "cursor-grab active:cursor-grabbing" : ""} ${chipClassFor(s.contractId)} ${
          s.status === "CHANGED" || s.status === "EXTRA" ? "border border-dashed border-gray-500" : ""
        } ${cancelled ? "opacity-60 line-through" : ""}`}
      >
        {timeOff ? <span aria-hidden className="shrink-0 text-sm font-bold leading-none text-red-600">⚠</span> : null}
        <span className="shrink-0">{formatTime12(s.startTime)}</span>
        <span className="truncate">{compact ? s.employeeName : `${s.employeeName.split(" ")[0]} · ${s.buildingName}`}</span>
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
          {dragProps.draggable ? <div className="mt-1 text-gray-400">Drag to move this day only</div> : null}
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
  onAddAnother,
  onClose,
  onSaved,
}: {
  editing: Editing;
  canEdit: boolean;
  contracts: Option[];
  employees: EmployeeOption[];
  defaultContractId: string;
  onAddAnother: (shift: JanitorialShift) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const confirm = useConfirm();
  const chipClassFor = useChipClass();
  const existing = editing.kind === "existing" ? editing.shift : null;
  const isPatternShift = !!existing?.pattern;
  // Links created from this dialog, so the nudge disappears without a reload.
  const [linkedIds, setLinkedIds] = useState<Set<string>>(new Set());
  const needsClockLink = (id: string) => !!id && !linkedIds.has(id) && employees.find((e) => e.id === id)?.hasClockLink === false;

  // A new shift or an unchanged-yet existing one starts in edit mode for new, view mode otherwise.
  const [mode, setMode] = useState<"view" | "edit">(existing ? "view" : "edit");
  const [scope, setScope] = useState<"day" | "following">("day");

  const prefill = editing.kind === "new" ? editing : null;
  const initialDate = existing ? existing.date : prefill!.date;
  const initialStart = existing ? existing.startTime : prefill!.startTime;
  const [contractId, setContractId] = useState(existing?.contractId ?? prefill?.contractId ?? defaultContractId);
  // One janitor when editing an existing shift; any number when adding.
  const [employeeId, setEmployeeId] = useState(existing?.employeeId ?? "");
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [date, setDate] = useState(initialDate);
  const [startTime, setStartTime] = useState(initialStart);
  const [endTime, setEndTime] = useState(existing?.endTime ?? prefill?.endTime ?? minutesToTime(timeToMinutes(initialStart) + 240));
  const [repeat, setRepeat] = useState(existing ? false : prefill?.repeat ?? true);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(
    existing?.pattern?.daysOfWeek ?? prefill?.daysOfWeek ?? [new Date(`${initialDate}T00:00:00Z`).getUTCDay()]
  );
  const [notes, setNotes] = useState(
    existing ? (existing.status !== "REGULAR" ? existing.notes ?? "" : existing.pattern?.notes ?? "") : prefill?.notes ?? ""
  );
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

  function addJanitor(id: string) {
    if (!id || employeeIds.includes(id)) return;
    setEmployeeIds((prev) => [...prev, id]);
    // Fill in their default building if none is picked yet.
    const fallback = employees.find((e) => e.id === id)?.defaultContractId;
    if (!contractId && fallback && contracts.some((c) => c.id === fallback)) setContractId(fallback);
  }

  /** Adds the same shift for every picked janitor. On a partial failure the
   * ones that saved are dropped from the list so a retry doesn't double them. */
  async function saveNew() {
    setSaving(true);
    setError("");
    const failed: { id: string; message: string }[] = [];
    for (const id of employeeIds) {
      const err = repeat
        ? await sendJson(`/api/erp/janitorial/contracts/${contractId}/patterns`, "POST", {
            employeeId: id,
            daysOfWeek,
            startTime,
            endTime,
            effectiveFrom: date,
            notes,
          })
        : await sendJson("/api/erp/janitorial/shift-exceptions", "POST", { kind: "EXTRA", contractId, date, employeeId: id, startTime, endTime, notes });
      if (err) failed.push({ id, message: err });
    }
    setSaving(false);
    if (failed.length === 0) return onSaved();
    const nameOf = (id: string) => employees.find((e) => e.id === id)?.name ?? "a janitor";
    setEmployeeIds(failed.map((f) => f.id));
    setError(`Couldn't add ${failed.map((f) => nameOf(f.id)).join(", ")}: ${failed[0].message}`);
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!contractId) return setError("Pick a building");

    if (!existing) {
      if (employeeIds.length === 0) return setError("Add at least one janitor");
      void saveNew();
      return;
    }
    if (!employeeId) return setError("Pick a janitor");

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
          {canEdit && needsClockLink(existing.employeeId) && (
            <ClockLinkNudge
              employeeId={existing.employeeId}
              name={existing.employeeName}
              onCreated={(id) => setLinkedIds((prev) => new Set(prev).add(id))}
            />
          )}
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
            {canEdit && existing.status !== "CANCELLED" && (
              <Button variant="secondary" size="sm" onClick={() => onAddAnother(existing)}>
                Add another janitor
              </Button>
            )}
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
            <label className={labelClass.default} htmlFor="sd-employee">{existing ? "Janitor" : "Janitors"}</label>
            {existing ? (
              <SearchableSelect
                id="sd-employee"
                value={employeeId}
                onChange={setEmployeeId}
                options={employees.map((e) => ({ value: e.id, label: e.name }))}
                placeholder="Search employees…"
                allLabel="Pick a janitor"
                className="mt-1"
              />
            ) : (
              <SearchableSelect
                id="sd-employee"
                value=""
                onChange={addJanitor}
                options={employees.filter((e) => !employeeIds.includes(e.id)).map((e) => ({ value: e.id, label: e.name }))}
                placeholder="Search employees…"
                allLabel={employeeIds.length === 0 ? "Add a janitor" : "Add another janitor"}
                className="mt-1"
              />
            )}
          </div>
        </div>
        {!existing && employeeIds.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Janitors on this shift">
            {employeeIds.map((id) => (
              <li key={id} className="flex items-center gap-1 rounded-full bg-pink-50 py-1 pl-3 pr-1.5 text-sm text-pink-900 ring-1 ring-inset ring-pink-200">
                {employees.find((e) => e.id === id)?.name ?? "Unknown"}
                <button
                  type="button"
                  onClick={() => setEmployeeIds((prev) => prev.filter((x) => x !== id))}
                  aria-label={`Remove ${employees.find((e) => e.id === id)?.name ?? "janitor"}`}
                  className="flex h-5 w-5 items-center justify-center rounded-full text-pink-700 hover:bg-pink-100"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        {(existing ? [employeeId] : employeeIds).filter(needsClockLink).map((id) => (
          <ClockLinkNudge
            key={id}
            employeeId={id}
            name={employees.find((e) => e.id === id)?.name ?? "This janitor"}
            onCreated={(created) => setLinkedIds((prev) => new Set(prev).add(created))}
          />
        ))}

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

        {/* Pinned to the bottom of the (scrollable) dialog so Save stays reachable with a long list of janitors. */}
        <div className="sticky -bottom-5 -mx-5 -mb-5 flex gap-2 border-t border-gray-100 bg-white px-5 py-3">
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? "Saving…" : !existing && employeeIds.length > 1 ? `Save ${employeeIds.length} shifts` : "Save"}
          </Button>
          <Button variant="secondary" size="sm" onClick={existing ? () => setMode("view") : onClose}>Cancel</Button>
        </div>
      </form>
    </Modal>
  );
}

/** Shown when the picked janitor has no clock-in link yet: creates one and
 * copies it in one click, so setting someone up doesn't need a trip to their
 * employee profile. */
function ClockLinkNudge({ employeeId, name, onCreated }: { employeeId: string; name: string; onCreated: (employeeId: string) => void }) {
  const [state, setState] = useState<"idle" | "working" | "copied" | "created">("idle");
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const firstName = name.split(" ")[0];

  async function createAndCopy() {
    setState("working");
    setError("");
    try {
      const res = await fetch(`/api/erp/employees/${employeeId}/clock-link`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "create" }),
      });
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.error ?? "Couldn't create the link");
      setUrl(json.url);
      onCreated(employeeId);
      try {
        await navigator.clipboard.writeText(json.url);
        setState("copied");
      } catch {
        setState("created");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the link");
      setState("idle");
    }
  }

  if (state === "copied" || state === "created") {
    return (
      <div className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
        {state === "copied" ? `Link copied. Text it to ${firstName} and have them save it to their home screen.` : `Link created. Copy it and text it to ${firstName}:`}
        {url && (
          <input
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Clock-in link"
            className="mt-1.5 w-full rounded border border-emerald-200 bg-white px-2 py-1 font-mono text-[11px] text-gray-700"
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
      <span>{firstName} doesn&apos;t have a clock-in link yet, so their scheduled hours will be used.</span>
      <button
        type="button"
        onClick={createAndCopy}
        disabled={state === "working"}
        className="shrink-0 rounded-md bg-amber-600 px-2.5 py-1 font-medium text-white hover:bg-amber-500 disabled:opacity-50"
      >
        {state === "working" ? "Creating…" : "Create & copy link"}
      </button>
      {error && <span className="w-full text-red-600">{error}</span>}
    </div>
  );
}

/** Skip every weekly shift on one day (holiday, closure), at all or some
 * buildings, or put back shifts that were skipped this way. */
function SkipDayDialog({
  initialDate,
  contracts,
  loadedShifts,
  loadedRange,
  onClose,
  onDone,
}: {
  initialDate: string;
  contracts: Option[];
  loadedShifts: JanitorialShift[];
  /** The calendar's visible dates; the preview count only works inside them. */
  loadedRange: { start: string; end: string };
  onClose: () => void;
  onDone: () => void;
}) {
  const [date, setDate] = useState(initialDate);
  const [allBuildings, setAllBuildings] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const scope = (contractId: string) => allBuildings || picked.has(contractId);
  // Preview from what the calendar already loaded (the visible month).
  const dayShifts = loadedShifts.filter((s) => s.date === date && scope(s.contractId));
  const inLoadedRange = date >= loadedRange.start && date <= loadedRange.end;
  const willSkip = dayShifts.filter((s) => s.patternId && s.status !== "CANCELLED").length;
  const alreadySkipped = dayShifts.filter((s) => s.status === "CANCELLED" && s.notes?.startsWith("Day skipped")).length;
  const oneTime = dayShifts.filter((s) => s.status === "EXTRA").length;

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit(restore: boolean) {
    if (!allBuildings && picked.size === 0) return setError("Pick at least one building");
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/erp/janitorial/skip-day", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date, contractIds: allBuildings ? [] : Array.from(picked), reason, restore }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Something went wrong");
      if (restore && json.restored === 0) {
        setMessage("Nothing to put back for that day.");
        return;
      }
      if (!restore && json.skipped === 0) {
        setMessage("There are no weekly shifts to skip on that day.");
        return;
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} size="md" dismissible={false}>
      <div className="space-y-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Skip a day</h3>
          <p className="text-xs text-gray-500">
            For holidays or closures. Every weekly shift that day is skipped, so no hours are paid for it. The weekly schedule
            isn&apos;t changed.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass.default} htmlFor="sk-date">Date</label>
            <input id="sk-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass.md} />
          </div>
          <div>
            <label className={labelClass.default} htmlFor="sk-reason">Reason (optional)</label>
            <input id="sk-reason" type="text" placeholder="e.g. Thanksgiving" value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass.md} />
          </div>
        </div>

        <div>
          <span className={labelClass.default}>Buildings</span>
          <label className="mt-1 flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={allBuildings} onChange={(e) => setAllBuildings(e.target.checked)} className="h-4 w-4 text-pink-600" />
            All buildings
          </label>
          {!allBuildings && (
            <div className="mt-1 max-h-40 space-y-1 overflow-y-auto rounded-md border border-gray-200 p-2">
              {contracts.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} className="h-4 w-4 text-pink-600" />
                  {c.name}
                </label>
              ))}
            </div>
          )}
        </div>

        {inLoadedRange && (
          <p className="rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-600">
            {willSkip === 0 ? "No weekly shifts to skip that day" : `${willSkip} shift${willSkip === 1 ? "" : "s"} will be skipped`}
            {oneTime > 0 ? `. ${oneTime} one-time shift${oneTime === 1 ? " stays" : "s stay"} on the schedule.` : "."}
          </p>
        )}

        {message && <p className="text-xs text-gray-600">{message}</p>}
        {error && <p className="text-xs text-red-500">{error}</p>}

        <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-3">
          <Button size="sm" disabled={saving} onClick={() => submit(false)}>
            {saving ? "Saving…" : willSkip > 0 && inLoadedRange ? `Skip ${willSkip} shift${willSkip === 1 ? "" : "s"}` : "Skip shifts"}
          </Button>
          {(alreadySkipped > 0 || !inLoadedRange) && (
            <Button variant="secondary" size="sm" disabled={saving} onClick={() => submit(true)}>
              Put back skipped shifts
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onClose} className="ml-auto">Cancel</Button>
        </div>
      </div>
    </Modal>
  );
}
