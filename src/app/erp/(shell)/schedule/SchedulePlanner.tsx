"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CollapsibleSection } from "./CollapsibleSection";
import {
  addDays,
  dayKey,
  monthMatrix,
  overlapsRange,
  projectWindow,
  startOfDay,
  startOfMonth,
  type ScheduleProject,
} from "@/lib/erp/schedule";

const PX_PER_DAY = 10;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function statusBarClass(status: string): string {
  switch (status) {
    case "ACTIVE":
      return "bg-pink-600/90 hover:bg-pink-500";
    case "ON_HOLD":
      return "bg-amber-600/90 hover:bg-amber-500";
    case "COMPLETE":
      return "bg-emerald-700/90 hover:bg-emerald-600";
    case "ARCHIVED":
      return "bg-zinc-600/90 hover:bg-zinc-500";
    default:
      return "bg-pink-600/80";
  }
}

function monthLabel(d: Date): string {
  return d.toLocaleString("en-US", { month: "long", year: "numeric" });
}

export function SchedulePlanner({ projects }: { projects: ScheduleProject[] }) {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));

  const windows = useMemo(() => projects.map((p) => ({ p, ...projectWindow(p) })), [projects]);

  const ganttRange = useMemo(() => {
    if (windows.length === 0) {
      const t = startOfDay(new Date());
      return { start: addDays(t, -7), end: addDays(t, 60) };
    }
    let min = windows[0]!.start;
    let max = windows[0]!.end;
    for (const w of windows) {
      if (w.start < min) min = w.start;
      if (w.end > max) max = w.end;
    }
    return { start: addDays(min, -7), end: addDays(max, 14) };
  }, [windows]);

  const totalDays = Math.max(
    1,
    Math.ceil((ganttRange.end.getTime() - ganttRange.start.getTime()) / (86400000)) + 1,
  );
  const timelineWidth = totalDays * PX_PER_DAY;

  const dayOffset = (d: Date) =>
    Math.floor((startOfDay(d).getTime() - ganttRange.start.getTime()) / 86400000);

  const matrix = useMemo(() => monthMatrix(cursor), [cursor]);

  const projectsByDay = useMemo(() => {
    const map = new Map<string, ScheduleProject[]>();
    for (const cell of matrix.flat()) {
      const k = dayKey(cell);
      const list: ScheduleProject[] = [];
      for (const w of windows) {
        const cellStart = startOfDay(cell);
        const cellEnd = addDays(cellStart, 1);
        if (overlapsRange(w.start, w.end, cellStart, cellEnd)) {
          list.push(w.p);
        }
      }
      map.set(k, list);
    }
    return map;
  }, [matrix, windows]);

  function prevMonth() {
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1));
  }
  function nextMonth() {
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1));
  }

  const sameMonth = (a: Date, b: Date) => a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();

  const calendarNav = (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={prevMonth}
        className="rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
      >
        ← Prev
      </button>
      <span className="min-w-[140px] text-center text-sm font-semibold text-gray-800">{monthLabel(cursor)}</span>
      <button
        type="button"
        onClick={nextMonth}
        className="rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
      >
        Next →
      </button>
    </div>
  );

  return (
    <div className="space-y-6">
      <CollapsibleSection title="Calendar" headerExtra={calendarNav}>
        <div className="overflow-x-auto">
          <div className="min-w-[720px]">
            <div className="grid grid-cols-7 gap-px rounded-lg border border-gray-200 bg-gray-200 text-center text-[10px] font-medium uppercase text-gray-500">
              {WEEKDAYS.map((d) => (
                <div key={d} className="bg-gray-50 py-2">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-px border border-t-0 border-gray-200 bg-gray-200">
              {matrix.flat().map((cell, i) => {
                const k = dayKey(cell);
                const inMonth = sameMonth(cell, cursor);
                const items = projectsByDay.get(k) ?? [];
                return (
                  <div
                    key={`${k}-${i}`}
                    className={`min-h-[92px] bg-white p-1.5 text-left ${inMonth ? "" : "opacity-40"}`}
                  >
                    <div className="text-xs font-medium text-gray-500">{cell.getDate()}</div>
                    <ul className="mt-1 space-y-0.5">
                      {items.slice(0, 4).map((p) => (
                        <li key={p.id}>
                          <Link
                            href={`/erp/projects/${p.id}`}
                            className="block truncate rounded px-0.5 text-[10px] text-pink-600 hover:underline"
                            title={p.jobTitle}
                          >
                            {p.jobTitle}
                          </Link>
                        </li>
                      ))}
                      {items.length > 4 ? (
                        <li className="text-[10px] text-gray-500">+{items.length - 4} more</li>
                      ) : null}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Gantt" description="Bars use start / end dates; without an end date a 14-day window is assumed.">
        {windows.length === 0 ? (
          <p className="text-sm text-gray-500">No projects yet. Create one in Projects → New project.</p>
        ) : (
          <div className="flex max-h-[min(70vh,720px)] flex-col overflow-hidden rounded-lg border border-gray-200">
            <div className="flex min-h-0 flex-1 overflow-auto">
              <div className="sticky left-0 z-10 w-[220px] shrink-0 border-r border-gray-200 bg-white">
                <div className="flex h-14 items-center border-b border-gray-200 px-3 text-[10px] font-semibold uppercase text-gray-500">
                  Project
                </div>
                {windows.map(({ p }) => (
                  <div
                    key={p.id}
                    className="flex h-12 items-center border-b border-gray-100 px-3 text-xs text-gray-800"
                  >
                    <Link href={`/erp/projects/${p.id}`} className="truncate font-medium text-pink-600 hover:underline">
                      {p.jobTitle}
                    </Link>
                  </div>
                ))}
              </div>
              <div className="min-w-0 flex-1 overflow-x-auto">
                <div style={{ width: timelineWidth }} className="relative">
                  <div
                    className="flex h-14 items-end border-b border-gray-200 bg-white/80 text-[10px] text-gray-500"
                    style={{ width: timelineWidth }}
                  >
                    {Array.from({ length: totalDays }).map((_, i) => {
                      const d = addDays(ganttRange.start, i);
                      const show =
                        d.getDate() === 1 || i === 0 || d.getDay() === 0
                          ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
                          : "";
                      return (
                        <div
                          key={i}
                          style={{ width: PX_PER_DAY, minWidth: PX_PER_DAY }}
                          className={`shrink-0 border-l border-gray-100 ${d.getDay() === 0 ? "bg-gray-50" : ""}`}
                        >
                          {show ? <span className="pl-0.5">{show}</span> : null}
                        </div>
                      );
                    })}
                  </div>
                  {windows.map((w) => {
                    const startOff = Math.max(0, dayOffset(w.start));
                    const endOff = Math.min(totalDays - 1, dayOffset(w.end));
                    const left = startOff * PX_PER_DAY;
                    const width = Math.max(PX_PER_DAY * 2, (endOff - startOff + 1) * PX_PER_DAY);
                    return (
                      <div
                        key={w.p.id}
                        className="relative h-12 border-b border-gray-100"
                        style={{ width: timelineWidth }}
                      >
                        <Link
                          href={`/erp/projects/${w.p.id}`}
                          title={`${w.p.jobTitle} — ${w.p.percentDone}% done`}
                          className={`absolute top-2 flex h-8 items-center rounded px-2 text-[11px] font-medium text-white shadow ${statusBarClass(w.p.status)}`}
                          style={{ left, width: Math.min(width, timelineWidth - left) }}
                        >
                          <span className="truncate">{w.p.segment}</span>
                          <span className="ml-2 opacity-80">{w.p.percentDone}%</span>
                        </Link>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </CollapsibleSection>
    </div>
  );
}
