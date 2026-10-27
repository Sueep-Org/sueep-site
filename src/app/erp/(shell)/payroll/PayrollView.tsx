"use client";

import { Fragment, useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Button, InfoTip, Modal, useConfirm, useToast } from "@/app/erp/components/ui";
import { EmployeeCombobox, type EmployeeOption } from "@/app/erp/components/EmployeeCombobox";
import { splitHoursOverWorkingDays } from "@/lib/erp/manualHours";
import { DEFAULT_PAYROLL_ANCHOR, anchorDate, biweeklyIndex, biweeklyRange } from "@/lib/erp/payPeriods";
import type { EmployerTax } from "@/lib/erp/employerTax";
import { EmployerTaxRatesModal } from "./EmployerTaxRatesModal";
import { HealthInsuranceModal } from "./HealthInsuranceModal";

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
  /** Salary taken off for approved unpaid time off (already out of grossPayCents) */
  unpaidTimeOffCents?: number;
  unpaidTimeOffDays?: number;
  projects: string;
  /** Has janitorial shift hours this period (links to Janitorial > Hours). */
  hasJanitorialHours?: boolean;
  /** Janitorial Contract employee with no shifts on the janitorial schedule this period. */
  noJanitorialSchedule?: boolean;
  commissionCents: number;
  commissionBreakdown: { label: string; amountCents: number }[];
  /** Company's share of payroll taxes on this pay. Null for contractors and anyone not on ADP. */
  employerTax?: EmployerTax | null;
  /** Sueep's share of their health insurance for this period (0 when not on the plan). */
  healthCents?: number;
  /** Contractors: the contractor and each pay line that makes up their total. */
  contractorId?: string;
  contractorLines?: ContractorLine[];
  /** Hours added by hand (work not on a project), so they can be removed. */
  manualEntries?: { id: string; date: string; hours: number; note: string | null; batchId?: string | null; repeatId?: string | null; repeatEveryDays?: number | null }[];
};

type ContractorLine = {
  id: string;
  date: string | null;
  projectId: string | null;
  title: string;
  role: string | null;
  amountCents: number;
  fromSchedule: boolean;
};

/** Pay lines for the same job, day and role: usually entered twice by mistake. */
function duplicateLineIds(lines: ContractorLine[]): Set<string> {
  const seen = new Map<string, string[]>();
  for (const l of lines) {
    const key = `${l.projectId}|${l.date}|${(l.role ?? "").trim().toLowerCase()}`;
    seen.set(key, [...(seen.get(key) ?? []), l.id]);
  }
  return new Set([...seen.values()].filter((ids) => ids.length > 1).flat());
}

/** Short problems shown under a person's name, worst first. */
function rowWarnings(row: PayrollRow): { text: string; tone: "red" | "amber"; href?: string }[] {
  const out: { text: string; tone: "red" | "amber"; href?: string }[] = [];
  if (row.missingRateHours) out.push({ text: `${fmtHours(Math.round(row.missingRateHours * 100) / 100)} hrs with no rate, not paid`, tone: "red" });
  if (row.noJanitorialSchedule) out.push({ text: "No janitorial schedule, no janitorial hours paid", tone: "red", href: "/erp/schedule?calendar=janitorial" });
  const dupes = row.contractorLines ? duplicateLineIds(row.contractorLines).size : 0;
  if (dupes) out.push({ text: `${dupes} pay lines look doubled`, tone: "amber" });
  return out;
}

const manualInputCls = "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";

type PayFilter = "all" | "hourly" | "salary" | "janitorial" | "contractor";

type PayrollResponse = {
  periodStart: string;
  periodEnd: string;
  rows: PayrollRow[];
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
    "Employer Tax",
    "Health (Company Share)",
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
    escape(((r.employerTax?.totalCents ?? 0) / 100).toFixed(2)),
    escape(((r.healthCents ?? 0) / 100).toFixed(2)),
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
  onOpenTaxRates,
  onOpenHealth,
}: {
  anchorISO: string;
  onSaveAnchor: (iso: string) => Promise<string | null>;
  onDownloadCsv: () => void;
  downloadDisabled: boolean;
  onOpenTaxRates: () => void;
  onOpenHealth: () => void;
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
              onClick={() => { onOpenTaxRates(); setOpen(false); }}
              className="mb-2 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Employer tax rates
            </button>
            <button
              type="button"
              onClick={() => { onOpenHealth(); setOpen(false); }}
              className="mb-2 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Health insurance
            </button>
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
type ManualGroup = {
  id: string; batchId: string | null; label: string; firstDate: string; hours: number; days: number; note: string | null;
  repeatId: string | null; repeatEveryDays: number | null;
};

const REPEAT_OPTIONS = [[0, "Doesn't repeat"], [7, "Every week"], [14, "Every 2 weeks"]] as const;

function repeatLabel(everyDays: number | null): string {
  return everyDays === 7 ? "repeats weekly" : everyDays === 14 ? "repeats every 2 weeks" : "";
}

function shortDay(iso: string): string {
  return new Date(`${iso}T00:00:00.000Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function groupManualEntries(entries: NonNullable<PayrollRow["manualEntries"]>): ManualGroup[] {
  const groups = new Map<string, { batchId: string | null; dates: string[]; hours: number; note: string | null; id: string; repeatId: string | null; repeatEveryDays: number | null }>();
  for (const e of entries) {
    const key = e.batchId ?? `day:${e.id}`;
    const g = groups.get(key) ?? { batchId: e.batchId ?? null, dates: [], hours: 0, note: e.note, id: e.id, repeatId: e.repeatId ?? null, repeatEveryDays: e.repeatEveryDays ?? null };
    g.dates.push(e.date);
    g.hours += e.hours;
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => {
    const dates = g.dates.sort();
    const label = dates.length > 1 ? `${shortDay(dates[0])} to ${shortDay(dates[dates.length - 1])}` : shortDay(dates[0]);
    return {
      id: g.id, batchId: g.batchId, label, firstDate: dates[0], hours: Math.round(g.hours * 100) / 100, days: dates.length, note: g.note,
      repeatId: g.repeatId, repeatEveryDays: g.repeatEveryDays,
    };
  });
}

export function PayrollView({ employees = [] }: { employees?: EmployeeOption[] }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [reloadKey, setReloadKey] = useState(0);
  const [anchorISO, setAnchorISO] = useState(DEFAULT_PAYROLL_ANCHOR);
  const [anchorLoaded, setAnchorLoaded] = useState(false);

  const [periodIndex, setPeriodIndex] = useState(0);
  const [data, setData] = useState<PayrollResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [payFilter, setPayFilter] = useState<PayFilter>("all");
  const [search, setSearch] = useState("");
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());
  function toggleRow(key: string) {
    setOpenRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ mode: "day" as "day" | "range", employeeId: "", date: "", from: "", to: "", hours: "", note: "", repeat: 0 as number });
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [editing, setEditing] = useState<{ group: ManualGroup; name: string; hours: string; note: string; date: string; later: boolean } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");
  const [removingRepeat, setRemovingRepeat] = useState<{ group: ManualGroup; name: string } | null>(null);
  const [taxRatesOpen, setTaxRatesOpen] = useState(false);
  const [healthOpen, setHealthOpen] = useState(false);

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

  function openAddHours() {
    // Default to today when it's in this period, otherwise the period's last day.
    const today = toISO(new Date());
    const date = today >= toISO(start) && today <= toISO(end) ? today : toISO(end);
    // A range starts as the whole pay period (e.g. 80 hours over these two weeks).
    setAddForm({ mode: "day", employeeId: "", date, from: toISO(start), to: toISO(end), hours: "", note: "", repeat: 0 });
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
            ? { employeeId: addForm.employeeId, from: addForm.from, to: addForm.to, hours: addForm.hours, note: addForm.note, repeatEvery: addForm.repeat }
            : { employeeId: addForm.employeeId, date: addForm.date, hours: addForm.hours, note: addForm.note, repeatEvery: addForm.repeat },
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

  function openEdit(group: ManualGroup, name: string) {
    setEditing({ group, name, hours: String(group.hours), note: group.note ?? "", date: group.firstDate, later: false });
    setEditError("");
  }

  async function saveEdit() {
    if (!editing) return;
    const { group } = editing;
    setSavingEdit(true);
    setEditError("");
    try {
      const res = await fetch("/api/erp/payroll/manual-hours", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(group.batchId ? { batchId: group.batchId } : { id: group.id, date: editing.date }),
          hours: editing.hours,
          note: editing.note,
          later: editing.later,
        }),
      });
      const result = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) { setEditError(result.error ?? "Could not save the hours"); return; }
      toast("Hours updated.", "success");
      setEditing(null);
      setReloadKey((k) => k + 1);
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteManualHours(group: ManualGroup, later: boolean) {
    const query = group.batchId ? `batchId=${encodeURIComponent(group.batchId)}` : `id=${group.id}`;
    const res = await fetch(`/api/erp/payroll/manual-hours?${query}${later ? "&later=1" : ""}`, { method: "DELETE" });
    if (!res.ok) { toast("Could not remove the hours", "error"); return; }
    toast(later ? "Hours removed and repeat stopped." : "Hours removed.", "success");
    setRemovingRepeat(null);
    setReloadKey((k) => k + 1);
  }

  async function removeManualHours(group: ManualGroup, name: string) {
    if (group.repeatId) {
      setRemovingRepeat({ group, name });
      return;
    }
    const ok = await confirm({
      message: group.batchId
        ? `Remove all ${fmtHours(group.hours)} manual hours for ${name} from ${group.label}? This removes every day of that range, including any in another pay period.`
        : `Remove ${fmtHours(group.hours)} manual hours for ${name} on ${group.label}?`,
    });
    if (!ok) return;
    await deleteManualHours(group, false);
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
  const attentionCount = filteredRows.filter((r) => rowWarnings(r).length > 0).length;
  const shownRows = attentionOnly && attentionCount > 0 ? filteredRows.filter((r) => rowWarnings(r).length > 0) : filteredRows;

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
  const totalEmployerTax = filteredRows.reduce((s, r) => s + (r.employerTax?.totalCents ?? 0), 0);
  const totalHealth = filteredRows.reduce((s, r) => s + (r.healthCents ?? 0), 0);

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
            onOpenTaxRates={() => setTaxRatesOpen(true)}
            onOpenHealth={() => setHealthOpen(true)}
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
          <div>
            <p className="text-xs font-medium text-gray-600">Repeat</p>
            <div className="mt-1 inline-flex rounded-lg bg-gray-100 p-0.5 text-xs font-medium">
              {REPEAT_OPTIONS.map(([every, label]) => (
                <button
                  key={every}
                  type="button"
                  onClick={() => setAddForm((f) => ({ ...f, repeat: every }))}
                  className={`rounded-md px-3 py-1 transition ${addForm.repeat === every ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
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
            <Button size="sm" type="submit"
              disabled={adding || !addForm.employeeId}>
              {adding ? "Adding..." : "Add hours"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} size="md">
        {editing && (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); saveEdit(); }}>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Edit hours</h2>
              <p className="mt-1 text-xs text-gray-500">
                {editing.name}, {editing.group.label}
                {editing.group.repeatId ? `, ${repeatLabel(editing.group.repeatEveryDays)}` : ""}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {editing.group.batchId ? null : (
                <label className="block text-xs font-medium text-gray-600">
                  Date
                  <input type="date" required value={editing.date}
                    onChange={(e) => setEditing((f) => f && { ...f, date: e.target.value })} className={manualInputCls} />
                </label>
              )}
              <label className="block text-xs font-medium text-gray-600">
                {editing.group.batchId ? `Total hours (${editing.group.days} days)` : "Hours"}
                <input type="number" required min="0.25" step="0.25" value={editing.hours}
                  onChange={(e) => setEditing((f) => f && { ...f, hours: e.target.value })} className={manualInputCls} />
              </label>
            </div>
            <label className="block text-xs font-medium text-gray-600">
              Note <span className="font-normal text-gray-400">(optional)</span>
              <input type="text" value={editing.note}
                onChange={(e) => setEditing((f) => f && { ...f, note: e.target.value })} className={manualInputCls} />
            </label>
            {editing.group.repeatId ? (
              <label className="flex items-center gap-2 text-xs text-gray-700">
                <input type="checkbox" checked={editing.later}
                  onChange={(e) => setEditing((f) => f && { ...f, later: e.target.checked })} />
                Also change the hours and note on every later repeat
              </label>
            ) : null}
            {editError && <p className="text-xs text-red-600">{editError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100">
                Cancel
              </button>
              <Button size="sm" type="submit" disabled={savingEdit}>
                {savingEdit ? "Saving..." : "Save"}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!removingRepeat} onClose={() => setRemovingRepeat(null)} size="sm">
        {removingRepeat && (
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Remove repeating hours</h2>
              <p className="mt-1 text-sm text-gray-600">
                {fmtHours(removingRepeat.group.hours)} manual hours for {removingRepeat.name} on {removingRepeat.group.label}{" "}
                {repeatLabel(removingRepeat.group.repeatEveryDays)}.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <button type="button" onClick={() => deleteManualHours(removingRepeat.group, false)}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Remove just this one
              </button>
              <button type="button" onClick={() => deleteManualHours(removingRepeat.group, true)}
                className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700">
                Remove this and all later ones, stop repeating
              </button>
              <button type="button" onClick={() => setRemovingRepeat(null)} className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100">
                Cancel
              </button>
            </div>
          </div>
        )}
      </Modal>

      <EmployerTaxRatesModal open={taxRatesOpen} onClose={() => setTaxRatesOpen(false)} onSaved={() => setReloadKey((k) => k + 1)} />
      <HealthInsuranceModal open={healthOpen} onClose={() => setHealthOpen(false)} onSaved={() => setReloadKey((k) => k + 1)} employees={employees} />

      {/* Table */}
      <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3 text-right">Hours</th>
                <th className="px-4 py-3 text-right">Rate</th>
                <th className="px-4 py-3 text-right">Gross pay</th>
                <th className="px-4 py-3 text-right">
                  <span className="inline-flex items-center gap-1">
                    Employer cost
                    <InfoTip text="Employer payroll tax plus the company's share of health insurance. Hover a number for the split." />
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">Loading…</td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-red-500">{error}</td>
                </tr>
              ) : shownRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">No pay for this period{search || payFilter !== "all" || attentionOnly ? " matches these filters" : ""}.</td>
                </tr>
              ) : (
                shownRows.map((row) => {
                  const key = `${row.isContractor ? "c" : "e"}-${row.employeeId ?? row.contractorId ?? row.name}`;
                  const open = openRows.has(key);
                  const warnings = rowWarnings(row);
                  const companyCents = (row.employerTax?.totalCents ?? 0) + (row.healthCents ?? 0);
                  const profileHref = row.employeeId ? `/erp/employees/${row.employeeId}` : row.contractorId ? `/erp/contractors/${row.contractorId}` : null;
                  return (
                    <Fragment key={key}>
                      <tr className={`border-b border-gray-100 ${open ? "bg-gray-50" : "hover:bg-gray-50"}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-start gap-2">
                            <button
                              type="button"
                              onClick={() => toggleRow(key)}
                              className="mt-0.5 text-gray-400 hover:text-gray-700"
                              aria-label={open ? "Hide details" : "Show details"}
                              aria-expanded={open}
                            >
                              <svg viewBox="0 0 20 20" fill="currentColor" className={`h-4 w-4 transition-transform ${open ? "rotate-90" : ""}`}>
                                <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                              </svg>
                            </button>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                {profileHref ? (
                                  <Link href={profileHref} className="font-medium text-gray-900 hover:text-pink-600 hover:underline">{row.name}</Link>
                                ) : (
                                  <span className="font-medium text-gray-500">{row.name}</span>
                                )}
                                {row.isContractor && <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">Contractor</span>}
                              </div>
                              {warnings.map((w) =>
                                w.href ? (
                                  <Link key={w.text} href={w.href} className={`block text-[11px] font-medium hover:underline ${w.tone === "red" ? "text-red-600" : "text-amber-700"}`}>{w.text}</Link>
                                ) : (
                                  <p key={w.text} className={`text-[11px] font-medium ${w.tone === "red" ? "text-red-600" : "text-amber-700"}`}>{w.text}</p>
                                ),
                              )}
                            </div>
                          </div>
                        </td>
                        {row.isContractor ? (
                          <td colSpan={2} className="px-4 py-3 text-right text-xs text-gray-400">
                            Flat pay, {row.contractorLines?.length ?? 0} line{row.contractorLines?.length === 1 ? "" : "s"}
                          </td>
                        ) : (
                          <>
                            <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                              {fmtHours(row.totalHours)}
                              {row.otHours > 0 && <div className="text-[11px] text-amber-600">incl. {fmtHours(row.otHours)} OT</div>}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                              {row.payType === "SALARY" ? <span className="text-xs text-gray-400">Salary</span> : `${fmt(row.hourlyRateCents)}/hr`}
                              {row.mixedRates && <div className="text-[10px] text-gray-400">average</div>}
                            </td>
                          </>
                        )}
                        <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">
                          {fmt(row.grossPayCents + row.commissionCents)}
                          {row.commissionCents > 0 && <div className="text-[11px] font-normal text-gray-500">incl. {fmt(row.commissionCents)} commission</div>}
                          {row.unpaidTimeOffCents ? (
                            <div className="text-[11px] font-normal text-amber-700">{fmt(row.unpaidTimeOffCents)} off, unpaid time off</div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                          {companyCents > 0 ? (
                            <span
                              className="cursor-help"
                              title={[
                                row.employerTax ? `Tax ${fmt(row.employerTax.totalCents)} (Social Security ${fmt(row.employerTax.socialSecurityCents)}, Medicare ${fmt(row.employerTax.medicareCents)}, FUTA ${fmt(row.employerTax.futaCents)}, PA SUI ${fmt(row.employerTax.paSuiCents)})` : null,
                                row.healthCents ? `Health ${fmt(row.healthCents)}` : null,
                              ].filter(Boolean).join("\n")}
                            >
                              {fmt(companyCents)}
                            </span>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                      </tr>
                      {open && (
                        <tr className="border-b border-gray-200 bg-gray-50">
                          <td colSpan={5} className="px-4 pb-4 pt-1">
                            <PayrollRowDetails row={row} start={start} end={end} onEditManual={openEdit} onRemoveManual={removeManualHours} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
            {shownRows.length > 0 && (
              <tfoot className="border-t border-gray-300 bg-gray-50 text-xs font-semibold text-gray-700">
                <tr>
                  <td className="px-4 py-3">Totals</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {fmtHours(shownRows.reduce((s, r) => s + r.totalHours, 0))}
                    {shownRows.some((r) => r.otHours > 0) && (
                      <div className="text-[11px] font-normal text-amber-600">incl. {fmtHours(shownRows.reduce((s, r) => s + r.otHours, 0))} OT</div>
                    )}
                  </td>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(shownRows.reduce((s, r) => s + r.grossPayCents + r.commissionCents, 0))}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(shownRows.reduce((s, r) => s + (r.employerTax?.totalCents ?? 0) + (r.healthCents ?? 0), 0))}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      {/* Summary */}
      {data && filteredRows.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "People paid", value: String(filteredRows.length) },
            { label: "Gross pay", value: fmt(totalGross + totalCommission), hint: totalCommission > 0 ? `Includes ${fmt(totalCommission)} commission` : undefined },
            { label: "Company cost", value: fmt(totalGross + totalCommission + totalEmployerTax + totalHealth), hint: "Gross pay plus employer tax and health insurance" },
          ].map((t) => (
            <div key={t.label} className="rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
              <p className="flex items-center gap-1 text-xs text-gray-500">
                {t.label}
                {t.hint && <InfoTip text={t.hint} />}
              </p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums text-gray-900">{t.value}</p>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setAttentionOnly((v) => !v)}
            disabled={attentionCount === 0}
            className={`rounded-lg border px-4 py-3 text-left shadow-sm ${attentionOnly ? "border-amber-400 bg-amber-50" : "border-gray-200 bg-white"} ${attentionCount === 0 ? "cursor-default" : "hover:border-amber-300"}`}
          >
            <p className="text-xs text-gray-500">Needs a look</p>
            <p className={`mt-0.5 text-lg font-semibold tabular-nums ${attentionCount ? "text-amber-700" : "text-gray-900"}`}>{attentionCount}</p>
            {attentionCount > 0 && <p className="text-[11px] text-gray-400">{attentionOnly ? "Showing only these, click to show all" : "Click to show only these"}</p>}
          </button>
        </div>
      )}
    </div>
  );
}

/** The expanded part of a payroll row: what the pay is made of, with links to where it came from. */
function PayrollRowDetails({
  row,
  start,
  end,
  onEditManual,
  onRemoveManual,
}: {
  row: PayrollRow;
  start: Date;
  end: Date;
  onEditManual: (g: ManualGroup, name: string) => void;
  onRemoveManual: (g: ManualGroup, name: string) => void;
}) {
  const head = "text-[11px] font-semibold uppercase tracking-wide text-gray-400";
  if (row.isContractor) {
    const dupes = duplicateLineIds(row.contractorLines ?? []);
    return (
      <div className="ml-6 space-y-1.5">
        <p className={head}>Pay lines</p>
        <table className="w-full text-xs">
          <tbody>
            {(row.contractorLines ?? []).map((l) => (
              <tr key={l.id} className={dupes.has(l.id) ? "bg-amber-50" : ""}>
                <td className="w-24 py-1 pr-3 tabular-nums text-gray-500">{l.date ? formatDate(new Date(`${l.date}T00:00:00Z`)) : "-"}</td>
                <td className="py-1 pr-3">
                  {l.projectId ? (
                    <Link href={`/erp/projects/${l.projectId}?tab=Labor`} className="text-gray-800 hover:text-pink-600 hover:underline">{l.title}</Link>
                  ) : (
                    <span className="text-gray-800">{l.title}</span>
                  )}
                  {l.fromSchedule && <span className="ml-1.5 rounded bg-gray-100 px-1 py-0.5 text-[10px] text-gray-500">from calendar</span>}
                  {dupes.has(l.id) && <span className="ml-1.5 text-[10px] font-medium text-amber-700">same job, day and role as another line</span>}
                </td>
                <td className="py-1 pr-3 text-gray-500">{l.role ?? ""}</td>
                <td className="py-1 text-right tabular-nums text-gray-800">{fmt(l.amountCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  const projects = row.projects ? row.projects.split(", ").filter(Boolean) : [];
  return (
    <div className="ml-6 grid gap-4 text-xs sm:grid-cols-2 lg:grid-cols-3">
      {projects.length > 0 && (
        <div>
          <p className={head}>Projects</p>
          <ul className="mt-1 space-y-0.5 text-gray-700">
            {projects.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </div>
      )}
      {(row.hasJanitorialHours || row.manualEntries?.length) ? (
        <div>
          <p className={head}>Hours from</p>
          {row.hasJanitorialHours && row.employeeId ? (
            <Link href={`/erp/janitorial/hours?employee=${row.employeeId}&start=${toISO(start)}&end=${toISO(end)}`} className="mt-1 block text-pink-600 hover:underline">
              Janitorial shifts
            </Link>
          ) : null}
          {row.manualEntries?.length ? (
            <ul className="mt-1 space-y-0.5 text-gray-600">
              {groupManualEntries(row.manualEntries).map((g) => (
                <li key={g.batchId ?? g.id} className="flex items-center gap-2">
                  <span className="truncate">Added by hand: {g.label}{g.note ? `, ${g.note}` : ""}</span>
                  {g.repeatId ? <span className="text-gray-400" title={repeatLabel(g.repeatEveryDays)} aria-label={repeatLabel(g.repeatEveryDays)}>&#x21bb;</span> : null}
                  <span className="tabular-nums">{fmtHours(g.hours)}h{g.days > 1 ? ` over ${g.days} days` : ""}</span>
                  <button type="button" onClick={() => onEditManual(g, row.name)} className="text-gray-400 hover:text-pink-600">Edit</button>
                  <button type="button" onClick={() => onRemoveManual(g, row.name)} className="text-gray-400 hover:text-red-600">Remove</button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {row.commissionCents > 0 && (
        <div>
          <p className={head}>Commission</p>
          <ul className="mt-1 space-y-0.5 text-gray-600">
            {row.commissionBreakdown.map((b, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span className="truncate">{b.label}</span>
                <span className="tabular-nums">{fmt(b.amountCents)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {projects.length === 0 && !row.hasJanitorialHours && !row.manualEntries?.length && row.commissionCents === 0 && (
        <p className="text-gray-400">{row.payType === "SALARY" ? "Salary for the period." : "No more detail for this period."}</p>
      )}
    </div>
  );
}
