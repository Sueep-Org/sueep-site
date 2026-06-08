"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

type PayrollRow = {
  employeeId: string | null;
  adpFileNumber: string | null;
  name: string;
  hourlyRateCents: number;
  totalHours: number;
  regHours: number;
  otHours: number;
  grossPayCents: number;
  projects: string;
};

type PayrollResponse = {
  periodStart: string;
  periodEnd: string;
  rows: PayrollRow[];
};

/** Biweekly anchor: Monday 2024-01-01. Returns the index of the biweekly period containing `date`. */
const ANCHOR = new Date("2024-01-01T00:00:00Z");
const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

function biweeklyIndex(date: Date): number {
  return Math.floor((date.getTime() - ANCHOR.getTime()) / TWO_WEEKS_MS);
}

function biweeklyRange(index: number): { start: Date; end: Date } {
  const start = new Date(ANCHOR.getTime() + index * TWO_WEEKS_MS);
  const end = new Date(start.getTime() + TWO_WEEKS_MS - 1);
  return { start, end };
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmt(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function fmtHours(h: number): string {
  return h % 1 === 0 ? String(h) : h.toFixed(2);
}

function buildCsv(rows: PayrollRow[], periodStart: string, periodEnd: string): string {
  const batchId = `PAY-${periodStart}`;
  const headers = [
    "Batch ID",
    "File #",
    "Employee Name",
    "Pay Period Start",
    "Pay Period End",
    "Reg Hours",
    "OT Hours",
    "Total Hours",
    "Hourly Rate",
    "Reg Pay",
    "OT Pay",
    "Gross Pay",
    "Projects",
  ];

  const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

  const dataRows = rows.map((r) => [
    escape(batchId),
    escape(r.adpFileNumber ?? ""),
    escape(r.name),
    escape(periodStart),
    escape(periodEnd),
    escape(fmtHours(r.regHours)),
    escape(fmtHours(r.otHours)),
    escape(fmtHours(r.totalHours)),
    escape((r.hourlyRateCents / 100).toFixed(2)),
    escape(((r.regHours * r.hourlyRateCents) / 100).toFixed(2)),
    escape(((r.otHours * r.hourlyRateCents * 1.5) / 100).toFixed(2)),
    escape((r.grossPayCents / 100).toFixed(2)),
    escape(r.projects),
  ].join(","));

  return [headers.map(escape).join(","), ...dataRows].join("\r\n");
}

export default function PayrollExportPage() {
  const [periodIndex, setPeriodIndex] = useState(() => biweeklyIndex(new Date()));
  const [data, setData] = useState<PayrollResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const { start, end } = biweeklyRange(periodIndex);

  useEffect(() => {
    const { start: s, end: e } = biweeklyRange(periodIndex);
    const startISO = toISO(s);
    const endISO = toISO(e);
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(`/api/erp/payroll?start=${startISO}&end=${endISO}`)
      .then((r) => r.json())
      .then((d: PayrollResponse) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError("Could not load payroll data."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [periodIndex]); // primitive — only fires when user navigates periods

  function downloadCsv() {
    if (!data) return;
    const csv = buildCsv(data.rows, data.periodStart, data.periodEnd);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payroll-${data.periodStart}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalGross = data?.rows.reduce((s, r) => s + r.grossPayCents, 0) ?? 0;
  const totalHours = data?.rows.reduce((s, r) => s + r.totalHours, 0) ?? 0;
  const missingAdp = data?.rows.filter((r) => !r.adpFileNumber).length ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-pink-600">Payroll Export</h1>
          <p className="mt-1 text-sm text-gray-500">Biweekly labor summary for ADP Run import.</p>
        </div>
        <button
          type="button"
          onClick={downloadCsv}
          disabled={!data || data.rows.length === 0}
          className="flex items-center gap-2 rounded-md bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-40"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
            <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
          </svg>
          Download CSV
        </button>
      </div>

      {/* Pay period picker */}
      <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
        <button
          type="button"
          onClick={() => setPeriodIndex((i) => i - 1)}
          className="rounded-md border border-gray-300 p-1.5 hover:bg-gray-50"
          aria-label="Previous period"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-gray-600">
            <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
          </svg>
        </button>
        <div className="flex-1 text-center">
          <p className="text-sm font-semibold text-gray-900">
            {formatDate(start)} – {formatDate(end)}
          </p>
          <p className="text-xs text-gray-500">Biweekly pay period</p>
        </div>
        <button
          type="button"
          onClick={() => setPeriodIndex((i) => i + 1)}
          className="rounded-md border border-gray-300 p-1.5 hover:bg-gray-50"
          aria-label="Next period"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-gray-600">
            <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {/* Warnings */}
      {missingAdp > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <svg viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 h-4 w-4 shrink-0 text-amber-500">
            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
          </svg>
          <span>
            {missingAdp} employee{missingAdp > 1 ? "s are" : " is"} missing an ADP File #.{" "}
            <Link href="/erp/employees" className="font-medium underline hover:text-amber-900">
              Add file numbers
            </Link>{" "}
            on each employee profile before uploading to ADP Run.
          </span>
        </div>
      )}

      {/* Summary cards */}
      {data && (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Total gross pay</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">{fmt(totalGross)}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Total hours</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">{fmtHours(totalHours)}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Employees</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">{data.rows.length}</p>
          </div>
        </div>
      )}

      {/* Table */}
      <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-gray-300 bg-gray-200 text-xs font-semibold uppercase text-gray-700">
              <tr>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">ADP File #</th>
                <th className="px-4 py-3 text-right">Reg Hrs</th>
                <th className="px-4 py-3 text-right">OT Hrs</th>
                <th className="px-4 py-3 text-right">Total Hrs</th>
                <th className="px-4 py-3 text-right">Rate</th>
                <th className="px-4 py-3 text-right">Gross Pay</th>
                <th className="px-4 py-3">Projects</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-400">Loading…</td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-red-500">{error}</td>
                </tr>
              ) : !data || data.rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500">No labor entries for this pay period.</td>
                </tr>
              ) : (
                data.rows.map((row, i) => (
                  <tr key={row.employeeId ?? row.name} className={`${i % 2 === 0 ? "bg-white" : "bg-gray-50"} hover:bg-gray-100`}>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {row.employeeId ? (
                        <Link href={`/erp/employees/${row.employeeId}`} className="hover:text-pink-600 hover:underline">
                          {row.name}
                        </Link>
                      ) : (
                        <span className="text-gray-500">{row.name}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {row.adpFileNumber ? (
                        <span className="font-mono text-gray-700">{row.adpFileNumber}</span>
                      ) : (
                        <span className="text-amber-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">{fmtHours(row.regHours)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                      {row.otHours > 0 ? (
                        <span className="font-medium text-amber-600">{fmtHours(row.otHours)}</span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-900">{fmtHours(row.totalHours)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">{fmt(row.hourlyRateCents)}/hr</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">{fmt(row.grossPayCents)}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{row.projects}</td>
                  </tr>
                ))
              )}
            </tbody>
            {data && data.rows.length > 0 && (
              <tfoot className="border-t-2 border-gray-300 bg-gray-100 text-xs font-semibold text-gray-700">
                <tr>
                  <td className="px-4 py-3" colSpan={2}>Totals</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtHours(data.rows.reduce((s, r) => s + r.regHours, 0))}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtHours(data.rows.reduce((s, r) => s + r.otHours, 0))}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtHours(totalHours)}</td>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(totalGross)}</td>
                  <td className="px-4 py-3" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
    </div>
  );
}
