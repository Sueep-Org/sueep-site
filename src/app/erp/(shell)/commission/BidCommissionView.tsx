"use client";

import { useState } from "react";
import { centsToDollars } from "@/lib/erp/money";
import { bidBonusRowKey, type BidBonusRow } from "@/lib/erp/bidBonus";

type PaidFilter = "all" | "paid" | "unpaid";

function formatWeek(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function sortByWeekDesc(rows: BidBonusRow[]): BidBonusRow[] {
  return [...rows].sort((a, b) => new Date(b.weekStart).getTime() - new Date(a.weekStart).getTime());
}

/** verifiedBids is derived server-side from sent bids on the Bids tab — this page only tracks paid status. */
export function BidCommissionView({ rows: initialRows }: { rows: BidBonusRow[] }) {
  const [rows, setRows] = useState(() => sortByWeekDesc(initialRows));
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [paidFilter, setPaidFilter] = useState<PaidFilter>("all");
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const employeeOptions = [...new Map(initialRows.map((r) => [r.employeeId, r.employeeName])).entries()];

  const visibleRows = rows
    .filter((r) => employeeFilter === "all" || r.employeeId === employeeFilter)
    .filter((r) => paidFilter === "all" || (paidFilter === "paid" ? !!r.paidAt : !r.paidAt));

  const totalBonus = rows.reduce((s, r) => s + r.bonusCents, 0);
  const totalPaid = rows.filter((r) => r.paidAt).reduce((s, r) => s + r.bonusCents, 0);

  async function togglePaid(row: BidBonusRow) {
    const key = bidBonusRowKey(row.employeeId, row.weekStart);
    const nextPaid = !row.paidAt;
    setSavingKey(key);
    setRows((prev) =>
      prev.map((r) => (bidBonusRowKey(r.employeeId, r.weekStart) === key ? { ...r, paidAt: nextPaid ? new Date().toISOString() : null } : r))
    );
    try {
      const res = await fetch(`/api/erp/bid-bonuses`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ employeeId: row.employeeId, weekStart: row.weekStart, paid: nextPaid }),
      });
      if (!res.ok) throw new Error("Failed to update");
    } catch {
      setRows((prev) => prev.map((r) => (bidBonusRowKey(r.employeeId, r.weekStart) === key ? row : r)));
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
        <p>Total bonus: <span className="font-semibold text-gray-900">{centsToDollars(totalBonus)}</span></p>
        <p>Paid: <span className="font-semibold text-gray-900">{centsToDollars(totalPaid)}</span></p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={employeeFilter}
          onChange={(e) => setEmployeeFilter(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
        >
          <option value="all">All employees</option>
          {employeeOptions.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
        <div className="flex rounded-md border border-gray-300 overflow-hidden text-xs font-medium">
          {([["all", "All"], ["unpaid", "Unpaid"], ["paid", "Paid"]] as [PaidFilter, string][]).map(([f, label]) => (
            <button
              key={f}
              type="button"
              onClick={() => setPaidFilter(f)}
              className={`px-3 py-1.5 transition-colors ${paidFilter === f ? "bg-pink-600 text-white" : "bg-white text-gray-700 hover:bg-gray-50"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="border-b border-gray-300 bg-gray-200 text-xs font-semibold uppercase text-gray-700">
              <tr>
                <th className="px-4 py-3">Week of</th>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3 text-right">Verified bids</th>
                <th className="px-4 py-3 text-right">Bonus</th>
                <th className="px-4 py-3">Paid</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    No bonuses yet — mark bids as &quot;Sent&quot; on the Bids tab to populate this table.
                  </td>
                </tr>
              ) : (
                visibleRows.map((row, i) => {
                  const key = bidBonusRowKey(row.employeeId, row.weekStart);
                  return (
                    <tr key={key} className={`${i % 2 === 0 ? "bg-white" : "bg-gray-50"} hover:bg-gray-100`}>
                      <td className="px-4 py-3 tabular-nums text-gray-700">{formatWeek(row.weekStart)}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{row.employeeName}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700">{row.verifiedBids}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">{centsToDollars(row.bonusCents)}</td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => togglePaid(row)}
                          disabled={savingKey === key}
                          className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold disabled:opacity-50 ${
                            row.paidAt
                              ? "border-emerald-300 bg-emerald-100 text-emerald-800"
                              : "border-gray-300 bg-gray-100 text-gray-600"
                          }`}
                        >
                          {row.paidAt ? "Paid" : "Not paid"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
