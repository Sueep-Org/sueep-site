"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LABOR_PAGE_SIZE } from "./laborPagination";
import { SearchableSelect } from "@/app/erp/components/SearchableSelect";

export type EmployeeLaborEntryRow = {
  id: string;
  projectId: string;
  projectTitle: string;
  workDate: string;
  role: string | null;
  hours: number;
  hourlyRateCents: number;
  taskDescription: string | null;
};

export type LaborProjectOption = { id: string; jobTitle: string };

const input =
  "rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";
const label = "block text-[11px] font-medium text-gray-500";

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function EmployeeLaborSection({
  employeeId,
  canSeePay,
  initialEntries,
  initialHasMore,
  projectOptions,
}: {
  employeeId: string;
  canSeePay: boolean;
  initialEntries: EmployeeLaborEntryRow[];
  initialHasMore: boolean;
  projectOptions: LaborProjectOption[];
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [projectId, setProjectId] = useState("");

  const isFirstRender = useRef(true);

  async function fetchPage(reset: boolean) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        employeeId,
        take: String(LABOR_PAGE_SIZE),
        skip: String(reset ? 0 : entries.length),
      });
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (projectId) params.set("projectId", projectId);

      const res = await fetch(`/api/erp/labor?${params.toString()}`);
      const data = (await res.json()) as { success: boolean; data?: EmployeeLaborEntryRow[]; hasMore?: boolean; error?: string };
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to load labor entries");

      setEntries((prev) => (reset ? data.data ?? [] : [...prev, ...(data.data ?? [])]));
      setHasMore(!!data.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load labor entries");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    fetchPage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, projectId]);

  const filtersActive = startDate !== "" || endDate !== "" || projectId !== "";

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
        <div>
          <label className={label} htmlFor="labor-start-date">
            From
          </label>
          <input
            id="labor-start-date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className={`${input} mt-1`}
          />
        </div>
        <div>
          <label className={label} htmlFor="labor-end-date">
            To
          </label>
          <input
            id="labor-end-date"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className={`${input} mt-1`}
          />
        </div>
        <div>
          <label className={label} htmlFor="labor-project">
            Project
          </label>
          <SearchableSelect
            id="labor-project"
            value={projectId}
            onChange={setProjectId}
            options={projectOptions.map((p) => ({ value: p.id, label: p.jobTitle }))}
            placeholder="Search projects…"
            allLabel="All projects"
            className="mt-1 min-w-[12rem]"
          />
        </div>
        {filtersActive ? (
          <button
            type="button"
            onClick={() => {
              setStartDate("");
              setEndDate("");
              setProjectId("");
            }}
            className="rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
          >
            Clear filters
          </button>
        ) : null}
      </div>

      {error ? <p className="text-xs text-red-500">{error}</p> : null}

      {entries.length === 0 && !loading ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center">
          <p className="text-sm text-gray-500">No labor entries{filtersActive ? " match these filters." : " yet."}</p>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-2.5 text-left font-medium text-gray-500">Date</th>
                  <th className="px-4 py-2.5 text-left font-medium text-gray-500">Project</th>
                  <th className="px-4 py-2.5 text-left font-medium text-gray-500">Role</th>
                  <th className="px-4 py-2.5 text-right font-medium text-gray-500">Hours</th>
                  {canSeePay && <th className="px-4 py-2.5 text-right font-medium text-gray-500">Rate</th>}
                  {canSeePay && <th className="px-4 py-2.5 text-right font-medium text-gray-500">Cost</th>}
                  <th className="px-4 py-2.5 text-left font-medium text-gray-500">Task</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-2.5 text-gray-500">{formatDate(entry.workDate)}</td>
                    <td className="px-4 py-2.5">
                      <Link href={`/erp/projects/${entry.projectId}`} className="text-pink-600 hover:underline">
                        {entry.projectTitle}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-gray-500">{entry.role || "—"}</td>
                    <td className="px-4 py-2.5 text-right text-pink-600">{entry.hours.toFixed(1)}</td>
                    {canSeePay && <td className="px-4 py-2.5 text-right text-gray-500">{formatCurrency(entry.hourlyRateCents)}</td>}
                    {canSeePay && (
                      <td className="px-4 py-2.5 text-right text-emerald-600">
                        {formatCurrency(entry.hours * entry.hourlyRateCents)}
                      </td>
                    )}
                    <td className="max-w-xs truncate px-4 py-2.5 text-gray-500">{entry.taskDescription || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {hasMore ? (
            <div className="border-t border-gray-100 p-3 text-center">
              <button
                type="button"
                onClick={() => fetchPage(false)}
                disabled={loading}
                className="rounded-md border border-gray-300 px-4 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50"
              >
                {loading ? "Loading…" : "Load more"}
              </button>
            </div>
          ) : loading ? (
            <p className="border-t border-gray-100 p-3 text-center text-xs text-gray-400">Loading…</p>
          ) : null}
        </div>
      )}
    </section>
  );
}
