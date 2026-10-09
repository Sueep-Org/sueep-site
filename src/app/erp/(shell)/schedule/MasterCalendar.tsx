"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { dayKey, monthLabel, monthMatrix, startOfMonth } from "@/lib/erp/schedule";
import { todayEasternAsUtcMidnight } from "@/lib/erp/dates";
import { WEEKDAY_SHORT, type JanitorialShift } from "@/lib/erp/janitorialSchedule";
import { categoryColor, type ManagementCategoryDto, type ManagementItem } from "@/lib/erp/managementCalendar";
import { calendarSegmentGroup, type CalendarSegmentGroup } from "@/lib/erp/projectSegments";
import { CollapsibleSection } from "./CollapsibleSection";

/** One project, slimmed to what the master view needs (built in page.tsx). */
export type MasterProject = {
  id: string;
  jobTitle: string;
  segment: string;
  status: string;
  /** Days with logged labor or a sub engagement */
  loggedDayKeys: string[];
  /** Days with a planned supervisor/PM/crew, not logged yet */
  plannedDayKeys: string[];
  startKey: string | null;
  endKey: string | null;
  buildingId: string | null;
  buildingName: string | null;
};

type Layer = "projects" | "janitorial" | "management";

type Chip = {
  key: string;
  label: string;
  title: string;
  href: string;
  className: string;
  planned: boolean;
};

const MAX_CHIPS_PER_DAY = 4;
const HIDDEN_KEY = "masterCalendarHiddenLayers";

// Same pastel colors as the Projects calendar chips.
const PROJECT_CHIP_CLASS: Record<CalendarSegmentGroup, string> = {
  POST_CONSTRUCTION: "bg-purple-200 text-purple-900 hover:bg-purple-300",
  JANITORIAL_TURNOVER_REQUESTS: "bg-green-200 text-green-900 hover:bg-green-300",
  REAL_ESTATE: "bg-pink-200 text-pink-900 hover:bg-pink-300",
  OTHER: "bg-gray-200 text-gray-800 hover:bg-gray-300",
};
// One color for every janitorial building here, so the three layers stay
// easy to tell apart (the Janitorial tab colors each building).
const JANITORIAL_CHIP_CLASS = "bg-sky-200 text-sky-900 hover:bg-sky-300";
const PLANNED_CHIP_CLASS = "border border-dashed border-gray-500";

const LAYERS: { id: Layer; label: string; swatch: string }[] = [
  { id: "projects", label: "Projects", swatch: "bg-purple-200" },
  { id: "janitorial", label: "Janitorial", swatch: "bg-sky-200" },
  { id: "management", label: "Management", swatch: "bg-amber-200" },
];

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Could not load the calendar");
  return json as T;
}

export function MasterCalendar({ projects, showManagement }: { projects: MasterProject[]; showManagement: boolean }) {
  const todayKey = dayKey(todayEasternAsUtcMidnight());
  const [cursor, setCursor] = useState(() => startOfMonth(todayEasternAsUtcMidnight()));
  const [shifts, setShifts] = useState<(JanitorialShift & { logged?: boolean })[]>([]);
  const [mgmt, setMgmt] = useState<{ items: ManagementItem[]; categories: ManagementCategoryDto[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hidden, setHidden] = useState<Set<Layer>>(new Set());
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  const matrix = useMemo(() => monthMatrix(cursor), [cursor]);
  const cells = matrix.flat();

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? "[]");
      if (Array.isArray(saved)) setHidden(new Set(saved as Layer[]));
    } catch {
      // Private window or blocked storage: show every layer.
    }
  }, []);

  function toggleLayer(id: Layer) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(HIDDEN_KEY, JSON.stringify(Array.from(next)));
      } catch {
        // Not saved; the toggle still works for this visit.
      }
      return next;
    });
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const grid = monthMatrix(cursor).flat();
    const range = `start=${dayKey(grid[0])}&end=${dayKey(grid[grid.length - 1])}`;
    try {
      const [jan, man] = await Promise.all([
        fetchJson<{ shifts: (JanitorialShift & { logged?: boolean })[] }>(`/api/erp/janitorial/schedule?${range}`),
        showManagement
          ? fetchJson<{ items: ManagementItem[]; categories: ManagementCategoryDto[] }>(`/api/erp/management-calendar?${range}`)
          : Promise.resolve(null),
      ]);
      setShifts(jan.shifts);
      setMgmt(man);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the calendar");
    } finally {
      setLoading(false);
    }
  }, [cursor, showManagement]);

  useEffect(() => {
    void load();
  }, [load]);

  const chipsByDay = useMemo(() => {
    const map = new Map<string, Chip[]>();
    const push = (k: string, chip: Chip) => {
      const list = map.get(k) ?? [];
      list.push(chip);
      map.set(k, list);
    };

    if (!hidden.has("projects")) {
      // Turnover units at the same building on the same day fold into one
      // chip, same as the Projects calendar.
      const turnoverGroups = new Map<string, { buildingId: string; name: string; units: number; planned: boolean }>();
      for (const p of projects) {
        const days = new Map<string, boolean>();
        for (const k of p.loggedDayKeys) days.set(k, false);
        for (const k of p.plannedDayKeys) if (!days.has(k)) days.set(k, true);
        for (const k of [p.startKey, p.endKey]) if (k && !days.has(k)) days.set(k, true);
        const group = calendarSegmentGroup(p.segment);
        for (const [k, planned] of days) {
          if (group === "JANITORIAL_TURNOVER_REQUESTS" && p.buildingId) {
            const gk = `${k}|${p.buildingId}`;
            const g = turnoverGroups.get(gk) ?? { buildingId: p.buildingId, name: p.buildingName ?? "Turnovers", units: 0, planned: true };
            g.units += 1;
            g.planned &&= planned;
            turnoverGroups.set(gk, g);
            continue;
          }
          push(k, {
            key: `p:${p.id}:${k}`,
            label: p.jobTitle,
            title: `${p.jobTitle}${planned ? " (planned)" : ""}`,
            href: `/erp/projects/${p.id}`,
            className: `${PROJECT_CHIP_CLASS[group]} ${p.status === "COMPLETE" ? "opacity-60" : ""}`,
            planned,
          });
        }
      }
      for (const [gk, g] of turnoverGroups) {
        const k = gk.split("|")[0];
        const label = `${g.name} · ${g.units} unit${g.units === 1 ? "" : "s"}`;
        push(k, {
          key: `t:${gk}`,
          label,
          title: `Turnovers: ${label}`,
          href: `/erp/buildings/${g.buildingId}`,
          className: PROJECT_CHIP_CLASS.JANITORIAL_TURNOVER_REQUESTS,
          planned: g.planned,
        });
      }
    }

    if (!hidden.has("janitorial")) {
      // One chip per building per day, listing who is on it.
      const groups = new Map<string, { contractId: string; name: string; people: string[]; logged: boolean; cover: boolean }>();
      for (const s of shifts) {
        if (s.status === "CANCELLED") continue;
        const gk = `${s.date}|${s.contractId}`;
        const g = groups.get(gk) ?? { contractId: s.contractId, name: s.buildingName, people: [], logged: false, cover: false };
        g.people.push(s.employeeName);
        g.logged ||= !!s.logged;
        g.cover ||= !!s.timeOffType && s.date >= todayKey;
        groups.set(gk, g);
      }
      for (const [gk, g] of groups) {
        const k = gk.split("|")[0];
        push(k, {
          key: `j:${gk}`,
          label: `${g.name} · ${g.people.length}`,
          title: `Janitorial: ${g.name}\n${g.people.join(", ")}${g.cover ? "\nNeeds cover" : ""}`,
          href: `/erp/schedule?calendar=janitorial&contract=${g.contractId}`,
          className: `${JANITORIAL_CHIP_CLASS} ${g.cover ? "ring-1 ring-red-500" : ""}`,
          planned: !g.logged,
        });
      }
    }

    if (!hidden.has("management") && mgmt) {
      const colorById = new Map(mgmt.categories.map((c) => [c.id, c.color]));
      for (const item of mgmt.items) {
        // Multi-day items show on every day of their range inside the grid.
        for (const cell of cells) {
          const k = dayKey(cell);
          if (k < item.start || k > item.end) continue;
          push(k, {
            key: `m:${item.key}:${k}`,
            label: item.title,
            title: item.detail ? `${item.title}\n${item.detail}` : item.title,
            href: item.href ?? "/erp/schedule?calendar=management",
            className: `${categoryColor(colorById.get(item.categoryId) ?? "gray").chip} ${item.done ? "line-through opacity-60" : ""}`,
            planned: false,
          });
        }
      }
    }

    return map;
  }, [projects, shifts, mgmt, hidden, cells, todayKey]);

  const nav = (
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
      <div className="flex flex-wrap items-center gap-1.5">
        {LAYERS.filter((l) => showManagement || l.id !== "management").map((l) => {
          const on = !hidden.has(l.id);
          return (
            <button
              key={l.id}
              type="button"
              onClick={() => toggleLayer(l.id)}
              aria-pressed={on}
              className={`flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors ${
                on ? "border-gray-300 bg-white text-gray-700" : "border-gray-200 bg-gray-50 text-gray-400 line-through"
              }`}
            >
              <span className={`h-2.5 w-2.5 rounded-sm ${on ? l.swatch : "bg-gray-200"}`} />
              {l.label}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <CollapsibleSection title="Master calendar" headerExtra={nav}>
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className={`h-2.5 w-4 rounded-sm bg-gray-100 ${PLANNED_CHIP_CLASS}`} /> Planned
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm bg-gray-300" /> Logged
        </span>
        {loading && <span className="text-gray-400">Loading…</span>}
        {error && <span className="text-red-600">{error}</span>}
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
            {cells.map((cell) => {
              const k = dayKey(cell);
              const inMonth = cell.getUTCMonth() === cursor.getUTCMonth();
              const isToday = k === todayKey;
              const chips = chipsByDay.get(k) ?? [];
              const expanded = expandedDays.has(k);
              const shown = expanded ? chips : chips.slice(0, MAX_CHIPS_PER_DAY);
              const more = chips.length - shown.length;
              return (
                <div key={k} className={`min-h-[96px] bg-white p-1.5 ${isToday ? "bg-pink-50/40 ring-1 ring-inset ring-pink-400" : ""}`}>
                  <div className={inMonth ? "" : "opacity-40"}>
                    <div
                      className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-medium ${
                        isToday ? "bg-pink-600 text-white" : "text-gray-500"
                      }`}
                    >
                      {cell.getUTCDate()}
                    </div>
                    {shown.length > 0 && (
                      <ul className="mt-1 space-y-1">
                        {shown.map((c) => (
                          <li key={c.key}>
                            <Link
                              href={c.href}
                              title={c.title}
                              className={`block truncate rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${c.className} ${
                                c.planned ? PLANNED_CHIP_CLASS : "shadow-sm"
                              }`}
                            >
                              {c.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                    {(more > 0 || expanded) && chips.length > MAX_CHIPS_PER_DAY && (
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedDays((prev) => {
                            const next = new Set(prev);
                            if (next.has(k)) next.delete(k);
                            else next.add(k);
                            return next;
                          })
                        }
                        className="mt-1 text-[10px] font-medium text-gray-500 hover:text-pink-600"
                      >
                        {expanded ? "Show less" : `+${more} more`}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </CollapsibleSection>
  );
}
