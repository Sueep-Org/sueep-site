"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { addDays, startOfDay } from "@/lib/erp/schedule";

export type LaborEntryData = {
  id: string;
  projectId: string;
  workDate: string;
  workerName: string;
  role?: string | null;
  hours: number;
  hourlyRateCents: number;
  taskDescription?: string | null;
};

export type ProjectData = {
  id: string;
  jobTitle: string;
};

interface WorkerTimelineProps {
  laborEntries: LaborEntryData[];
  projects: ProjectData[];
  daysToShow?: number;
}

export function WorkerTimeline({ laborEntries, projects, daysToShow = 14 }: WorkerTimelineProps) {
  const projectMap = useMemo(() => {
    const map = new Map<string, ProjectData>();
    projects.forEach((p) => map.set(p.id, p));
    return map;
  }, [projects]);

  const [sortBy, setSortBy] = useState<"worker" | "date">("worker");

  // Get unique workers
  const workers = useMemo(() => {
    const set = new Set(laborEntries.map((e) => e.workerName));
    return Array.from(set).sort();
  }, [laborEntries]);

  // Get date range
  const dateRange = useMemo(() => {
    const today = startOfDay(new Date());
    const dates: Date[] = [];
    for (let i = 0; i < daysToShow; i++) {
      dates.push(addDays(today, i));
    }
    return dates;
  }, [daysToShow]);

  // Group entries by worker and date
  const entriesByWorkerDate = useMemo(() => {
    const map = new Map<string, Map<string, LaborEntryData[]>>();
    laborEntries.forEach((entry) => {
      const dateKey = new Date(entry.workDate).toISOString().slice(0, 10);
      if (!map.has(entry.workerName)) {
        map.set(entry.workerName, new Map());
      }
      const dateMap = map.get(entry.workerName)!;
      if (!dateMap.has(dateKey)) {
        dateMap.set(dateKey, []);
      }
      dateMap.get(dateKey)!.push(entry);
    });
    return map;
  }, [laborEntries]);

  if (workers.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4 text-center">
        <p className="text-sm text-zinc-500">No worker data available.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex gap-2">
          <button
            onClick={() => setSortBy("worker")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              sortBy === "worker"
                ? "bg-pink-600 text-white"
                : "border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            }`}
          >
            By Worker
          </button>
          <button
            onClick={() => setSortBy("date")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              sortBy === "date"
                ? "bg-pink-600 text-white"
                : "border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            }`}
          >
            By Date
          </button>
        </div>
      </div>

      {sortBy === "worker" ? (
        <div className="space-y-4">
          {workers.map((worker) => {
            const workerDates = entriesByWorkerDate.get(worker) || new Map();
            const workerEntries = Array.from(workerDates.values()).flat();
            const totalHours = workerEntries.reduce((sum, e) => sum + e.hours, 0);

            return (
              <div key={worker} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-semibold text-zinc-100">{worker}</h3>
                  <span className="text-sm text-pink-400">{totalHours.toFixed(1)}h total</span>
                </div>

                <div className="grid auto-rows-max grid-cols-7 gap-2">
                  {dateRange.map((date) => {
                    const dateKey = date.toISOString().slice(0, 10);
                    const dayEntries = workerDates.get(dateKey) || [];
                    const dayHours = dayEntries.reduce((sum, e) => sum + e.hours, 0);
                    const isToday =
                      date.getTime() === startOfDay(new Date()).getTime();

                    return (
                      <div
                        key={dateKey}
                        className={`rounded border p-2 text-center text-xs ${
                          dayHours > 0
                            ? "border-pink-600/50 bg-pink-900/20"
                            : `border-zinc-700 ${isToday ? "bg-zinc-800/50" : "bg-zinc-800/20"}`
                        }`}
                      >
                        <div className="font-mono text-[10px] text-zinc-500">
                          {date.toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" })}
                        </div>
                        {dayHours > 0 && (
                          <>
                            <div className="mt-1 font-semibold text-pink-400">{dayHours.toFixed(1)}h</div>
                            <div className="mt-1 space-y-0.5">
                              {dayEntries.slice(0, 2).map((entry) => {
                                const project = projectMap.get(entry.projectId);
                                return (
                                  <div key={entry.id} className="text-[9px] text-zinc-300 truncate">
                                    {project?.jobTitle || "Unknown"}
                                  </div>
                                );
                              })}
                              {dayEntries.length > 2 && (
                                <div className="text-[9px] text-zinc-500">+{dayEntries.length - 2}</div>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-4">
          {dateRange.map((date) => {
            const dateKey = date.toISOString().slice(0, 10);
            const dayEntries = laborEntries.filter((e) => e.workDate.slice(0, 10) === dateKey);

            if (dayEntries.length === 0) {
              return null;
            }

            const dayHours = dayEntries.reduce((sum, e) => sum + e.hours, 0);
            const isToday = date.getTime() === startOfDay(new Date()).getTime();

            return (
              <div
                key={dateKey}
                className={`rounded-lg border p-4 ${
                  isToday ? "border-pink-600/50 bg-pink-900/10" : "border-zinc-800 bg-zinc-950/40"
                }`}
              >
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-semibold text-zinc-100">
                    {date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                  </h3>
                  <span className="text-sm text-pink-400">{dayHours.toFixed(1)}h</span>
                </div>

                <div className="space-y-2">
                  {dayEntries.map((entry) => {
                    const project = projectMap.get(entry.projectId);
                    const entryCost = entry.hours * entry.hourlyRateCents;
                    return (
                      <div key={entry.id} className="rounded border border-zinc-800/50 bg-zinc-900/20 p-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-zinc-200">{entry.workerName}</span>
                          <span className="text-pink-400">{entry.hours.toFixed(1)}h</span>
                        </div>
                        <div className="mt-1 flex items-center justify-between text-zinc-400">
                          <div>
                            {entry.role && <span>{entry.role}</span>}
                            {entry.role && project && " • "}
                            {project && (
                              <Link href={`/erp/projects/${entry.projectId}`} className="text-pink-400 hover:underline">
                                {project.jobTitle}
                              </Link>
                            )}
                          </div>
                          <span className="text-emerald-400">${((entry.hours * entry.hourlyRateCents) / 100).toFixed(2)}</span>
                        </div>
                        {entry.taskDescription && (
                          <div className="mt-1 text-zinc-500">{entry.taskDescription}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
