"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Modal, useConfirm, useToast } from "@/app/erp/components/ui";
import { EmployeeCombobox, type EmployeeOption } from "@/app/erp/components/EmployeeCombobox";
import { splitHoursOverWorkingDays } from "@/lib/erp/manualHours";
import { DEFAULT_PAYROLL_ANCHOR, anchorDate, biweeklyIndex, biweeklyRange } from "@/lib/erp/payPeriods";

type PayrollRow = {
  isContractor: boolean;
  employeeId: string | null;
  name: string;
  payType: string;
  /** Average straight-time rate when the person has logs at more than one
   * rate (mixedRates). Gross pay is computed per log on the server. */
  hourlyRateCents: number;
  mixedRates?: boolean;
  /** Hours logged at $0 for someone paid hourly: almost always a rate that
   * was never filled in, so the gross below is short by those hours. */
  missingRateHours?: number;
  totalHours: number;
  regHours: number;
  otHours: number;
  grossPayCents: number;
  projects: string;
  /** Has janitorial shift hours this period (links to Janitorial > Hours). */
  hasJanitorialHours?: boolean;
  /** Janitorial Contract employee with no shifts on the janitorial schedule this period. */
  noJanitorialSchedule?: boolean;
  commissionCents: number;
  commissionBreakdown: { label: string; amountCents: number }[];
  /** Hours added by hand (work not on a project), so they can be removed. */
  manualEntries?: { id: string; date: string; hours: number; note: string | null; batchId?: string | null }[];
};

const manualInputCls = "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";

type PayFilter = "all" | "hourly" | "salary" | "janitorial" | "contractor";

type PayrollChange = {
  name: string;
  savedGrossCents: number | null;
  liveGrossCents: number | null;
  savedHours: number | null;
  liveHours: number | null;
};

type PayrollResponse = {
  periodStart: string;
  periodEnd: string;
  rows: PayrollRow[];
  /** Set once the period is closed: rows are then what was saved when it was paid. */
  closed: { closedAt: string; closedBy: string | null; totalGrossCents: number } | null;
  /** What the records say now vs. what was saved, for a closed period. */
  changes: PayrollChange[];
};

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
    "Commission",
    "Total",
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
    escape((r.commissionCents / 100).toFixed(2)),
    escape(((r.grossPayCents + r.commissionCents) / 100).toFixed(2)),
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

/** Manual hours as listed on a row: one line per day, or one per date range entered together. */
type ManualGroup = { id: string; batchId: string | null; label: string; hours: number; days: number; note: string | null };

function shortDay(iso: string): string {
  return new Date(`${iso}T00:00:00.000Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function groupManualEntries(entries: NonNullable<PayrollRow["manualEntries"]>): ManualGroup[] {
  const groups = new Map<string, { batchId: string | null; dates: string[]; hours: number; note: string | null; id: string }>();
  for (const e of entries) {
    const key = e.batchId ?? `day:${e.id}`;
    const g = groups.get(key) ?? { batchId: e.batchId ?? null, dates: [], hours: 0, note: e.note, id: e.id };
    g.dates.push(e.date);
    g.hours += e.hours;
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => {
    const dates = g.dates.sort();
    const label = dates.length > 1 ? `${shortDay(dates[0])} to ${shortDay(dates[dates.length - 1])}` : shortDay(dates[0]);
    return { id: g.id, batchId: g.batchId, label, hours: Math.round(g.hours * 100) / 100, days: dates.length, note: g.note };
  });
}

export function PayrollView({ canReopen = false, employees = [] }: { canReopen?: boolean; employees?: EmployeeOption[] }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [reloadKey, setReloadKey] = useState(0);
  const [closing, setClosing] = useState(false);
  const [anchorISO, setAnchorISO] = useState(DEFAULT_PAYROLL_ANCHOR);
  const [anchorLoaded, setAnchorLoaded] = useState(false);

  const [periodIndex, setPeriodIndex] = useState(0);
  const [data, setData] = useState<PayrollResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [payFilter, setPayFilter] = useState<PayFilter>("all");
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ mode: "day" as "day" | "range", employeeId: "", date: "", from: "", to: "", hours: "", note: "" });
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");

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
        setPeriodIndex(biweeklyIndex(new Date(), anchorDate(DEFAULT_PAYROLL_ANCHOR)));
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
  }, [periodIndex, anchorISO, anchorLoaded, reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

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

  async function closePeriod() {
    if (!data) return;
    const ok = await confirm({
      message: `Close ${formatDate(start)} to ${formatDate(end)} as paid? This saves each person's hours and pay exactly as shown. If labor logs change later, the saved numbers stay and the changes are listed here.`,
    });
    if (!ok) return;
    setClosing(true);
    try {
      const res = await fetch("/api/erp/payroll/close", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ start: data.periodStart, end: data.periodEnd }),
      });
      const result = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) { toast(result.error ?? "Could not close the period", "error"); return; }
      toast("Pay period closed.", "success");
      setReloadKey((k) => k + 1);
    } finally {
      setClosing(false);
    }
  }

  async function reopenPeriod() {
    if (!data) return;
    const ok = await confirm({ message: "Reopen this pay period? The saved numbers are dropped and it goes back to showing live numbers from the records." });
    if (!ok) return;
    const res = await fetch(`/api/erp/payroll/close?start=${data.periodStart}`, { method: "DELETE" });
    const result = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) { toast(result.error ?? "Could not reopen the period", "error"); return; }
    toast("Pay period reopened.", "success");
    setReloadKey((k) => k + 1);
  }

  const periodHasEnded = toISO(end) < toISO(new Date());

  function openAddHours() {
    // Default to today when it's in this period, otherwise the period's last day.
    const today = toISO(new Date());
    const date = today >= toISO(start) && today <= toISO(end) ? today : toISO(end);
    // A range starts as the whole pay period (e.g. 80 hours over these two weeks).
    setAddForm({ mode: "day", employeeId: "", date, from: toISO(start), to: toISO(end), hours: "", note: "" });
    setAddError("");
    setAddOpen(true);
  }

  async function saveManualHours() {
    setAdding(true);
    setAddError("");
    try {
      const res = await fetch("/api/erp/payroll/manual-hours", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          addForm.mode === "range"
            ? { employeeId: addForm.employeeId, from: addForm.from, to: addForm.to, hours: addForm.hours, note: addForm.note }
            : { employeeId: addForm.employeeId, date: addForm.date, hours: addForm.hours, note: addForm.note },
        ),
      });
      const result = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) { setAddError(result.error ?? "Could not add the hours"); return; }
      toast("Hours added.", "success");
      setAddOpen(false);
      setReloadKey((k) => k + 1);
    } finally {
      setAdding(false);
    }
  }

  async function removeManualHours(group: ManualGroup, name: string) {
    const ok = await confirm({
      message: group.batchId
        ? `Remove all ${fmtHours(group.hours)} manual hours for ${name} from ${group.label}? This removes every day of that range, including any in another pay period.`
        : `Remove ${fmtHours(group.hours)} manual hours for ${name} on ${group.label}?`,
    });
    if (!ok) return;
    const res = await fetch(`/api/erp/payroll/manual-hours?${group.batchId ? `batchId=${group.batchId}` : `id=${group.id}`}`, { method: "DELETE" });
    if (!res.ok) { toast("Could not remove the hours", "error"); return; }
    toast("Hours removed.", "success");
    setReloadKey((k) => k + 1);
  }

  const filteredRows = (data?.rows ?? []).filter((r) => {
    if (payFilter === "hourly") return !r.isContractor && r.payType !== "SALARY" && r.payType !== "JANITORIAL";
    if (payFilter === "salary") return !r.isContractor && r.payType === "SALARY";
    if (payFilter === "janitorial") return !r.isContractor && r.payType === "JANITORIAL";
    if (payFilter === "contractor") return r.isContractor;
    return true;
  }).filter((r) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return r.name.toLowerCase().includes(q);
  });

  function downloadCsv() {
    if (!data) return;
    const suffix =
      payFilter === "hourly" ? "-hourly"
      : payFilter === "salary" ? "-salary"
      : payFilter === "janitorial" ? "-janitorial"
      : payFilter === "contractor" ? "-contractors"
      : "";
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
  const totalCommission = filteredRows.reduce((s, r) => s + r.commissionCents, 0);
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
            {([["all", "All"], ["hourly", "Hourly"], ["salary", "Salary"], ["janitorial", "Janitorial Contract"], ["contractor", "Contractors"]] as [PayFilter, string][]).map(([f, label]) => (
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
          <button
            type="button"
            onClick={openAddHours}
            className="ml-auto rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            title="Add hours for hourly work that isn't on a project"
          >
            + Add hours
          </button>
        </div>
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} size="md">
        <form
          className="space-y-4"
          onSubmit={(e) => { e.preventDefault(); saveManualHours(); }}
        >
          <div>
            <h2 className="text-base font-semibold text-gray-900">Add hours</h2>
            <p className="mt-1 text-xs text-gray-500">
              For hourly work that isn&apos;t on a project, like office or software work. Paid at the person&apos;s
              hourly rate that day and counted toward their 40 hour week with any other hours.
            </p>
          </div>
          <label className="block text-xs font-medium text-gray-600">
            Person
            <EmployeeCombobox employees={employees} value={addForm.employeeId} onChange={(id) => setAddForm((f) => ({ ...f, employeeId: id }))} />
          </label>
          <div className="inline-flex rounded-lg bg-gray-100 p-0.5 text-xs font-medium">
            {([["day", "One day"], ["range", "Date range"]] as const).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setAddForm((f) => ({ ...f, mode }))}
                className={`rounded-md px-3 py-1 transition ${addForm.mode === mode ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {addForm.mode === "day" ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-medium text-gray-600">
                Date
                <input type="date" required min={toISO(start)} max={toISO(end)} value={addForm.date}
                  onChange={(e) => setAddForm((f) => ({ ...f, date: e.target.value }))} className={manualInputCls} />
              </label>
              <label className="block text-xs font-medium text-gray-600">
                Hours
                <input type="number" required min="0.25" max="24" step="0.25" value={addForm.hours}
                  onChange={(e) => setAddForm((f) => ({ ...f, hours: e.target.value }))} className={manualInputCls} />
              </label>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-medium text-gray-600">
                  From
                  <input type="date" required min={toISO(start)} max={toISO(end)} value={addForm.from}
                    onChange={(e) => setAddForm((f) => ({ ...f, from: e.target.value }))} className={manualInputCls} />
                </label>
                <label className="block text-xs font-medium text-gray-600">
                  To
                  <input type="date" required min={addForm.from || toISO(start)} max={toISO(end)} value={addForm.to}
                    onChange={(e) => setAddForm((f) => ({ ...f, to: e.target.value }))} className={manualInputCls} />
                </label>
              </div>
              <label className="block text-xs font-medium text-gray-600">
                Total hours
                <input type="number" required min="0.25" step="0.25" value={addForm.hours}
                  onChange={(e) => setAddForm((f) => ({ ...f, hours: e.target.value }))} className={manualInputCls} />
              </label>
              {(() => {
                const validRange = !!addForm.from && !!addForm.to && addForm.to >= addForm.from;
                const days = validRange ? splitHoursOverWorkingDays(addForm.from, addForm.to, 1).length : 0;
                const split = validRange ? splitHoursOverWorkingDays(addForm.from, addForm.to, Number(addForm.hours)) : [];
                if (days === 0) return <p className="text-xs text-red-600">No working days (Monday to Friday) in that range.</p>;
                if (split.length === 0) return <p className="text-xs text-gray-500">Split across {days} working day{days === 1 ? "" : "s"} (Monday to Friday).</p>;
                const first = split[0].hours;
                const last = split[split.length - 1].hours;
                return (
                  <p className="text-xs text-gray-600">
                    {split.length} working day{split.length === 1 ? "" : "s"} (Monday to Friday),{" "}
                    <strong>{fmtHours(first)} hrs a day</strong>
                    {last !== first ? ` (${fmtHours(last)} on the last day so it adds up)` : ""}.
                  </p>
                );
              })()}
            </div>
          )}
          <label className="block text-xs font-medium text-gray-600">
            Note <span className="font-normal text-gray-400">(optional)</span>
            <input
              type="text"
              placeholder="e.g. Software work"
              value={addForm.note}
              onChange={(e) => setAddForm((f) => ({ ...f, note: e.target.value }))}
              className={manualInputCls}
            />
          </label>
          {addError && <p className="text-xs text-red-600">{addError}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAddOpen(false)} className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100">
              Cancel
            </button>
            <button
              type="submit"
              disabled={adding || !addForm.employeeId}
              className="rounded-md bg-pink-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-pink-700 disabled:opacity-50"
            >
              {adding ? "Adding..." : "Add hours"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Closed (paid) period: saved numbers, plus anything changed since */}
      {data && !loading && (data.closed ? (
        <div className={`rounded-lg border px-4 py-3 text-sm ${data.changes.length ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-gray-800">
              <span className="font-semibold">Closed</span> on {new Date(data.closed.closedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              {data.closed.closedBy ? ` by ${data.closed.closedBy}` : ""}. Showing what was paid.
            </p>
            {canReopen && (
              <button type="button" onClick={reopenPeriod} className="text-xs font-medium text-gray-600 hover:text-gray-900 hover:underline">
                Reopen period
              </button>
            )}
          </div>
          {data.changes.length > 0 && (
            <div className="mt-2">
              <p className="font-medium text-amber-800">
                {data.changes.length} {data.changes.length === 1 ? "person's" : "people's"} records changed after this was closed:
              </p>
              <ul className="mt-1 space-y-0.5 text-amber-900">
                {data.changes.map((c) => (
                  <li key={c.name} className="tabular-nums">
                    {c.name}:{" "}
                    {c.savedGrossCents == null ? `not in the closed payroll, now ${fmt(c.liveGrossCents ?? 0)} (${fmtHours(c.liveHours ?? 0)} hrs)`
                      : c.liveGrossCents == null ? `paid ${fmt(c.savedGrossCents)}, no longer in the records`
                      : `paid ${fmt(c.savedGrossCents)} for ${fmtHours(c.savedHours ?? 0)} hrs, records now say ${fmt(c.liveGrossCents)} for ${fmtHours(c.liveHours ?? 0)} hrs`}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-amber-700">Pay any difference in the next period, or reopen and close this one again.</p>
            </div>
          )}
        </div>
      ) : periodHasEnded && data.rows.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm">
          <p className="text-gray-600">Once this period is paid, close it so these numbers are saved and can&apos;t change later.</p>
          <button
            type="button"
            onClick={closePeriod}
            disabled={closing}
            className="rounded-md bg-pink-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-pink-700 disabled:opacity-50"
          >
            {closing ? "Closing..." : "Close period as paid"}
          </button>
        </div>
      ) : null)}

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
                      {row.noJanitorialSchedule ? (
                        <Link href="/erp/schedule?calendar=janitorial" className="mt-0.5 block text-[11px] font-medium text-red-600 hover:underline">
                          No janitorial schedule set, no janitorial hours paid
                        </Link>
                      ) : null}
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
                      {row.hasJanitorialHours && row.employeeId ? (
                        <div>
                          <Link
                            href={`/erp/janitorial/hours?employee=${row.employeeId}&start=${toISO(start)}&end=${toISO(end)}`}
                            className="text-[11px] font-normal text-pink-600 hover:underline"
                          >
                            See janitorial shifts
                          </Link>
                        </div>
                      ) : null}
                      {row.manualEntries?.length ? (
                        <details className="text-left">
                          <summary className="cursor-pointer text-right text-[11px] font-normal text-pink-600 hover:underline">
                            {fmtHours(row.manualEntries.reduce((s, e) => s + e.hours, 0))} manual hrs
                          </summary>
                          <ul className="mt-1 space-y-0.5 text-[11px] font-normal text-gray-500">
                            {groupManualEntries(row.manualEntries).map((g) => (
                              <li key={g.batchId ?? g.id} className="flex items-center justify-end gap-2">
                                <span className="truncate">{g.label}{g.note ? `, ${g.note}` : ""}</span>
                                <span className="tabular-nums">{fmtHours(g.hours)}h{g.days > 1 ? ` over ${g.days} days` : ""}</span>
                                <button type="button" onClick={() => removeManualHours(g, row.name)} className="text-gray-400 hover:text-red-600" aria-label="Remove these hours">
                                  Remove
                                </button>
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                      {row.isContractor ? (
                        <span className="text-xs text-gray-400">Flat fee</span>
                      ) : (
                        <>
                          {`${fmt(row.hourlyRateCents)}/hr`}
                          {row.mixedRates ? <div className="text-[10px] text-gray-400">avg, rates vary by job</div> : null}
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">
                      {fmt(row.grossPayCents)}
                      {row.missingRateHours ? (
                        <div className="text-[10px] font-medium text-red-600">
                          {fmtHours(Math.round(row.missingRateHours * 100) / 100)} hrs logged with no rate, not included
                        </div>
                      ) : null}
                      {row.commissionCents > 0 ? (
                        <>
                          {" + "}
                          {fmt(row.commissionCents)} commission
                          <details className="mt-0.5 text-left">
                            <summary className="cursor-pointer text-[10px] font-medium text-blue-600 hover:underline">
                              breakdown
                            </summary>
                            <ul className="mt-1 space-y-0.5 text-[10px] font-normal text-gray-500">
                              {row.commissionBreakdown.map((b, idx) => (
                                <li key={idx} className="flex justify-between gap-2">
                                  <span className="truncate">{b.label}</span>
                                  <span className="tabular-nums">{fmt(b.amountCents)}</span>
                                </li>
                              ))}
                            </ul>
                          </details>
                        </>
                      ) : null}
                    </td>
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
                  <td className="px-4 py-3 text-right tabular-nums">
                    {fmt(totalGross)}
                    {totalCommission > 0 ? ` + ${fmt(totalCommission)} commission` : ""}
                  </td>
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
