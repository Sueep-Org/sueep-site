"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { centsToDollars } from "@/lib/erp/money";
import { marginTierFor, recurringCommissionRateForMonth, ANNUAL_ACCELERATOR_THRESHOLD_CENTS } from "@/lib/erp/commission";
import { normalizeProjectSegment, type ProjectSegment } from "@/lib/erp/projectSegments";
import { DetailTabs } from "@/app/erp/components/DetailTabs";

export type CommissionDealRow = {
  projectId: string;
  jobTitle: string;
  segment: string;
  ownerName: string | null;
  contractValueCents: number;
  marginCents: number | null;
  commissionCents: number;
  paidAt: string | null;
  completedAt: string;
};

// Same calendar-style grouping the Schedule page uses — painting/cleaning
// folded into one "Post-construction" bucket rather than shown separately.
type ProjectTypeGroup = "POST_CONSTRUCTION" | "JANITORIAL_TURNOVER_REQUESTS" | "REAL_ESTATE" | "OTHER";

const SEGMENT_TO_TYPE_GROUP: Record<ProjectSegment, ProjectTypeGroup> = {
  COMMERCIAL_PAINTING: "POST_CONSTRUCTION",
  COMMERCIAL_CLEANING: "POST_CONSTRUCTION",
  CHANGE_ORDER: "OTHER",
  JANITORIAL_TURNOVER_REQUESTS: "JANITORIAL_TURNOVER_REQUESTS",
  REAL_ESTATE: "REAL_ESTATE",
  OTHER: "OTHER",
};

const PROJECT_TYPE_OPTIONS: { value: ProjectTypeGroup; label: string }[] = [
  { value: "POST_CONSTRUCTION", label: "Post-construction" },
  { value: "JANITORIAL_TURNOVER_REQUESTS", label: "Janitorial" },
  { value: "REAL_ESTATE", label: "Real estate" },
  { value: "OTHER", label: "Other" },
];

const ALL_PROJECT_TYPES = PROJECT_TYPE_OPTIONS.map((o) => o.value);

function projectTypeGroup(segment: string): ProjectTypeGroup {
  return SEGMENT_TO_TYPE_GROUP[normalizeProjectSegment(segment)];
}

export type RecurringCommissionRow = {
  contractId: string;
  buildingId: string;
  periodId: string;
  buildingName: string;
  periodStart: string;
  monthlyRateCents: number;
  /** 0-based month index of the contract this period falls in — drives the 5% / 2% / $0 tier. */
  monthIndex: number;
  commissionCents: number;
  paidAt: string | null;
};

export type RepGroup = {
  ownerId: string | null;
  ownerName: string;
  yearRevenueCents: number;
  totalCommissionCents: number;
  paidCommissionCents: number;
  deals: CommissionDealRow[];
  recurringRows: RecurringCommissionRow[];
};

type PaidFilter = "all" | "paid" | "unpaid";
type SortKey = "date" | "margin" | "commission";
type SortState = { key: SortKey; dir: "asc" | "desc" };

function marginPercentOf(row: CommissionDealRow): number | null {
  if (row.marginCents == null || row.contractValueCents === 0) return null;
  return (row.marginCents / row.contractValueCents) * 100;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function formatMonth(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

function recurringTierLabel(monthIndex: number): string {
  const rate = recurringCommissionRateForMonth(monthIndex);
  const yearLabel = monthIndex < 12 ? "Year 1" : monthIndex < 24 ? "Year 2" : "Year 3+";
  return `${yearLabel} · ${rate > 0 ? `${(rate * 100).toFixed(0)}%` : "$0"}`;
}

function sortValue(row: CommissionDealRow, key: SortKey): number {
  if (key === "date") return new Date(row.completedAt).getTime();
  if (key === "margin") return row.marginCents ?? -Infinity;
  return row.commissionCents;
}

type CombinedRow =
  | { kind: "deal"; deal: CommissionDealRow }
  | { kind: "recurring"; recurring: RecurringCommissionRow };

function combinedDateIso(row: CombinedRow): string {
  return row.kind === "deal" ? row.deal.completedAt : row.recurring.periodStart;
}
function combinedPaidAt(row: CombinedRow): string | null {
  return row.kind === "deal" ? row.deal.paidAt : row.recurring.paidAt;
}
function combinedTypeGroup(row: CombinedRow): ProjectTypeGroup {
  return row.kind === "deal" ? projectTypeGroup(row.deal.segment) : "JANITORIAL_TURNOVER_REQUESTS";
}
function combinedSearchText(row: CombinedRow): string {
  return row.kind === "deal" ? row.deal.jobTitle : row.recurring.buildingName;
}
function combinedSortValue(row: CombinedRow, key: SortKey): number {
  if (key === "date") return new Date(combinedDateIso(row)).getTime();
  if (key === "margin") return row.kind === "deal" ? (row.deal.marginCents ?? -Infinity) : -Infinity;
  return row.kind === "deal" ? row.deal.commissionCents : row.recurring.commissionCents;
}

const SORT_OPTIONS: { value: SortState; label: string }[] = [
  { value: { key: "commission", dir: "desc" }, label: "Commission: High to low" },
  { value: { key: "commission", dir: "asc" }, label: "Commission: Low to high" },
  { value: { key: "margin", dir: "desc" }, label: "Margin: High to low" },
  { value: { key: "margin", dir: "asc" }, label: "Margin: Low to high" },
  { value: { key: "date", dir: "desc" }, label: "Date: Newest first" },
  { value: { key: "date", dir: "asc" }, label: "Date: Oldest first" },
];

function SortPopover({ sort, onChange }: { sort: SortState; onChange: (v: SortState) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Sort"
        className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 transition-colors hover:border-gray-300"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5h11M3 12h7.5M3 16.5h4M16.5 6v12m0 0l-3.5-3.5M16.5 18l3.5-3.5" />
        </svg>
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-2 w-52 rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Sort by</p>
          <div className="mt-1.5 space-y-1">
            {SORT_OPTIONS.map((opt) => (
              <label key={opt.label} className="flex items-center gap-2 text-xs text-gray-700">
                <input
                  type="radio"
                  name="commission-sort"
                  checked={sort.key === opt.value.key && sort.dir === opt.value.dir}
                  onChange={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className="h-3.5 w-3.5 border-gray-300 text-pink-600 focus:ring-pink-400"
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function YearTabs({ years, selectedYear }: { years: number[]; selectedYear: number }) {
  if (years.length <= 1) return null;
  return (
    <div className="flex gap-1">
      {years.map((y) => (
        <Link
          key={y}
          href={`/erp/payroll?view=Commission&year=${y}`}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            y === selectedYear ? "bg-pink-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          {y}
        </Link>
      ))}
    </div>
  );
}

function FilterPopover({
  paidFilter,
  onPaidFilterChange,
  selectedTypes,
  onToggleType,
  onClear,
}: {
  paidFilter: PaidFilter;
  onPaidFilterChange: (v: PaidFilter) => void;
  selectedTypes: Set<ProjectTypeGroup>;
  onToggleType: (t: ProjectTypeGroup) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const filtersActive = paidFilter !== "all" || selectedTypes.size < ALL_PROJECT_TYPES.length;

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Filter"
        className={`flex h-8 w-8 items-center justify-center rounded-md border transition-colors ${
          filtersActive ? "border-pink-300 bg-pink-50 text-pink-600" : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
        }`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 4.5h18M6.75 12h10.5M10.5 19.5h3" />
        </svg>
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-2 w-56 rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Paid status</p>
          <div className="mt-1.5 space-y-1">
            {([
              { value: "all", label: "All" },
              { value: "unpaid", label: "Unpaid" },
              { value: "paid", label: "Paid" },
            ] as const).map((opt) => (
              <label key={opt.value} className="flex items-center gap-2 text-xs text-gray-700">
                <input
                  type="radio"
                  name="commission-paid-filter"
                  checked={paidFilter === opt.value}
                  onChange={() => onPaidFilterChange(opt.value)}
                  className="h-3.5 w-3.5 border-gray-300 text-pink-600 focus:ring-pink-400"
                />
                {opt.label}
              </label>
            ))}
          </div>

          <div className="my-3 border-t border-gray-100" />

          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Project type</p>
          <div className="mt-1.5 space-y-1">
            {PROJECT_TYPE_OPTIONS.map((opt) => (
              <label key={opt.value} className="flex items-center gap-2 text-xs text-gray-700">
                <input
                  type="checkbox"
                  checked={selectedTypes.has(opt.value)}
                  onChange={() => onToggleType(opt.value)}
                  className="h-3.5 w-3.5 rounded border-gray-300 text-pink-600 focus:ring-pink-400"
                />
                {opt.label}
              </label>
            ))}
          </div>

          {filtersActive ? (
            <button
              type="button"
              onClick={onClear}
              className="mt-3 w-full rounded border border-gray-200 py-1 text-[11px] font-medium text-gray-500 hover:bg-gray-50"
            >
              Clear filters
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function RevenueLine({ revenueCents }: { revenueCents: number }) {
  const overThreshold = revenueCents > ANNUAL_ACCELERATOR_THRESHOLD_CENTS;
  const pct = Math.min(100, (revenueCents / ANNUAL_ACCELERATOR_THRESHOLD_CENTS) * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold tabular-nums text-gray-700">{centsToDollars(revenueCents)}</span>
        {overThreshold ? (
          <span className="text-xs font-semibold text-pink-600">Accelerator active</span>
        ) : (
          <span className="text-xs tabular-nums text-gray-400">of {centsToDollars(ANNUAL_ACCELERATOR_THRESHOLD_CENTS)}</span>
        )}
      </div>
      <div className={`mt-1.5 h-2.5 w-full overflow-hidden rounded-full ${overThreshold ? "bg-pink-100" : "bg-gray-100"}`}>
        <div className={`h-full rounded-full ${overThreshold ? "bg-pink-600" : "bg-gray-400"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function RepPanel({
  yearRevenueCents,
  deals,
  onTogglePaid,
  savingId,
  recurringRows,
  onToggleRecurringPaid,
  savingRecurringId,
}: {
  yearRevenueCents: number;
  deals: CommissionDealRow[];
  onTogglePaid: (row: CommissionDealRow) => void;
  savingId: string | null;
  recurringRows: RecurringCommissionRow[];
  onToggleRecurringPaid: (row: RecurringCommissionRow) => void;
  savingRecurringId: string | null;
}) {
  const [search, setSearch] = useState("");
  const [paidFilter, setPaidFilter] = useState<PaidFilter>("all");
  const [selectedTypes, setSelectedTypes] = useState<Set<ProjectTypeGroup>>(() => new Set(ALL_PROJECT_TYPES));
  const [sort, setSort] = useState<SortState>({ key: "commission", dir: "desc" });

  function toggleType(t: ProjectTypeGroup) {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  const combined: CombinedRow[] = [
    ...deals.map((d) => ({ kind: "deal" as const, deal: d })),
    ...recurringRows.map((r) => ({ kind: "recurring" as const, recurring: r })),
  ];

  const query = search.trim().toLowerCase();
  const visibleRows = combined
    .filter((row) => !query || combinedSearchText(row).toLowerCase().includes(query))
    .filter((row) => paidFilter === "all" || (paidFilter === "paid" ? !!combinedPaidAt(row) : !combinedPaidAt(row)))
    .filter((row) => selectedTypes.has(combinedTypeGroup(row)))
    .sort((a, b) =>
      sort.dir === "desc"
        ? combinedSortValue(b, sort.key) - combinedSortValue(a, sort.key)
        : combinedSortValue(a, sort.key) - combinedSortValue(b, sort.key)
    );

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
        <RevenueLine revenueCents={yearRevenueCents} />
      </div>

      {combined.length === 0 ? (
        <p className="text-sm text-gray-400">No deals.</p>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="flex items-center gap-3 border-b border-gray-100 px-3 py-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects…"
              className="w-52 rounded-md border border-gray-300 px-2.5 py-1 text-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
            />
            <div className="ml-auto flex items-center gap-2">
              <SortPopover sort={sort} onChange={setSort} />
              <FilterPopover
                paidFilter={paidFilter}
                onPaidFilterChange={setPaidFilter}
                selectedTypes={selectedTypes}
                onToggleType={toggleType}
                onClear={() => {
                  setPaidFilter("all");
                  setSelectedTypes(new Set(ALL_PROJECT_TYPES));
                }}
              />
            </div>
          </div>

          {visibleRows.length === 0 ? (
            <p className="p-4 text-center text-sm text-gray-400">No deals match the current filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100 text-sm">
                <thead>
                  <tr className="text-xs font-medium text-gray-500">
                    <th className="px-3 py-2 text-left">Project</th>
                    <th className="px-3 py-2 text-right">Date</th>
                    <th className="px-3 py-2 text-right">Contract</th>
                    <th className="px-3 py-2 text-right">Margin</th>
                    <th className="px-3 py-2 text-right">Rate</th>
                    <th className="px-3 py-2 text-right">Commission</th>
                    <th className="px-3 py-2 text-left">Paid</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {visibleRows.map((row) => {
                    if (row.kind === "deal") {
                      const d = row.deal;
                      const marginPct = marginPercentOf(d);
                      const tier = marginPct == null ? null : marginTierFor(marginPct);
                      return (
                        <tr key={d.projectId} className="hover:bg-gray-50">
                          <td className="max-w-xs truncate px-3 py-2">
                            <Link href={`/erp/projects/${d.projectId}`} className="text-pink-600 hover:underline">
                              {d.jobTitle}
                            </Link>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-500">{formatDate(d.completedAt)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-700">{centsToDollars(d.contractValueCents)}</td>
                          <td className={`px-3 py-2 text-right tabular-nums ${d.marginCents != null && d.marginCents < 0 ? "text-red-600" : "text-gray-700"}`}>
                            {d.marginCents == null ? "—" : centsToDollars(d.marginCents)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-500">
                            {marginPct == null || tier == null ? "—" : `${marginPct.toFixed(0)}% → ${(tier.baseRate * 100).toFixed(0)}%`}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium text-gray-900">{centsToDollars(d.commissionCents)}</td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => onTogglePaid(d)}
                              disabled={savingId === d.projectId}
                              className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold disabled:opacity-50 ${
                                d.paidAt
                                  ? "border-emerald-300 bg-emerald-100 text-emerald-800"
                                  : "border-gray-300 bg-gray-100 text-gray-600"
                              }`}
                            >
                              {d.paidAt ? "Paid" : "Not paid"}
                            </button>
                          </td>
                        </tr>
                      );
                    }

                    const r = row.recurring;
                    return (
                      <tr key={r.periodId} className="bg-violet-50/50 hover:bg-violet-100/60">
                        <td className="max-w-xs truncate px-3 py-2">
                          <Link href={`/erp/buildings/${r.buildingId}`} className="text-pink-600 hover:underline">
                            {r.buildingName}
                          </Link>
                          <span className="ml-1.5 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">Recurring</span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-500">{formatMonth(r.periodStart)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-700">{centsToDollars(r.monthlyRateCents)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-400">—</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-500">{recurringTierLabel(r.monthIndex)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium text-gray-900">{centsToDollars(r.commissionCents)}</td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => onToggleRecurringPaid(r)}
                            disabled={savingRecurringId === r.periodId}
                            className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold disabled:opacity-50 ${
                              r.paidAt
                                ? "border-emerald-300 bg-emerald-100 text-emerald-800"
                                : "border-gray-300 bg-gray-100 text-gray-600"
                            }`}
                          >
                            {r.paidAt ? "Paid" : "Not paid"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function CommissionByRep({
  years,
  selectedYear,
  reps,
}: {
  years: number[];
  selectedYear: number;
  reps: RepGroup[];
}) {
  const [dealsByOwner, setDealsByOwner] = useState<Record<string, CommissionDealRow[]>>(() =>
    Object.fromEntries(reps.map((g) => [g.ownerId ?? "unassigned", g.deals]))
  );
  const [savingId, setSavingId] = useState<string | null>(null);

  const [recurringByOwner, setRecurringByOwner] = useState<Record<string, RecurringCommissionRow[]>>(() =>
    Object.fromEntries(reps.map((g) => [g.ownerId ?? "unassigned", g.recurringRows]))
  );
  const [savingRecurringId, setSavingRecurringId] = useState<string | null>(null);

  async function setPaid(row: CommissionDealRow, ownerKey: string, paid: boolean) {
    setSavingId(row.projectId);
    setDealsByOwner((prev) => ({
      ...prev,
      [ownerKey]: prev[ownerKey].map((d) =>
        d.projectId === row.projectId ? { ...d, paidAt: paid ? new Date().toISOString() : null } : d
      ),
    }));
    try {
      const res = await fetch(`/api/erp/projects/${row.projectId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ commissionPaid: paid }),
      });
      if (!res.ok) throw new Error("Failed to update");
    } catch {
      setDealsByOwner((prev) => ({
        ...prev,
        [ownerKey]: prev[ownerKey].map((d) => (d.projectId === row.projectId ? { ...d, paidAt: row.paidAt } : d)),
      }));
    } finally {
      setSavingId(null);
    }
  }

  async function setRecurringPaid(row: RecurringCommissionRow, ownerKey: string, paid: boolean) {
    setSavingRecurringId(row.periodId);
    setRecurringByOwner((prev) => ({
      ...prev,
      [ownerKey]: prev[ownerKey].map((r) =>
        r.periodId === row.periodId ? { ...r, paidAt: paid ? new Date().toISOString() : null } : r
      ),
    }));
    try {
      const res = await fetch(`/api/erp/buildings/${row.buildingId}/recurring-contract/periods/${row.periodId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ commissionPaid: paid }),
      });
      if (!res.ok) throw new Error("Failed to update");
    } catch {
      setRecurringByOwner((prev) => ({
        ...prev,
        [ownerKey]: prev[ownerKey].map((r) => (r.periodId === row.periodId ? { ...r, paidAt: row.paidAt } : r)),
      }));
    } finally {
      setSavingRecurringId(null);
    }
  }

  const totalCommission = reps.reduce((s, r) => s + r.totalCommissionCents, 0);
  const totalPaid = reps.reduce((s, r) => s + r.paidCommissionCents, 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-4 text-sm text-gray-600">
          <p>Total commission ({selectedYear}): <span className="font-semibold text-gray-900">{centsToDollars(totalCommission)}</span></p>
          <p>Paid: <span className="font-semibold text-gray-900">{centsToDollars(totalPaid)}</span></p>
        </div>
        <YearTabs years={years} selectedYear={selectedYear} />
      </div>

      {reps.length === 0 ? (
        <p className="rounded-lg border border-gray-200 bg-white p-4 text-center text-sm text-gray-400">
          No deals with a contract value in {selectedYear}.
        </p>
      ) : (
        <DetailTabs
          tabs={reps.map((group) => {
            const key = group.ownerId ?? "unassigned";
            return {
              label: group.ownerName,
              content: (
                <RepPanel
                  yearRevenueCents={group.yearRevenueCents}
                  deals={dealsByOwner[key] ?? []}
                  savingId={savingId}
                  onTogglePaid={(row) => setPaid(row, key, !row.paidAt)}
                  recurringRows={recurringByOwner[key] ?? []}
                  savingRecurringId={savingRecurringId}
                  onToggleRecurringPaid={(row) => setRecurringPaid(row, key, !row.paidAt)}
                />
              ),
            };
          })}
        />
      )}
    </div>
  );
}
