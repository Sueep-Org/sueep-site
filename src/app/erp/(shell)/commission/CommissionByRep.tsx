"use client";

import Link from "next/link";
import { useState } from "react";
import { centsToDollars } from "@/lib/erp/money";
import { marginTierFor, ANNUAL_ACCELERATOR_THRESHOLD_CENTS } from "@/lib/erp/commission";
import { DetailTabs } from "@/app/erp/components/DetailTabs";

export type CommissionDealRow = {
  projectId: string;
  jobTitle: string;
  ownerName: string | null;
  contractValueCents: number;
  marginCents: number | null;
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
};

type PaidFilter = "all" | "paid" | "unpaid";

function marginPercentOf(row: CommissionDealRow): number | null {
  if (row.marginCents == null || row.contractValueCents === 0) return null;
  return (row.marginCents / row.contractValueCents) * 100;
}

function YearTabs({ years, selectedYear }: { years: number[]; selectedYear: number }) {
  if (years.length <= 1) return null;
  return (
    <div className="flex gap-1">
      {years.map((y) => (
        <Link
          key={y}
          href={`/erp/commission?year=${y}`}
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

function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-0.5 rounded-md bg-gray-100 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
            value === o.value ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function RevenueLine({ revenueCents }: { revenueCents: number }) {
  const overThreshold = revenueCents > ANNUAL_ACCELERATOR_THRESHOLD_CENTS;
  return (
    <span className="text-xs text-gray-500">
      {centsToDollars(revenueCents)} closed this year
      {overThreshold ? (
        <span className="ml-1 font-semibold text-pink-600">· accelerator active</span>
      ) : (
        <span className="ml-1">of {centsToDollars(ANNUAL_ACCELERATOR_THRESHOLD_CENTS)} threshold</span>
      )}
    </span>
  );
}

function RepPanel({
  yearRevenueCents,
  deals,
  onMarkAllPaid,
  onTogglePaid,
  savingId,
}: {
  yearRevenueCents: number;
  deals: CommissionDealRow[];
  onMarkAllPaid: () => void;
  onTogglePaid: (row: CommissionDealRow) => void;
  savingId: string | null;
}) {
  const [search, setSearch] = useState("");
  const [paidFilter, setPaidFilter] = useState<PaidFilter>("all");

  const totalCents = deals.reduce((s, d) => s + d.commissionCents, 0);
  const paidCents = deals.filter((d) => d.paidAt).reduce((s, d) => s + d.commissionCents, 0);
  const unpaidCents = totalCents - paidCents;

  const query = search.trim().toLowerCase();
  const visibleDeals = deals
    .filter((d) => !query || d.jobTitle.toLowerCase().includes(query))
    .filter((d) => paidFilter === "all" || (paidFilter === "paid" ? !!d.paidAt : !d.paidAt))
    .sort((a, b) => b.commissionCents - a.commissionCents);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
        <div className="space-y-1">
          <div className="flex gap-5 text-sm">
            <span className="tabular-nums text-gray-700">{centsToDollars(totalCents)} owed</span>
            <span className="tabular-nums text-gray-500">{centsToDollars(paidCents)} paid</span>
          </div>
          <RevenueLine revenueCents={yearRevenueCents} />
        </div>
        {unpaidCents > 0 ? (
          <button
            type="button"
            onClick={onMarkAllPaid}
            className="rounded-full border border-pink-300 bg-pink-50 px-3 py-1 text-xs font-semibold text-pink-700 hover:bg-pink-100"
          >
            Mark {centsToDollars(unpaidCents)} paid
          </button>
        ) : (
          <span className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            All paid
          </span>
        )}
      </div>

      {deals.length === 0 ? (
        <p className="text-sm text-gray-400">No deals.</p>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-3 py-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects…"
              className="w-52 rounded-md border border-gray-300 px-2.5 py-1 text-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
            />
            <SegmentedControl
              value={paidFilter}
              onChange={setPaidFilter}
              options={[
                { value: "all", label: "All" },
                { value: "unpaid", label: "Unpaid" },
                { value: "paid", label: "Paid" },
              ]}
            />
          </div>

          {visibleDeals.length === 0 ? (
            <p className="p-4 text-center text-sm text-gray-400">No deals match the current filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100 text-sm">
                <thead>
                  <tr className="text-xs font-medium text-gray-500">
                    <th className="px-3 py-2 text-left">Project</th>
                    <th className="px-3 py-2 text-right">Contract</th>
                    <th className="px-3 py-2 text-right">Margin</th>
                    <th className="px-3 py-2 text-right">Rate</th>
                    <th className="px-3 py-2 text-right">Commission</th>
                    <th className="px-3 py-2 text-left">Paid</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {visibleDeals.map((d) => {
                    const marginPct = marginPercentOf(d);
                    const tier = marginPct == null ? null : marginTierFor(marginPct);
                    return (
                      <tr key={d.projectId} className="hover:bg-gray-50">
                        <td className="max-w-xs truncate px-3 py-2">
                          <Link href={`/erp/projects/${d.projectId}`} className="text-pink-600 hover:underline">
                            {d.jobTitle}
                          </Link>
                        </td>
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

  async function markAllPaid(ownerKey: string) {
    const unpaid = (dealsByOwner[ownerKey] ?? []).filter((d) => !d.paidAt);
    await Promise.all(unpaid.map((d) => setPaid(d, ownerKey, true)));
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
                  onMarkAllPaid={() => markAllPaid(key)}
                />
              ),
            };
          })}
        />
      )}
    </div>
  );
}
