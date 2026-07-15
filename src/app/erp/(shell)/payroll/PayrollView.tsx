"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

type PayrollRow = {
  isContractor: boolean;
  employeeId: string | null;
  name: string;
  payType: string;
  hourlyRateCents: number;
  totalHours: number;
  regHours: number;
  otHours: number;
  grossPayCents: number;
  projects: string;
};

type PayFilter = "all" | "hourly" | "salary" | "contractor";

type PayrollResponse = {
  periodStart: string;
  periodEnd: string;
  rows: PayrollRow[];
};

const DEFAULT_ANCHOR = "2024-01-01";
const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

function anchorDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function biweeklyIndex(date: Date, anchor: Date): number {
  return Math.floor((date.getTime() - anchor.getTime()) / TWO_WEEKS_MS);
}

function biweeklyRange(index: number, anchor: Date): { start: Date; end: Date } {
  const start = new Date(anchor.getTime() + index * TWO_WEEKS_MS);
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
    "Employee Name",
    "Pay Period Start",
    "Pay Period End",
    "Total Hours",
    "Hourly Rate",
    "Gross Pay",
    "Projects",
  ];

  const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

  const dataRows = rows.map((r) => [
    escape(batchId),
    escape(r.name),
    escape(periodStart),
    escape(periodEnd),
    escape(fmtHours(r.totalHours)),
    escape((r.hourlyRateCents / 100).toFixed(2)),
    escape((r.grossPayCents / 100).toFixed(2)),
    escape(r.projects),
  ].join(","));

  return [headers.map(escape).join(","), ...dataRows].join("\r\n");
}

function isMondayISO(iso: string): boolean {
  const d = new Date(`${iso}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.getUTCDay() === 1;
}

function SettingsPopover({
  anchorISO,
  onSaveAnchor,
  onDownloadCsv,
  downloadDisabled,
}: {
  anchorISO: string;
  onSaveAnchor: (iso: string) => Promise<string | null>;
  onDownloadCsv: () => void;
  downloadDisabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(anchorISO);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  async function handleSave() {
    if (!isMondayISO(draft)) {
      setError("Anchor must be a Monday.");
      return;
    }
    setError("");
    setSaving(true);
    const err = await onSaveAnchor(draft);
    setSaving(false);
    if (err) setError(err);
    else setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => { setDraft(anchorISO); setError(""); setOpen((v) => !v); }}
        aria-label="Payroll settings"
        title="Payroll settings"
        className={`flex h-8 w-8 items-center justify-center rounded-md border transition-colors ${
          open ? "border-pink-300 bg-pink-50 text-pink-600" : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
        }`}
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
          <path fillRule="evenodd" d="M8.34 1.804A1 1 0 0 1 9.32 1h1.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l.68 1.178a1 1 0 0 1-.204 1.243l-1.267 1.14a7.047 7.047 0 0 1 0 2.228l1.267 1.14a1 1 0 0 1 .204 1.243l-.68 1.178a1 1 0 0 1-1.186.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H9.32a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-.68-1.178a1 1 0 0 1 .204-1.243l1.267-1.14a7.047 7.047 0 0 1 0-2.228L2.82 6.899a1 1 0 0 1-.204-1.243l.68-1.178a1 1 0 0 1 1.186-.447l1.598.54A6.993 6.993 0 0 1 8.01 3.456l.33-1.652ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clipRule="evenodd" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-64 rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Pay period anchor</p>
          <p className="mt-1 text-xs text-gray-500">Current: <span className="font-medium text-gray-700">{anchorISO}</span></p>
          <input
            type="date"
            className="mt-2 w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setError(""); }}
          />
          {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-md bg-pink-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-pink-500 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>

          <div className="mt-3 border-t border-gray-100 pt-3">
            <button
              type="button"
              onClick={() => { onDownloadCsv(); setOpen(false); }}
              disabled={downloadDisabled}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-pink-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-40"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
                <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
              </svg>
              Download CSV
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function PayrollView() {
  const [anchorISO, setAnchorISO] = useState(DEFAULT_ANCHOR);
  const [anchorLoaded, setAnchorLoaded] = useState(false);

  const [periodIndex, setPeriodIndex] = useState(0);
  const [data, setData] = useState<PayrollResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [payFilter, setPayFilter] = useState<PayFilter>("all");
  const [search, setSearch] = useState("");

  // Load anchor from API on mount
  useEffect(() => {
    fetch("/api/erp/settings/payroll-anchor")
      .then((r) => r.json())
      .then((d: { anchor: string }) => {
        setAnchorISO(d.anchor);
        const anchor = anchorDate(d.anchor);
        setPeriodIndex(biweeklyIndex(new Date(), anchor));
        setAnchorLoaded(true);
      })
      .catch(() => {
        setPeriodIndex(biweeklyIndex(new Date(), anchorDate(DEFAULT_ANCHOR)));
        setAnchorLoaded(true);
      });
  }, []);

  const anchor = anchorDate(anchorISO);
  const { start, end } = biweeklyRange(periodIndex, anchor);

  // Load payroll data when period or anchor changes
  useEffect(() => {
    if (!anchorLoaded) return;
    const { start: s, end: e } = biweeklyRange(periodIndex, anchor);
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
  }, [periodIndex, anchorISO, anchorLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveAnchor(draft: string): Promise<string | null> {
    try {
      const res = await fetch("/api/erp/settings/payroll-anchor", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ anchor: draft }),
      });
      const result = (await res.json()) as { anchor?: string; error?: string };
      if (!res.ok) return result.error ?? "Save failed";
      const newAnchor = anchorDate(result.anchor!);
      setAnchorISO(result.anchor!);
      setPeriodIndex(biweeklyIndex(new Date(), newAnchor));
      return null;
    } catch {
      return "Network error";
    }
  }

  const filteredRows = (data?.rows ?? []).filter((r) => {
    if (payFilter === "hourly") return !r.isContractor && r.payType !== "SALARY";
    if (payFilter === "salary") return !r.isContractor && r.payType === "SALARY";
    if (payFilter === "contractor") return r.isContractor;
    return true;
  }).filter((r) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return r.name.toLowerCase().includes(q);
  });

  function downloadCsv() {
    if (!data) return;
    const suffix = payFilter === "hourly" ? "-hourly" : payFilter === "salary" ? "-salary" : payFilter === "contractor" ? "-contractors" : "";
    const csv = buildCsv(filteredRows, data.periodStart, data.periodEnd);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payroll-${data.periodStart}${suffix}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalGross = filteredRows.reduce((s, r) => s + r.grossPayCents, 0);
  const totalHours = filteredRows.reduce((s, r) => s + r.totalHours, 0);

  return (
    <div className="space-y-4">
      {/* Toolbar: period nav + anchor + CSV, then search + filters */}
      <div className="space-y-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
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

          <SettingsPopover
            anchorISO={anchorISO}
            onSaveAnchor={saveAnchor}
            onDownloadCsv={downloadCsv}
            downloadDisabled={!data || data.rows.length === 0}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-3">
          <input
            type="search"
            placeholder="Search by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500 w-56"
          />
          <div className="flex rounded-md border border-gray-300 overflow-hidden text-xs font-medium">
            {([["all", "All"], ["hourly", "Hourly"], ["salary", "Salary"], ["contractor", "Contractors"]] as [PayFilter, string][]).map(([f, label]) => (
              <button
                key={f}
                type="button"
                onClick={() => setPayFilter(f)}
                className={`px-3 py-1.5 transition-colors ${payFilter === f ? "bg-pink-600 text-white" : "bg-white text-gray-700 hover:bg-gray-50"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-gray-300 bg-gray-200 text-xs font-semibold uppercase text-gray-700">
              <tr>
                <th className="px-4 py-3">Employee</th>
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
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">Loading…</td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-red-500">{error}</td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">No labor entries for this pay period.</td>
                </tr>
              ) : (
                filteredRows.map((row, i) => (
                  <tr key={`${row.isContractor ? "c" : "e"}-${row.employeeId ?? row.name}`} className={`${i % 2 === 0 ? "bg-white" : "bg-gray-50"} hover:bg-gray-100`}>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      <div className="flex items-center gap-2">
                        {row.isContractor && (
                          <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">Contractor</span>
                        )}
                        {row.employeeId ? (
                          <Link href={`/erp/employees/${row.employeeId}`} className="hover:text-pink-600 hover:underline">
                            {row.name}
                          </Link>
                        ) : (
                          <span className={row.isContractor ? "text-gray-900" : "text-gray-500"}>{row.name}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                      {row.isContractor ? <span className="text-gray-400">—</span> : fmtHours(row.regHours)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {row.isContractor ? (
                        <span className="text-gray-400">—</span>
                      ) : row.otHours > 0 ? (
                        <span className="font-medium text-amber-600">{fmtHours(row.otHours)}</span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-900">
                      {row.isContractor ? <span className="text-gray-400">—</span> : fmtHours(row.totalHours)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                      {row.isContractor ? <span className="text-xs text-gray-400">Flat fee</span> : `${fmt(row.hourlyRateCents)}/hr`}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">{fmt(row.grossPayCents)}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{row.projects}</td>
                  </tr>
                ))
              )}
            </tbody>
            {filteredRows.length > 0 && (
              <tfoot className="border-t-2 border-gray-300 bg-gray-100 text-xs font-semibold text-gray-700">
                <tr>
                  <td className="px-4 py-3" colSpan={1}>Totals</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtHours(filteredRows.reduce((s, r) => s + r.regHours, 0))}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-amber-600">{fmtHours(filteredRows.reduce((s, r) => s + r.otHours, 0)) || "—"}</td>
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
