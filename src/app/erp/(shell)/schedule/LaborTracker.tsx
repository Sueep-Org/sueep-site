"use client";

import { useMemo } from "react";
import Link from "next/link";
import { dayKey } from "@/lib/erp/schedule";

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
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function LaborTracker({ laborEntries, projects }: LaborTrackerProps) {
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
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center">
        <p className="text-sm text-gray-500">No labor entries yet. Log hours from project pages.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="text-xs text-gray-500">Total Hours</div>
          <div className="mt-1 text-lg font-semibold text-pink-600">{stats.totalHours.toFixed(1)}</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="text-xs text-gray-500">Total Labor Cost</div>
          <div className="mt-1 text-lg font-semibold text-pink-600">{formatCurrency(stats.totalCost)}</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="text-xs text-gray-500">Workers</div>
          <div className="mt-1 text-lg font-semibold text-pink-600">{stats.workerCount}</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="text-xs text-gray-500">Entries</div>
          <div className="mt-1 text-lg font-semibold text-pink-600">{stats.entryCount}</div>
        </div>
      </div>

      {/* Daily Summary */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Daily Summary</h3>
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
                  className="flex items-center justify-between rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs"
                >
                  <span className="font-medium text-gray-700">{new Date(date).toLocaleDateString()}</span>
                  <span className="text-gray-500">{entries.length} entries</span>
                  <span className="text-pink-600">{dailyHours.toFixed(1)}h</span>
                  <span className="text-emerald-600">{formatCurrency(dailyCost)}</span>
                </div>
              );
            })}
        </div>
      </div>

      {/* Worker Summary */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">By Worker</h3>
        <div className="space-y-3">
          {Array.from(entriesByWorker.entries()).map(([worker, entries]) => {
            const workerHours = entries.reduce((sum, e) => sum + e.hours, 0);
            const workerCost = entries.reduce((sum, e) => sum + e.hours * e.hourlyRateCents, 0);
            const roles = Array.from(new Set(entries.map((e) => e.role).filter(Boolean)));
            return (
              <div key={worker} className="rounded border border-gray-200 bg-gray-50 p-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="font-medium text-gray-800">{worker}</div>
                    {roles.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {roles.map((role) => (
                          <span key={role} className="rounded-sm bg-gray-200 px-1.5 py-0.5 text-xs text-gray-600">
                            {role}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-right text-xs">
                    <div className="text-pink-600">{workerHours.toFixed(1)}h</div>
                    <div className="text-emerald-600">{formatCurrency(workerCost)}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent Entries */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Recent Entries</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="px-2 py-2 text-left font-medium text-gray-500">Date</th>
                <th className="px-2 py-2 text-left font-medium text-gray-500">Worker</th>
                <th className="px-2 py-2 text-left font-medium text-gray-500">Role</th>
                <th className="px-2 py-2 text-left font-medium text-gray-500">Project</th>
                <th className="px-2 py-2 text-right font-medium text-gray-500">Hours</th>
                <th className="px-2 py-2 text-right font-medium text-gray-500">Rate</th>
                <th className="px-2 py-2 text-right font-medium text-gray-500">Cost</th>
              </tr>
            </thead>
            <tbody>
              {laborEntries.slice(-20).map((entry) => {
                const project = projectMap.get(entry.projectId);
                const entryCost = entry.hours * entry.hourlyRateCents;
                return (
                  <tr key={entry.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-2 py-2 text-gray-500">
                      {new Date(entry.workDate).toLocaleDateString()}
                    </td>
                    <td className="px-2 py-2 text-gray-800">{entry.workerName}</td>
                    <td className="px-2 py-2 text-gray-500">{entry.role || "—"}</td>
                    <td className="px-2 py-2">
                      {project ? (
                        <Link
                          href={`/erp/projects/${entry.projectId}`}
                          className="text-pink-600 hover:underline"
                        >
                          {project.jobTitle}
                        </Link>
                      ) : (
                        <span className="text-gray-400">Unknown</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right text-pink-600">{entry.hours.toFixed(1)}</td>
                    <td className="px-2 py-2 text-right text-gray-500">{formatCurrency(entry.hourlyRateCents)}</td>
                    <td className="px-2 py-2 text-right text-emerald-600">{formatCurrency(entryCost)}</td>
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
