"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SearchableSelect } from "@/app/erp/components/SearchableSelect";
import { CONTRACTOR_LABOR_PAGE_SIZE } from "./laborPagination";
import { inputClass, labelClass } from "@/app/erp/components/ui";
import { DownloadCsvButton } from "@/app/erp/components/DownloadCsvButton";
import { buildCsv, downloadCsv, slugForFilename, type CsvColumn } from "@/lib/erp/csv";
import { SubPayHoldDialog, type SubPayHoldTarget } from "@/app/erp/components/SubPayHoldDialog";
import type { ContractorWorkTotals } from "@/lib/erp/contractorWork";

export type ContractorAssignmentRow = {
  id: string;
  source: "PROJECT" | "CHANGE_ORDER";
  projectId: string | null;
  projectTitle: string | null;
  buildingId: string | null;
  buildingName: string | null;
  changeOrderTitle: string | null;
  role: string | null;
  date: string | null;
  endDate: string | null;
  costCents: number | null;
  taskDescription: string | null;
  /** HELD (out of payroll until released), RELEASED (paid on releasedOn) or null */
  hold: "HELD" | "RELEASED" | null;
  holdNote: string | null;
  releasedOn: string | null;
};

export type ContractorLaborProjectOption = { id: string; jobTitle: string };

const input = inputClass.xs;
const label = labelClass.compact;

function formatCurrency(cents: number | null): string {
  if (cents == null) return "-";
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function ContractorLaborSection({
  contractorId,
  contractorName,
  initialEntries,
  initialHasMore,
  projectOptions,
  buildingOptions,
  initialTotals,
  canHoldPay,
}: {
  contractorId: string;
  contractorName: string;
  initialEntries: ContractorAssignmentRow[];
  initialHasMore: boolean;
  projectOptions: ContractorLaborProjectOption[];
  buildingOptions: { id: string; name: string }[];
  /** Every row matching the filters, not just the loaded page */
  initialTotals: ContractorWorkTotals;
  /** Payroll roles can hold and release this sub's pay from here */
  canHoldPay: boolean;
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [totals, setTotals] = useState(initialTotals);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [projectId, setProjectId] = useState("");
  const [buildingId, setBuildingId] = useState("");
  const [sort, setSort] = useState<"date" | "building">("date");
  const [holdTarget, setHoldTarget] = useState<SubPayHoldTarget | null>(null);

  const isFirstRender = useRef(true);
  const [exporting, setExporting] = useState(false);

  // Exports every entry matching the current filters, not just the page
  // loaded on screen: same endpoint, with no `take` so it returns all rows.
  async function exportCsv() {
    setExporting(true);
    setError("");
    try {
      const params = new URLSearchParams({ contractorId });
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (projectId) params.set("projectId", projectId);
      if (buildingId) params.set("buildingId", buildingId);
      if (sort !== "date") params.set("sort", sort);
      const res = await fetch(`/api/erp/contractor-labor?${params.toString()}`);
      const data = (await res.json()) as { success: boolean; data?: ContractorAssignmentRow[]; error?: string };
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to export work history");
      const rows = data.data ?? [];

      const columns: CsvColumn<ContractorAssignmentRow>[] = [
        { header: "Start Date", get: (r) => r.date?.slice(0, 10) ?? "" },
        { header: "End Date", get: (r) => (r.endDate && r.endDate !== r.date ? r.endDate.slice(0, 10) : "") },
        { header: "Building", get: (r) => r.buildingName ?? "" },
        { header: "Project", get: (r) => r.projectTitle ?? "" },
        { header: "Change Order", get: (r) => (r.source === "CHANGE_ORDER" ? r.changeOrderTitle ?? "Yes" : "") },
        { header: "Role", get: (r) => r.role ?? "" },
        { header: "Cost", get: (r) => (r.costCents != null ? (r.costCents / 100).toFixed(2) : "") },
        { header: "Task", get: (r) => r.taskDescription ?? "" },
        { header: "Pay hold", get: (r) => (r.hold === "HELD" ? "On hold" : r.hold === "RELEASED" ? `Released, paid ${r.releasedOn ?? ""}` : "") },
      ];
      const totalCost = rows.reduce((sum, r) => sum + (r.costCents ?? 0), 0);
      const totalRow = ["TOTAL", "", "", "", "", "", (totalCost / 100).toFixed(2), "", ""];

      const range = startDate || endDate ? `${startDate || "start"}-to-${endDate || "today"}` : "all";
      downloadCsv(`labor-${slugForFilename(contractorName)}-${range}.csv`, buildCsv(columns, rows, [totalRow]));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export work history");
    } finally {
      setExporting(false);
    }
  }

  async function fetchPage(reset: boolean) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        contractorId,
        take: String(CONTRACTOR_LABOR_PAGE_SIZE),
        skip: String(reset ? 0 : entries.length),
      });
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (projectId) params.set("projectId", projectId);
      if (buildingId) params.set("buildingId", buildingId);
      if (sort !== "date") params.set("sort", sort);

      const res = await fetch(`/api/erp/contractor-labor?${params.toString()}`);
      const data = (await res.json()) as { success: boolean; data?: ContractorAssignmentRow[]; hasMore?: boolean; totals?: ContractorWorkTotals; error?: string };
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to load work history");

      setEntries((prev) => (reset ? data.data ?? [] : [...prev, ...(data.data ?? [])]));
      setHasMore(!!data.hasMore);
      if (data.totals) setTotals(data.totals);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load work history");
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
  }, [startDate, endDate, projectId, buildingId, sort]);

  const filtersActive = startDate !== "" || endDate !== "" || projectId !== "" || buildingId !== "";

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
        <div>
          <label className={label} htmlFor="contractor-labor-start-date">
            From
          </label>
          <input
            id="contractor-labor-start-date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className={`${input} mt-1`}
          />
        </div>
        <div>
          <label className={label} htmlFor="contractor-labor-end-date">
            To
          </label>
          <input
            id="contractor-labor-end-date"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className={`${input} mt-1`}
          />
        </div>
        <div>
          <label className={label} htmlFor="contractor-labor-project">
            Project
          </label>
          <SearchableSelect
            id="contractor-labor-project"
            value={projectId}
            onChange={setProjectId}
            options={projectOptions.map((p) => ({ value: p.id, label: p.jobTitle }))}
            placeholder="Search projects…"
            allLabel="All projects"
            className="mt-1 min-w-[12rem]"
          />
        </div>
        <div>
          <label className={label} htmlFor="contractor-labor-building">
            Building
          </label>
          <SearchableSelect
            id="contractor-labor-building"
            value={buildingId}
            onChange={setBuildingId}
            options={[...buildingOptions.map((b) => ({ value: b.id, label: b.name })), { value: "none", label: "No building" }]}
            placeholder="Search buildings…"
            allLabel="All buildings"
            className="mt-1 min-w-[12rem]"
          />
        </div>
        <div>
          <label className={label} htmlFor="contractor-labor-sort">
            Sort
          </label>
          <select id="contractor-labor-sort" value={sort} onChange={(e) => setSort(e.target.value as "date" | "building")} className={`${input} mt-1`}>
            <option value="date">Newest first</option>
            <option value="building">By building</option>
          </select>
        </div>
        {filtersActive ? (
          <button
            type="button"
            onClick={() => {
              setStartDate("");
              setEndDate("");
              setProjectId("");
              setBuildingId("");
            }}
            className="rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
          >
            Clear filters
          </button>
        ) : null}
        <div className="ml-auto">
          <DownloadCsvButton
            onClick={exportCsv}
            busy={exporting}
            disabled={entries.length === 0}
            title="Download all work history matching these filters"
          />
        </div>
      </div>

      {error ? <p className="text-xs text-red-500">{error}</p> : null}

      {entries.length === 0 && !loading ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center">
          <p className="text-sm text-gray-500">No work history{filtersActive ? " matches these filters." : " yet."}</p>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-xs">
              <colgroup>
                <col className="w-[11%]" />
                <col className="w-[18%]" />
                <col className="w-[24%]" />
                <col className="w-[10%]" />
                <col className="w-[10%]" />
                <col className={canHoldPay ? "w-[17%]" : "w-[27%]"} />
                {canHoldPay ? <col className="w-[10%]" /> : null}
              </colgroup>
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-2.5 text-left font-medium text-gray-500">Date</th>
                  <th className="px-4 py-2.5 text-left font-medium text-gray-500">Building</th>
                  <th className="px-4 py-2.5 text-left font-medium text-gray-500">Project</th>
                  <th className="px-4 py-2.5 text-left font-medium text-gray-500">Role</th>
                  <th className="px-4 py-2.5 text-right font-medium text-gray-500">Cost</th>
                  <th className="px-4 py-2.5 text-left font-medium text-gray-500">Task</th>
                  {canHoldPay ? <th className="px-4 py-2.5 text-right font-medium text-gray-500">Pay</th> : null}
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-500">
                      {formatDate(entry.date)}
                      {entry.endDate && entry.endDate !== entry.date ? ` – ${formatDate(entry.endDate)}` : ""}
                    </td>
                    <td className="truncate px-4 py-2.5 text-gray-700" title={entry.buildingName ?? undefined}>
                      {entry.buildingId ? (
                        <Link href={`/erp/buildings/${entry.buildingId}`} className="hover:text-pink-600 hover:underline">{entry.buildingName}</Link>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {entry.projectId && entry.projectTitle ? (
                        <Link href={`/erp/projects/${entry.projectId}`} className="text-pink-600 hover:underline">
                          {entry.projectTitle}
                        </Link>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                      {entry.source === "CHANGE_ORDER" ? (
                        <span
                          className="ml-1.5 inline-flex rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
                          title={entry.changeOrderTitle ? `Change order: ${entry.changeOrderTitle}` : "Change order"}
                        >
                          CO
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500">{entry.role || "-"}</td>
                    <td className="px-4 py-2.5 text-right text-emerald-600">
                      {formatCurrency(entry.costCents)}
                      {entry.hold === "HELD" ? (
                        <span className="block text-[10px] font-medium text-amber-700" title={entry.holdNote ?? undefined}>On hold</span>
                      ) : entry.hold === "RELEASED" ? (
                        <span className="block text-[10px] text-gray-500" title={entry.holdNote ? `Held: ${entry.holdNote}` : undefined}>
                          Released, paid {entry.releasedOn ? formatDate(`${entry.releasedOn}T00:00:00Z`) : ""}
                        </span>
                      ) : null}
                    </td>
                    <td className="truncate px-4 py-2.5 text-gray-500" title={entry.taskDescription ?? undefined}>{entry.taskDescription || "-"}</td>
                    {canHoldPay ? (
                      <td className="px-4 py-2.5 text-right">
                        {entry.costCents != null ? (
                          <button
                            type="button"
                            onClick={() =>
                              setHoldTarget({
                                mode: entry.hold === "HELD" ? "release" : "hold",
                                kind: entry.source === "CHANGE_ORDER" ? "co" : "project",
                                id: entry.id,
                                amountCents: entry.costCents ?? 0,
                                label: `${contractorName}, ${entry.projectTitle ?? entry.buildingName ?? "No project"}${entry.changeOrderTitle ? ` · CO: ${entry.changeOrderTitle}` : ""}`,
                                date: (entry.endDate ?? entry.date)?.slice(0, 10) ?? null,
                              })
                            }
                            className={entry.hold === "HELD" ? "font-medium text-amber-700 hover:underline" : "text-gray-400 hover:text-amber-700"}
                          >
                            {entry.hold === "HELD" ? "Release" : "Hold"}
                          </button>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-300 bg-gray-50 font-semibold text-gray-700">
                  <td colSpan={4} className="px-4 py-2.5">
                    Total{filtersActive ? " for these filters" : ""}
                    <span className="ml-1.5 font-normal text-gray-500">
                      {totals.count} line{totals.count === 1 ? "" : "s"}
                      {totals.count > entries.length ? `, ${entries.length} shown` : ""}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-emerald-700">
                    {formatCurrency(totals.totalCents)}
                    {totals.heldCents > 0 ? (
                      <span className="block text-[10px] font-medium text-amber-700">incl. {formatCurrency(totals.heldCents)} on hold</span>
                    ) : null}
                  </td>
                  <td colSpan={canHoldPay ? 2 : 1} />
                </tr>
              </tfoot>
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
      <SubPayHoldDialog target={holdTarget} onClose={() => setHoldTarget(null)} onDone={() => fetchPage(true)} />
    </section>
  );
}
