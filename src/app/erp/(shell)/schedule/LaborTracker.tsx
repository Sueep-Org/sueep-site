"use client";

import { useMemo } from "react";
import Link from "next/link";
import { startOfDay, dayKey, addDays } from "@/lib/erp/schedule";

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

interface LaborTrackerProps {
  laborEntries: LaborEntryData[];
  projects: ProjectData[];
  dateRange?: { start: Date; end: Date };
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function LaborTracker({ laborEntries, projects, dateRange }: LaborTrackerProps) {
  const projectMap = useMemo(() => {
    const map = new Map<string, ProjectData>();
    projects.forEach((p) => map.set(p.id, p));
    return map;
  }, [projects]);

  // Group labor entries by day
  const entriesByDay = useMemo(() => {
    const map = new Map<string, LaborEntryData[]>();
    laborEntries.forEach((entry) => {
      const date = new Date(entry.workDate);
      const key = dayKey(date);
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(entry);
    });
    return map;
  }, [laborEntries]);

  // Group labor entries by worker
  const entriesByWorker = useMemo(() => {
    const map = new Map<string, LaborEntryData[]>();
    laborEntries.forEach((entry) => {
      if (!map.has(entry.workerName)) {
        map.set(entry.workerName, []);
      }
      map.get(entry.workerName)!.push(entry);
    });
    return map;
  }, [laborEntries]);

  // Calculate stats
  const stats = useMemo(() => {
    const totalHours = laborEntries.reduce((sum, e) => sum + e.hours, 0);
    const totalCost = laborEntries.reduce((sum, e) => sum + e.hours * e.hourlyRateCents, 0);
    const workerCount = entriesByWorker.size;
    const entryCount = laborEntries.length;

    return { totalHours, totalCost, workerCount, entryCount };
  }, [laborEntries, entriesByWorker]);

  if (laborEntries.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4 text-center">
        <p className="text-sm text-zinc-500">No labor entries yet. Log hours from project pages.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
          <div className="text-xs text-zinc-500">Total Hours</div>
          <div className="mt-1 text-lg font-semibold text-pink-400">{stats.totalHours.toFixed(1)}</div>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
          <div className="text-xs text-zinc-500">Total Labor Cost</div>
          <div className="mt-1 text-lg font-semibold text-pink-400">{formatCurrency(stats.totalCost)}</div>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
          <div className="text-xs text-zinc-500">Workers</div>
          <div className="mt-1 text-lg font-semibold text-pink-400">{stats.workerCount}</div>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
          <div className="text-xs text-zinc-500">Entries</div>
          <div className="mt-1 text-lg font-semibold text-pink-400">{stats.entryCount}</div>
        </div>
      </div>

      {/* Daily Summary */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Daily Summary</h3>
        <div className="space-y-2">
          {Array.from(entriesByDay.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .slice(-7)
            .map(([date, entries]) => {
              const dailyHours = entries.reduce((sum, e) => sum + e.hours, 0);
              const dailyCost = entries.reduce((sum, e) => sum + e.hours * e.hourlyRateCents, 0);
              return (
                <div
                  key={date}
                  className="flex items-center justify-between rounded border border-zinc-800/50 bg-zinc-900/20 px-3 py-2 text-xs"
                >
                  <span className="font-medium text-zinc-300">{new Date(date).toLocaleDateString()}</span>
                  <span className="text-zinc-400">{entries.length} entries</span>
                  <span className="text-pink-400">{dailyHours.toFixed(1)}h</span>
                  <span className="text-emerald-400">{formatCurrency(dailyCost)}</span>
                </div>
              );
            })}
        </div>
      </div>

      {/* Worker Summary */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">By Worker</h3>
        <div className="space-y-3">
          {Array.from(entriesByWorker.entries()).map(([worker, entries]) => {
            const workerHours = entries.reduce((sum, e) => sum + e.hours, 0);
            const workerCost = entries.reduce((sum, e) => sum + e.hours * e.hourlyRateCents, 0);
            const roles = Array.from(new Set(entries.map((e) => e.role).filter(Boolean)));
            return (
              <div key={worker} className="rounded border border-zinc-800/50 bg-zinc-900/20 p-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="font-medium text-zinc-200">{worker}</div>
                    {roles.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {roles.map((role) => (
                          <span key={role} className="rounded-sm bg-zinc-800/50 px-1.5 py-0.5 text-xs text-zinc-400">
                            {role}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-right text-xs">
                    <div className="text-pink-400">{workerHours.toFixed(1)}h</div>
                    <div className="text-emerald-400">{formatCurrency(workerCost)}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent Entries */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Recent Entries</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-800/50">
                <th className="px-2 py-2 text-left font-medium text-zinc-400">Date</th>
                <th className="px-2 py-2 text-left font-medium text-zinc-400">Worker</th>
                <th className="px-2 py-2 text-left font-medium text-zinc-400">Role</th>
                <th className="px-2 py-2 text-left font-medium text-zinc-400">Project</th>
                <th className="px-2 py-2 text-right font-medium text-zinc-400">Hours</th>
                <th className="px-2 py-2 text-right font-medium text-zinc-400">Rate</th>
                <th className="px-2 py-2 text-right font-medium text-zinc-400">Cost</th>
              </tr>
            </thead>
            <tbody>
              {laborEntries.slice(-20).map((entry) => {
                const project = projectMap.get(entry.projectId);
                const entryCost = entry.hours * entry.hourlyRateCents;
                return (
                  <tr key={entry.id} className="border-b border-zinc-800/30 hover:bg-zinc-900/30">
                    <td className="px-2 py-2 text-zinc-400">
                      {new Date(entry.workDate).toLocaleDateString()}
                    </td>
                    <td className="px-2 py-2 text-zinc-200">{entry.workerName}</td>
                    <td className="px-2 py-2 text-zinc-400">{entry.role || "—"}</td>
                    <td className="px-2 py-2">
                      {project ? (
                        <Link
                          href={`/erp/projects/${entry.projectId}`}
                          className="text-pink-400 hover:underline"
                        >
                          {project.jobTitle}
                        </Link>
                      ) : (
                        <span className="text-zinc-500">Unknown</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right text-pink-400">{entry.hours.toFixed(1)}</td>
                    <td className="px-2 py-2 text-right text-zinc-400">{formatCurrency(entry.hourlyRateCents)}</td>
                    <td className="px-2 py-2 text-right text-emerald-400">{formatCurrency(entryCost)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
