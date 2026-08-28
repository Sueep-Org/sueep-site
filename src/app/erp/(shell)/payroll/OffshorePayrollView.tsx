"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { centsToDollars } from "@/lib/erp/money";

type OffshoreRow = {
  employeeId: string;
  name: string;
  monthlyRateCents: number;
  paidAt: string | null;
};

type OffshoreResponse = {
  periodStart: string;
  rows: OffshoreRow[];
};

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatMonth(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function OffshorePayrollView() {
  const [monthDate, setMonthDate] = useState(() => new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)));
  const [rows, setRows] = useState<OffshoreRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(`/api/erp/offshore-payroll?month=${monthKey(monthDate)}`)
      .then((r) => r.json())
      .then((d: OffshoreResponse) => {
        if (cancelled) return;
        setRows(d.rows);
      })
      .catch(() => { if (!cancelled) setError("Could not load offshore payroll data."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [monthDate]);

  async function togglePaid(row: OffshoreRow) {
    const nextPaid = !row.paidAt;
    setSavingId(row.employeeId);
    setRows((prev) => prev.map((r) => (r.employeeId === row.employeeId ? { ...r, paidAt: nextPaid ? new Date().toISOString() : null } : r)));
    try {
      const res = await fetch("/api/erp/offshore-payroll/payment", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ employeeId: row.employeeId, month: monthKey(monthDate), paid: nextPaid }),
      });
      if (!res.ok) throw new Error("Failed to update");
    } catch {
      setRows((prev) => prev.map((r) => (r.employeeId === row.employeeId ? row : r)));
    } finally {
      setSavingId(null);
    }
  }

  const totalCents = rows.reduce((s, r) => s + r.monthlyRateCents, 0);
  const paidCents = rows.filter((r) => r.paidAt).reduce((s, r) => s + r.monthlyRateCents, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
        <button
          type="button"
          onClick={() => setMonthDate((d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)))}
          className="rounded-md border border-gray-300 p-1.5 hover:bg-gray-50"
          aria-label="Previous month"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-gray-600">
            <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
          </svg>
        </button>
        <div className="flex-1 text-center">
          <p className="text-sm font-semibold text-gray-900">{formatMonth(monthDate)}</p>
          <p className="text-xs text-gray-500">Fixed monthly pay</p>
        </div>
        <button
          type="button"
          onClick={() => setMonthDate((d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)))}
          className="rounded-md border border-gray-300 p-1.5 hover:bg-gray-50"
          aria-label="Next month"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-gray-600">
            <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-300 bg-gray-200 text-xs font-semibold uppercase text-gray-700">
              <tr>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3 text-right">Monthly rate</th>
                <th className="px-4 py-3">Paid</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
              ) : error ? (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-red-500">{error}</td></tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-gray-500">
                    No offshore employees yet.{" "}
                    <Link href="/erp/employees" className="font-medium text-pink-600 hover:underline">
                      Mark someone as offshore
                    </Link>{" "}
                    on their employee profile.
                  </td>
                </tr>
              ) : (
                rows.map((row, i) => (
                  <tr key={row.employeeId} className={`${i % 2 === 0 ? "bg-white" : "bg-gray-50"} hover:bg-gray-100`}>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      <Link href={`/erp/employees/${row.employeeId}`} className="hover:text-pink-600 hover:underline">
                        {row.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">{centsToDollars(row.monthlyRateCents)}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => togglePaid(row)}
                        disabled={savingId === row.employeeId}
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
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot className="border-t-2 border-gray-300 bg-gray-100 text-xs font-semibold text-gray-700">
                <tr>
                  <td className="px-4 py-3">Totals</td>
                  <td className="px-4 py-3 text-right tabular-nums">{centsToDollars(totalCents)}</td>
                  <td className="px-4 py-3 tabular-nums text-emerald-700">{centsToDollars(paidCents)} paid</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
    </div>
  );
}
