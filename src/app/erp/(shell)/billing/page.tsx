"use client";

import { createContext, useContext, useState, useEffect, useRef, useId } from "react";
import Link from "next/link";
import { formatUnitDisplay } from "@/lib/erp/unitDisplay";
import { UnitInvoiceChips, expectedBillingStatus, type UnitInvoiceChip } from "@/app/erp/components/UnitInvoiceChips";
import { InfoTip } from "@/app/erp/components/ui";
import { LienDeadlinePill, LienWarningIcon, lienDetailText } from "@/app/erp/components/LienDeadlinePill";
import type { LienWatchRow } from "@/lib/erp/lienWatch";
import { LIEN_STAGE_RANK, lienDecisionCloses } from "@/lib/erp/lienDeadline";
import { normalizeBillingStatus } from "@/lib/erp/billingStatus";

// ── Shared ────────────────────────────────────────────────────────────────────

type Tab = "post-construction" | "janitorial" | "recurring";

const BILLING_OPTIONS = [
  { value: "NOT_BILLED", label: "Not Billed" },
  { value: "BILLED",     label: "Billed" },
  { value: "PAID",       label: "Paid" },
] as const;

function billingBadgeCls(status: string): string {
  if (status === "PAID")   return "bg-emerald-100 text-emerald-700";
  if (status === "BILLED") return "bg-blue-100 text-blue-700";
  return "bg-gray-100 text-gray-500";
}

function fmt(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthStartISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

type StatusFilter = "ALL" | (typeof BILLING_OPTIONS)[number]["value"];

/** An open invoice that's past its due date, same test the invoice chip uses. */
function hasOverdueInvoice(invoices: UnitInvoiceChip[] | undefined): boolean {
  return (invoices ?? []).some((i) => i.status === "open" && !!i.dueDate && new Date(i.dueDate).getTime() < Date.now());
}

/** Search and date range, owned by the page and shared by every tab's toolbar. */
type BillingControls = {
  searchInput: string;
  setSearchInput: (v: string) => void;
  /** A search is active, so the date range is being ignored. */
  searching: string;
  start: string;
  setStart: (v: string) => void;
  end: string;
  setEnd: (v: string) => void;
  allTime: boolean;
  setAllTime: (v: boolean) => void;
  /** Dates are still this month through today, and All time is off. */
  datesDefault: boolean;
  resetDates: () => void;
};
const BillingControlsContext = createContext<BillingControls | null>(null);

const filterDateCls =
  "mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500 disabled:bg-gray-50 disabled:text-gray-400";

/**
 * Toolbar above a billing table: search, the filter button and whatever the
 * tab adds (the CSV button). The filter menu has the same look as the other
 * ERP filter menus (see CommissionByRep) and holds the date range, one
 * billing status at a time, and flags that can be combined (a row has to
 * match all of them). Status and flags only narrow what the date range or
 * search already loaded.
 */
function BillingFilters<F extends string>({
  status,
  onStatus,
  flagOptions = [],
  flags = [],
  onFlags,
  children,
}: {
  status: StatusFilter;
  onStatus: (s: StatusFilter) => void;
  flagOptions?: Array<{ value: F; label: string }>;
  flags?: F[];
  onFlags?: (next: F[]) => void;
  /** Sits after the filter button, e.g. the CSV button. */
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const radioName = useId();
  const c = useContext(BillingControlsContext)!;
  const filtersActive = status !== "ALL" || flags.length > 0 || !c.datesDefault;

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  return (
    <div className="space-y-1">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <input
        type="search"
        value={c.searchInput}
        onChange={(e) => c.setSearchInput(e.target.value)}
        placeholder="Search project, building, unit…"
        aria-label="Search billing"
        className="h-8 w-56 rounded-md border border-gray-300 bg-white px-2 text-xs text-gray-900 placeholder-gray-400 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
      />
      <div className="flex items-center gap-2">
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
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Dates</p>
            <div className={`mt-1.5 space-y-1.5 ${c.searching ? "opacity-40" : ""}`}>
              <label className="flex items-center gap-2 text-xs text-gray-700">
                <input
                  type="checkbox"
                  checked={c.allTime}
                  disabled={!!c.searching}
                  onChange={(e) => c.setAllTime(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-gray-300 text-pink-600 focus:ring-pink-400"
                />
                All time
              </label>
              <label className="block text-xs text-gray-700">
                From
                <input type="date" value={c.start} max={c.end} disabled={!!c.searching || c.allTime} onChange={(e) => c.setStart(e.target.value)} className={filterDateCls} />
              </label>
              <label className="block text-xs text-gray-700">
                To
                <input type="date" value={c.end} min={c.start} disabled={!!c.searching || c.allTime} onChange={(e) => c.setEnd(e.target.value)} className={filterDateCls} />
              </label>
            </div>

            <div className="my-3 border-t border-gray-100" />

            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Billing status</p>
            <div className="mt-1.5 space-y-1">
              {([{ value: "ALL", label: "All" }, ...BILLING_OPTIONS] as Array<{ value: StatusFilter; label: string }>).map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 text-xs text-gray-700">
                  <input
                    type="radio"
                    name={radioName}
                    checked={status === opt.value}
                    onChange={() => onStatus(opt.value)}
                    className="h-3.5 w-3.5 border-gray-300 text-pink-600 focus:ring-pink-400"
                  />
                  {opt.label}
                </label>
              ))}
            </div>

            {flagOptions.length > 0 ? (
              <>
                <div className="my-3 border-t border-gray-100" />
                <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                  Only show
                  <InfoTip align="right" text="Rows must match everything picked. Filters narrow the rows already loaded for the date range or search, and the totals and CSV follow them." />
                </p>
                <div className="mt-1.5 space-y-1">
                  {flagOptions.map((opt) => {
                    const active = flags.includes(opt.value);
                    return (
                      <label key={opt.value} className="flex items-center gap-2 text-xs text-gray-700">
                        <input
                          type="checkbox"
                          checked={active}
                          onChange={() => onFlags?.(active ? flags.filter((f) => f !== opt.value) : [...flags, opt.value])}
                          className="h-3.5 w-3.5 rounded border-gray-300 text-pink-600 focus:ring-pink-400"
                        />
                        {opt.label}
                      </label>
                    );
                  })}
                </div>
              </>
            ) : null}

            {filtersActive ? (
              <button
                type="button"
                onClick={() => { onStatus("ALL"); onFlags?.([]); c.resetDates(); }}
                className="mt-3 w-full rounded border border-gray-200 py-1 text-[11px] font-medium text-gray-500 hover:bg-gray-50"
              >
                Clear filters
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {children}
      </div>
    </div>
    {c.searching ? (
      <p className="text-xs text-gray-500">Searching across all dates for &quot;{c.searching}&quot;, the date range is ignored until you clear the search.</p>
    ) : null}
    </div>
  );
}

/** The range sent for "All time". The billing routes need a start and end,
 * so this is simply wider than any real data. */
const ALL_TIME_START = "2000-01-01";
const ALL_TIME_END = "2099-12-31";

/** Date part of a CSV file name. */
function rangeSlug(start: string, end: string): string {
  return start === ALL_TIME_START && end === ALL_TIME_END ? "all-time" : `${start}-to-${end}`;
}

/** A non-empty search bypasses the date range entirely (that's the point of
 * a search), the route drops its date filter and matches by name instead,
 * see the billing API routes. Empty search keeps the normal date-scoped URL. */
function billingUrl(base: string, start: string, end: string, search: string): string {
  const q = search.trim();
  return q ? `${base}?q=${encodeURIComponent(q)}` : `${base}?start=${start}&end=${end}`;
}

// ── Post-construction ─────────────────────────────────────────────────────────

type SOVItemRow = {
  id: string;
  description: string;
  scheduledValueCents: number;
  billingStatus: string;
  /** HubSpot invoices linked to this SOV item */
  invoices: UnitInvoiceChip[];
};

type CORow = {
  id: string;
  projectId: string;
  title: string;
  contractValueCents: number;
  billingStatus: string;
  completedAt: string;
  /** HubSpot invoices linked to this change order (post-construction only) */
  invoices?: UnitInvoiceChip[];
};

type PostConProjectRow = {
  projectId: string;
  jobTitle: string;
  projectBillingStatus: string | null;
  // Only meaningful when items/changeOrders are both empty — the
  // The project's flat contract, shown as its own line when it has no SOV
  // lines here (alone, or next to its change orders). Null otherwise.
  contractValueCents: number | null;
  items: SOVItemRow[];
  changeOrders: CORow[];
  /** Set when the project's current COI is expired or expiring */
  coiWarning: { label: string; expired: boolean; holderName: string } | null;
};

/** Pill next to a project name when its COI needs replacing before billing. */
function CoiWarningPill({ warning }: { warning: PostConProjectRow["coiWarning"] }) {
  if (!warning) return null;
  return (
    <span
      title={`${warning.holderName}. The GC may hold payment until they get a new one.`}
      className={`ml-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${warning.expired ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}
    >
      {warning.label}
    </span>
  );
}

type PostConResponse = {
  start: string;
  end: string;
  rows: PostConProjectRow[];
};

type Totals = { invoicedCents: number; paidCents: number };
/** Per-project HubSpot invoices from /api/erp/billing/post-construction/invoices. */
type PostConHubSpot =
  | { invoices: UnitInvoiceChip[]; hubspot: Totals; erp: Totals; mismatch: boolean; unlinkedCount: number }
  | { error: string };

/** Project-level HubSpot note shown on a project's first billing row: how
 * many of its invoices aren't linked to a line. */
function PostConProjectFlags({ hs, projectId }: { hs: PostConHubSpot | undefined | "loading"; projectId: string }) {
  if (hs === "loading" || !hs) return null;
  if ("error" in hs) return <span className="text-xs text-red-500" title={hs.error}>HubSpot error</span>;
  return (
    <>
      {hs.unlinkedCount > 0 && (
        <Link
          href={`/erp/projects/${projectId}?tab=${encodeURIComponent("Invoices & Quotes")}`}
          className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 hover:underline"
        >
          {hs.unlinkedCount} not linked
        </Link>
      )}
    </>
  );
}

function PostConInvoiceCell({ hs }: { hs: PostConHubSpot | undefined | "loading" }) {
  if (hs === "loading") return <span className="text-xs text-gray-400">Loading...</span>;
  if (!hs) return <span className="text-xs text-gray-400">No deal</span>;
  if ("error" in hs) return <span className="text-xs text-red-500" title={hs.error}>HubSpot error</span>;
  if (hs.invoices.length === 0) return <span className="text-xs text-gray-400">None</span>;
  return <UnitInvoiceChips invoices={hs.invoices} compact />;
}

function buildPostConCsv(rows: PostConProjectRow[], start: string, end: string, hsByProject: Record<string, PostConHubSpot> = {}): string {
  const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const headers = ["Project", "Item", "Type", "Value", "Billing Status", "HubSpot Invoices"].map(escape).join(",");
  const dataRows: string[] = [];
  for (const project of rows) {
    const hs = hsByProject[project.projectId];
    const invoiceNumbers = hs && !("error" in hs) ? hs.invoices.map((i) => i.invoiceNumber).filter(Boolean).join(" ") : "";
    for (const item of project.items) {
      dataRows.push([
        escape(project.jobTitle),
        escape(item.description),
        escape("SOV"),
        escape((item.scheduledValueCents / 100).toFixed(2)),
        escape(BILLING_OPTIONS.find((o) => o.value === item.billingStatus)?.label ?? item.billingStatus),
        escape((item.invoices ?? []).map((i) => i.invoiceNumber).filter(Boolean).join(" ")),
      ].join(","));
    }
    for (const co of (project.changeOrders ?? [])) {
      dataRows.push([
        escape(project.jobTitle),
        escape(`CO: ${co.title}`),
        escape("Change Order"),
        escape((co.contractValueCents / 100).toFixed(2)),
        escape(BILLING_OPTIONS.find((o) => o.value === co.billingStatus)?.label ?? co.billingStatus),
        escape((co.invoices ?? []).map((i) => i.invoiceNumber).filter(Boolean).join(" ")),
      ].join(","));
    }
    if (project.contractValueCents != null) {
      dataRows.push([
        escape(project.jobTitle),
        escape(""),
        escape("Project Total"),
        escape((project.contractValueCents / 100).toFixed(2)),
        escape(BILLING_OPTIONS.find((o) => o.value === project.projectBillingStatus)?.label ?? project.projectBillingStatus ?? "Not Billed"),
        // Invoices can't be linked to a flat contract, so the project's own
        // list only belongs here when this is its only line.
        escape((project.changeOrders ?? []).length === 0 ? invoiceNumbers : ""),
      ].join(","));
    }
  }
  const sovTotal = rows.flatMap((r) => r.items).reduce((s, i) => s + i.scheduledValueCents, 0);
  const coTotal = rows.flatMap((r) => r.changeOrders ?? []).reduce((s, c) => s + c.contractValueCents, 0);
  const wholeProjectTotal = rows.reduce((s, r) => s + (r.contractValueCents ?? 0), 0);
  dataRows.push([escape("TOTAL"), escape(""), escape(""), escape(((sovTotal + coTotal + wholeProjectTotal) / 100).toFixed(2)), escape(""), escape("")].join(","));
  void end;
  return [headers, ...dataRows].join("\r\n");
}

/** The job's lien status needs a look: an invoice is late or a step is due, and nobody closed it out. */
function lienNeedsLook(r: LienWatchRow | undefined): boolean {
  return !!r?.deadline && !!r.readiness && r.readiness.stage !== "NOT_DUE" && !lienDecisionCloses(r.decision?.value);
}

type PostConFlag = "OVERDUE" | "LIEN" | "COI" | "UNLINKED";
const POST_CON_FLAGS: Array<{ value: PostConFlag; label: string }> = [
  { value: "OVERDUE", label: "Overdue invoice" },
  { value: "LIEN", label: "Lien" },
  { value: "COI", label: "COI expiring" },
  { value: "UNLINKED", label: "Invoice not linked" },
];

/** Unpaid jobs where a lien is on the table (an invoice is late, or a step is due), whatever date range is showing. */
function LienWatchStrip({ rows }: { rows: LienWatchRow[] }) {
  const [showMissing, setShowMissing] = useState(false);
  const due = rows
    .filter(lienNeedsLook)
    .sort(
      (a, b) =>
        LIEN_STAGE_RANK[a.readiness!.stage] - LIEN_STAGE_RANK[b.readiness!.stage] || a.deadline!.daysLeft - b.deadline!.daysLeft,
    );
  // A job that's still open has no clock running yet, so it isn't missing anything.
  const missing = rows.filter((r) => (r.missing === "STATE" || r.missing === "NO_END_DATE") && !lienDecisionCloses(r.decision?.value));
  if (due.length === 0 && missing.length === 0) return null;
  return (
    <section className="rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Lien deadlines</h3>
        <InfoTip text="Unpaid post-construction jobs with a late invoice or a lien step coming up, from any month. Past due means a lien is possible. Decide means it's time to choose whether to file. The clock starts on the project's completion date. General deadlines only, check with an attorney." />
        {missing.length > 0 && (
          <button type="button" onClick={() => setShowMissing((v) => !v)} className="text-xs text-gray-500 hover:text-pink-600 hover:underline">
            {missing.length} unpaid job{missing.length !== 1 ? "s" : ""} need{missing.length === 1 ? "s" : ""} lien info
          </button>
        )}
      </div>
      {due.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1.5">
          {due.map((r) => (
            <li key={r.projectId} className="flex flex-wrap items-center gap-2 text-sm">
              <Link href={`/erp/projects/${r.projectId}?tab=Liens`} className="font-medium text-gray-900 hover:text-pink-600 hover:underline">
                {r.jobTitle}
              </Link>
              <LienDeadlinePill row={r} />
              {r.readiness?.canFileNow ? <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">Ready to file</span> : null}
              <span className="text-xs text-gray-500">{lienDetailText(r)}</span>
            </li>
          ))}
        </ul>
      )}
      {showMissing && (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {missing.map((r) => (
            <li key={r.projectId} className="text-xs">
              <Link href={`/erp/projects/${r.projectId}?tab=Liens`} className="text-gray-700 hover:text-pink-600 hover:underline">
                {r.jobTitle}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PostConstructionTab({ start, end, search }: { start: string; end: string; search: string }) {
  const [data, setData] = useState<PostConResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!search.trim() && (!start || !end)) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(billingUrl("/api/erp/billing/post-construction", start, end, search))
      .then((r) => r.json())
      .then((d: PostConResponse) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError("Could not load billing data."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [start, end, search]);

  // HubSpot invoices load after the table, keyed by the set of projects shown.
  const [hsByProject, setHsByProject] = useState<Record<string, PostConHubSpot> | null>(null);
  const projectIdsKey = data?.rows.map((r) => r.projectId).join(",") ?? "";
  useEffect(() => {
    if (!projectIdsKey) return;
    let cancelled = false;
    setHsByProject(null);
    fetch(`/api/erp/billing/post-construction/invoices?ids=${encodeURIComponent(projectIdsKey)}`)
      .then((r) => r.json())
      .then((d: { projects?: Record<string, PostConHubSpot> }) => { if (!cancelled) setHsByProject(d.projects ?? {}); })
      .catch(() => { if (!cancelled) setHsByProject({}); });
    return () => { cancelled = true; };
  }, [projectIdsKey]);
  const hsFor = (projectId: string) => (hsByProject === null ? ("loading" as const) : hsByProject[projectId]);

  // Lien deadlines for every unpaid job, not just the ones in this date
  // range, since the deadline keeps running after a job leaves the month.
  const [lienRows, setLienRows] = useState<LienWatchRow[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/erp/billing/lien-deadlines")
      .then((r) => r.json())
      .then((d: { rows?: LienWatchRow[] }) => { if (!cancelled) setLienRows(d.rows ?? []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const lienByProject: Record<string, LienWatchRow> = Object.fromEntries(lienRows.map((r) => [r.projectId, r]));

  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [flags, setFlags] = useState<PostConFlag[]>([]);
  const filtering = status !== "ALL" || flags.length > 0;
  // Status and Overdue are checked per line, the rest per project.
  const shownRows: PostConProjectRow[] = (data?.rows ?? []).flatMap((p) => {
    if (!filtering) return [p];
    const hs = hsByProject?.[p.projectId];
    const hsOk = hs && !("error" in hs) ? hs : null;
    if (flags.includes("LIEN") && !lienNeedsLook(lienByProject[p.projectId])) return [];
    if (flags.includes("COI") && !p.coiWarning) return [];
    if (flags.includes("UNLINKED") && !(hsOk && hsOk.unlinkedCount > 0)) return [];
    const lineOk = (lineStatus: string, invoices: UnitInvoiceChip[] | undefined) =>
      (status === "ALL" || normalizeBillingStatus(lineStatus) === status) && (!flags.includes("OVERDUE") || hasOverdueInvoice(invoices));
    if (p.items.length === 0 && (p.changeOrders ?? []).length === 0) {
      return lineOk(p.projectBillingStatus ?? "NOT_BILLED", hsOk?.invoices) ? [p] : [];
    }
    const items = p.items.filter((i) => lineOk(i.billingStatus, i.invoices));
    const changeOrders = (p.changeOrders ?? []).filter((c) => lineOk(c.billingStatus, c.invoices));
    // The flat contract line beside change orders has no invoices of its own.
    const contractValueCents = p.contractValueCents != null && lineOk(p.projectBillingStatus ?? "NOT_BILLED", undefined) ? p.contractValueCents : null;
    return items.length + changeOrders.length > 0 || contractValueCents != null ? [{ ...p, items, changeOrders, contractValueCents }] : [];
  });

  const allItems = shownRows.flatMap((r) => r.items);
  const allCOs = shownRows.flatMap((r) => r.changeOrders ?? []);
  const wholeProjectRows = shownRows.filter((r) => r.contractValueCents != null);
  const totalCents = allItems.reduce((s, i) => s + i.scheduledValueCents, 0)
    + allCOs.reduce((s, c) => s + c.contractValueCents, 0)
    + wholeProjectRows.reduce((s, r) => s + (r.contractValueCents ?? 0), 0);

  async function updateCOBillingStatus(projectId: string, coId: string, billingStatus: string) {
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        rows: prev.rows.map((row) =>
          row.projectId !== projectId ? row : {
            ...row,
            changeOrders: (row.changeOrders ?? []).map((co) =>
              co.id === coId ? { ...co, billingStatus } : co,
            ),
          },
        ),
      };
    });
    try {
      await fetch(`/api/erp/projects/${projectId}/change-orders/${coId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ billingStatus }),
      });
    } catch {
      fetch(billingUrl("/api/erp/billing/post-construction", start, end, search))
        .then((r) => r.json()).then((d: PostConResponse) => setData(d)).catch(() => {});
    }
  }

  async function updateProjectBillingStatus(projectId: string, billingStatus: string) {
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        rows: prev.rows.map((row) =>
          row.projectId !== projectId ? row : { ...row, projectBillingStatus: billingStatus },
        ),
      };
    });
    try {
      await fetch(`/api/erp/projects/${projectId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ billingStatus }),
      });
    } catch {
      fetch(billingUrl("/api/erp/billing/post-construction", start, end, search))
        .then((r) => r.json()).then((d: PostConResponse) => setData(d)).catch(() => {});
    }
  }

  async function updateBillingStatus(projectId: string, itemId: string, billingStatus: string) {
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        rows: prev.rows.map((row) =>
          row.projectId !== projectId ? row : {
            ...row,
            items: row.items.map((item) => item.id === itemId ? { ...item, billingStatus } : item),
          },
        ),
      };
    });
    try {
      await fetch(`/api/erp/projects/${projectId}/sov/items/${itemId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ billingStatus }),
      });
    } catch {
      fetch(billingUrl("/api/erp/billing/post-construction", start, end, search))
        .then((r) => r.json()).then((d: PostConResponse) => setData(d)).catch(() => {});
    }
  }

  function downloadCsv() {
    if (!data) return;
    const csv = buildPostConCsv(shownRows, data.start, data.end, hsByProject ?? {});
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = search.trim()
      ? `billing-post-construction-search-${search.trim()}.csv`
      : `billing-post-construction-${rangeSlug(start, end)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <BillingFilters status={status} onStatus={setStatus} flagOptions={POST_CON_FLAGS} flags={flags} onFlags={setFlags}>
        <button
          type="button"
          onClick={downloadCsv}
          disabled={shownRows.length === 0}
          className="flex items-center gap-2 rounded-md bg-pink-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-pink-500 disabled:opacity-40"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
            <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
            <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
          </svg>
          Download CSV
        </button>
      </BillingFilters>

      <LienWatchStrip rows={lienRows} />

      <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="border-b border-gray-300 bg-gray-200 text-xs font-semibold uppercase text-gray-700">
              <tr>
                <th className="px-4 py-3">Project</th>
                <th className="px-4 py-3">SOV Item</th>
                <th className="px-4 py-3 text-right">Value</th>
                <th className="px-4 py-3">Billing Status</th>
                <th className="min-w-[15rem] px-4 py-3">
                  <span className="flex items-center gap-1">
                    HubSpot Invoices
                    <InfoTip align="right" text="Invoices linked to each line. Link or fix them on the project's Invoices & Quotes tab." />
                  </span>
                </th>
                <th className="px-4 py-3">
                  <span className="flex items-center gap-1">
                    Lien
                    <InfoTip align="right" text="Where an unpaid job stands on filing a lien, and the days left. A warning mark beside the project name means it needs a look: amber when an invoice is late, red from the day to decide onward. Set it up on the project's Liens tab." />
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
              ) : error ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-red-500">{error}</td></tr>
              ) : !data || data.rows.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">{search.trim() ? `No results for "${search.trim()}".` : "No completed SOV items in this date range."}</td></tr>
              ) : shownRows.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">Nothing matches these filters.</td></tr>
              ) : (
                shownRows.map((project) => {
                  const lineRows = [
                    ...project.items.map((item) => ({ type: "sov" as const, item })),
                    ...(project.changeOrders ?? []).map((co) => ({ type: "co" as const, co })),
                  ];
                  // A flat contract sits on its own line above its change orders.
                  const allProjectRows = [
                    ...(lineRows.length > 0 && project.contractValueCents != null ? [{ type: "contract" as const, valueCents: project.contractValueCents }] : []),
                    ...lineRows,
                  ];
                  if (lineRows.length === 0 && project.contractValueCents != null) {
                    return (
                      <tr key={project.projectId} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">
                          <Link href={`/erp/projects/${project.projectId}`} className="hover:text-pink-600 hover:underline">
                            {project.jobTitle}
                          </Link>
                          <CoiWarningPill warning={project.coiWarning} />
                          <LienWarningIcon row={lienByProject[project.projectId]} className="ml-1.5" />
                        </td>
                        <td className="px-4 py-3 text-gray-400">—</td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-900">
                          {fmt(project.contractValueCents)}
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={project.projectBillingStatus ?? "NOT_BILLED"}
                            onChange={(e) => updateProjectBillingStatus(project.projectId, e.target.value)}
                            className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold focus:outline-none cursor-pointer ${billingBadgeCls(project.projectBillingStatus ?? "NOT_BILLED")}`}
                          >
                            {BILLING_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <PostConInvoiceCell hs={hsFor(project.projectId)} />
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <LienDeadlinePill row={lienByProject[project.projectId]} />
                        </td>
                      </tr>
                    );
                  }
                  return allProjectRows.map((row, idx) => (
                    <tr key={row.type === "sov" ? row.item.id : row.type === "co" ? row.co.id : `${project.projectId}-contract`} className={`border-t border-gray-100 hover:bg-gray-50 ${row.type === "co" ? "bg-blue-50/30" : ""}`}>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {idx === 0 ? (
                          <>
                            <Link href={`/erp/projects/${project.projectId}`} className="hover:text-pink-600 hover:underline">
                              {project.jobTitle}
                            </Link>
                            <CoiWarningPill warning={project.coiWarning} />
                          <LienWarningIcon row={lienByProject[project.projectId]} className="ml-1.5" />
                          </>
                        ) : (
                          <span className="text-gray-300 select-none">↳</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {row.type === "sov" ? row.item.description : row.type === "contract" ? (
                          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-gray-600">Contract</span>
                        ) : (
                          <span className="flex items-center gap-1.5">
                            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-blue-600">CO</span>
                            <Link href={`/erp/projects/${project.projectId}/change-orders/${row.co.id}`} className="hover:text-pink-600 hover:underline">
                              {row.co.title}
                            </Link>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-900">
                        {row.type === "sov" ? fmt(row.item.scheduledValueCents) : row.type === "co" ? fmt(row.co.contractValueCents) : fmt(row.valueCents)}
                      </td>
                      <td className="px-4 py-3">
                        {row.type === "contract" ? (
                          <select
                            value={project.projectBillingStatus ?? "NOT_BILLED"}
                            onChange={(e) => updateProjectBillingStatus(project.projectId, e.target.value)}
                            className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold focus:outline-none cursor-pointer ${billingBadgeCls(project.projectBillingStatus ?? "NOT_BILLED")}`}
                          >
                            {BILLING_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        ) : row.type === "sov" ? (
                          <select
                            value={row.item.billingStatus}
                            onChange={(e) => updateBillingStatus(project.projectId, row.item.id, e.target.value)}
                            className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold focus:outline-none cursor-pointer ${billingBadgeCls(row.item.billingStatus)}`}
                          >
                            {BILLING_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        ) : (
                          <select
                            value={row.co.billingStatus}
                            onChange={(e) => updateCOBillingStatus(project.projectId, row.co.id, e.target.value)}
                            className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold focus:outline-none cursor-pointer ${billingBadgeCls(row.co.billingStatus)}`}
                          >
                            {BILLING_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex flex-wrap items-center gap-1.5">
                          {row.type !== "contract" && <UnitInvoiceChips invoices={(row.type === "sov" ? row.item.invoices : row.co.invoices) ?? []} compact />}
                          {idx === 0 && <PostConProjectFlags hs={hsFor(project.projectId)} projectId={project.projectId} />}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {idx === 0 && <LienDeadlinePill row={lienByProject[project.projectId]} />}
                      </td>
                    </tr>
                  ));
                })
              )}
            </tbody>
            {shownRows.length > 0 && (
              <tfoot className="border-t-2 border-gray-300 bg-gray-100 text-xs font-semibold text-gray-700">
                <tr>
                  <td className="px-4 py-3" colSpan={2}>
                    Total — {allItems.length} SOV item{allItems.length !== 1 ? "s" : ""}
                    {allCOs.length > 0 ? ` + ${allCOs.length} change order${allCOs.length !== 1 ? "s" : ""}` : ""}
                    {wholeProjectRows.length > 0 ? ` + ${wholeProjectRows.length} project total${wholeProjectRows.length !== 1 ? "s" : ""}` : ""}
                    {" "}across {shownRows.length} project{shownRows.length !== 1 ? "s" : ""}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(totalCents)}</td>
                  <td className="px-4 py-3" colSpan={3} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
    </div>
  );
}

// ── Janitorial ────────────────────────────────────────────────────────────────

type JanCORow = {
  id: string;
  projectId: string;
  title: string;
  contractValueCents: number;
  billingStatus: string;
  completedAt: string;
  invoices?: UnitInvoiceChip[];
};

type JanUnitRow = {
  projectId: string;
  turnoverRequestId: string | null;
  jobTitle: string;
  unitNumber: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  completedAt: string;
  contractCents: number;
  billingStatus: string;
  scope: string;
  changeOrders: JanCORow[];
  invoices: UnitInvoiceChip[];
  /** Set by the filters when only this unit's change orders match: the unit
   * stays to carry them but its own row, amount and CSV line are left out. */
  contextOnly?: boolean;
};

type JanFlag = "OVERDUE" | "MISMATCH" | "NO_INVOICE";
const JAN_FLAGS: Array<{ value: JanFlag; label: string }> = [
  { value: "OVERDUE", label: "Overdue invoice" },
  { value: "MISMATCH", label: "HubSpot mismatch" },
  { value: "NO_INVOICE", label: "No invoice" },
];

type JanBuildingRow = {
  buildingId: string;
  buildingName: string;
  units: JanUnitRow[];
};

type JanResponse = {
  start: string;
  end: string;
  rows: JanBuildingRow[];
};

function buildJanCsv(rows: JanBuildingRow[], start: string, end: string): string {
  const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const headers = ["Building", "Unit", "Beds/Baths", "Scope", "Completed", "Contract Amount", "Billing Status", "HubSpot Invoice"].map(escape).join(",");
  const dataRows: string[] = [];
  for (const building of rows) {
    for (const unit of building.units) {
      const bedbath = [unit.bedrooms != null ? `${unit.bedrooms}bd` : null, unit.bathrooms != null ? `${unit.bathrooms}ba` : null].filter(Boolean).join("/") || "—";
      const unitLabel = formatUnitDisplay(unit.unitNumber) ?? unit.jobTitle;
      if (!unit.contextOnly) dataRows.push([
        escape(building.buildingName),
        escape(unitLabel),
        escape(bedbath),
        escape(unit.scope),
        escape(unit.completedAt.slice(0, 10)),
        escape((unit.contractCents / 100).toFixed(2)),
        escape(BILLING_OPTIONS.find((o) => o.value === unit.billingStatus)?.label ?? unit.billingStatus),
        escape((unit.invoices ?? []).map((i) => i.invoiceNumber).filter(Boolean).join(" ")),
      ].join(","));
      for (const co of (unit.changeOrders ?? [])) {
        dataRows.push([
          escape(building.buildingName),
          escape(`${unitLabel} — CO: ${co.title}`),
          escape(bedbath),
          escape(""),
          escape(co.completedAt.slice(0, 10)),
          escape((co.contractValueCents / 100).toFixed(2)),
          escape(BILLING_OPTIONS.find((o) => o.value === co.billingStatus)?.label ?? co.billingStatus),
          escape((co.invoices ?? []).map((i) => i.invoiceNumber).filter(Boolean).join(" ")),
        ].join(","));
      }
    }
  }
  const unitTotal = rows.flatMap((r) => r.units).filter((u) => !u.contextOnly).reduce((s, u) => s + u.contractCents, 0);
  const coTotal = rows.flatMap((r) => r.units).flatMap((u) => u.changeOrders ?? []).reduce((s, c) => s + c.contractValueCents, 0);
  dataRows.push([escape("TOTAL"), escape(""), escape(""), escape(""), escape(""), escape(((unitTotal + coTotal) / 100).toFixed(2)), escape(""), escape("")].join(","));
  void end;
  return [headers, ...dataRows].join("\r\n");
}

function JanitorialTab({ start, end, search }: { start: string; end: string; search: string }) {
  const [data, setData] = useState<JanResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!search.trim() && (!start || !end)) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(billingUrl("/api/erp/billing/janitorial", start, end, search))
      .then((r) => r.json())
      .then((d: JanResponse) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError("Could not load billing data."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [start, end, search]);

  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [flags, setFlags] = useState<JanFlag[]>([]);
  const filtering = status !== "ALL" || flags.length > 0;
  // Units and their change orders are each checked on their own.
  const rowOk = (rowStatus: string, invoices: UnitInvoiceChip[] | undefined) => {
    const list = invoices ?? [];
    const expected = expectedBillingStatus(list);
    return (
      (status === "ALL" || normalizeBillingStatus(rowStatus) === status) &&
      (!flags.includes("OVERDUE") || hasOverdueInvoice(list)) &&
      (!flags.includes("MISMATCH") || (expected !== null && expected !== rowStatus)) &&
      (!flags.includes("NO_INVOICE") || list.length === 0)
    );
  };
  const shownRows: JanBuildingRow[] = (data?.rows ?? []).flatMap((b) => {
    if (!filtering) return [b];
    const units = b.units.flatMap((u) => {
      const changeOrders = (u.changeOrders ?? []).filter((c) => rowOk(c.billingStatus, c.invoices));
      const unitOk = rowOk(u.billingStatus, u.invoices);
      return unitOk || changeOrders.length > 0 ? [{ ...u, changeOrders, contextOnly: !unitOk }] : [];
    });
    return units.length > 0 ? [{ ...b, units }] : [];
  });

  const allUnits = shownRows.flatMap((r) => r.units).filter((u) => !u.contextOnly);
  const allCOs = shownRows.flatMap((r) => r.units).flatMap((u) => u.changeOrders ?? []);
  const totalCents = allUnits.reduce((s, u) => s + u.contractCents, 0)
    + allCOs.reduce((s, c) => s + c.contractValueCents, 0);

  async function updateCOBillingStatus(projectId: string, coId: string, billingStatus: string) {
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        rows: prev.rows.map((row) => ({
          ...row,
          units: row.units.map((u) =>
            u.projectId !== projectId ? u : {
              ...u,
              changeOrders: u.changeOrders.map((co) =>
                co.id === coId ? { ...co, billingStatus } : co,
              ),
            },
          ),
        })),
      };
    });
    try {
      await fetch(`/api/erp/projects/${projectId}/change-orders/${coId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ billingStatus }),
      });
    } catch {
      fetch(billingUrl("/api/erp/billing/janitorial", start, end, search))
        .then((r) => r.json()).then((d: JanResponse) => setData(d)).catch(() => {});
    }
  }

  async function updateBillingStatus(unit: JanUnitRow, billingStatus: string) {
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        rows: prev.rows.map((row) => ({
          ...row,
          units: row.units.map((u) => u.projectId === unit.projectId ? { ...u, billingStatus } : u),
        })),
      };
    });
    try {
      if (unit.turnoverRequestId) {
        await fetch(`/api/erp/turnover-requests/${unit.turnoverRequestId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ billingStatus }),
        });
      } else {
        await fetch(`/api/erp/projects/${unit.projectId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ billingStatus }),
        });
      }
    } catch {
      fetch(billingUrl("/api/erp/billing/janitorial", start, end, search))
        .then((r) => r.json()).then((d: JanResponse) => setData(d)).catch(() => {});
    }
  }

  function downloadCsv() {
    if (!data) return;
    const csv = buildJanCsv(shownRows, data.start, data.end);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = search.trim()
      ? `billing-janitorial-search-${search.trim()}.csv`
      : `billing-janitorial-${rangeSlug(start, end)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <BillingFilters status={status} onStatus={setStatus} flagOptions={JAN_FLAGS} flags={flags} onFlags={setFlags}>
        <button
          type="button"
          onClick={downloadCsv}
          disabled={shownRows.length === 0}
          className="flex items-center gap-2 rounded-md bg-pink-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-pink-500 disabled:opacity-40"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
            <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
            <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
          </svg>
          Download CSV
        </button>
      </BillingFilters>

      <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-gray-300 bg-gray-200 text-xs font-semibold uppercase text-gray-700">
              <tr>
                <th className="px-4 py-3">Building</th>
                <th className="px-4 py-3">Unit</th>
                <th className="px-4 py-3">Beds / Baths</th>
                <th className="px-4 py-3">Completed</th>
                <th className="px-4 py-3 text-right">Contract Amount</th>
                <th className="px-4 py-3">Billing Status</th>
                <th className="px-4 py-3">
                  <span className="flex items-center gap-1">
                    HubSpot Invoice
                    <InfoTip align="right" text="Synced hourly from HubSpot. A ! means HubSpot's invoice status doesn't match the billing status here. Search also finds invoice numbers." />
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
              ) : error ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-red-500">{error}</td></tr>
              ) : !data || data.rows.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">{search.trim() ? `No results for "${search.trim()}".` : "No completed units in this date range."}</td></tr>
              ) : shownRows.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">Nothing matches these filters.</td></tr>
              ) : (
                shownRows.map((building) => {
                  const buildingRows = building.units.flatMap((unit) => [
                    ...(unit.contextOnly ? [] : [{ type: "unit" as const, unit }]),
                    ...unit.changeOrders.map((co) => ({ type: "co" as const, unit, co })),
                  ]);
                  return buildingRows.map((row, idx) => (
                    <tr
                      key={row.type === "unit" ? row.unit.projectId : row.co.id}
                      className={`border-t border-gray-100 hover:bg-gray-50 ${row.type === "co" ? "bg-blue-50/30" : ""}`}
                    >
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {idx === 0 ? building.buildingName : <span className="text-gray-300 select-none">↳</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {row.type === "unit" ? (
                          <Link href={`/erp/projects/${row.unit.projectId}`} className="hover:text-pink-600 hover:underline">
                            {formatUnitDisplay(row.unit.unitNumber) || row.unit.jobTitle}
                          </Link>
                        ) : (
                          <span className="flex items-center gap-1.5 pl-4">
                            <span className="text-gray-300 select-none">↳</span>
                            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-blue-600">CO</span>
                            <Link href={`/erp/projects/${row.co.projectId}/change-orders/${row.co.id}`} className="hover:text-pink-600 hover:underline">
                              {row.co.title}
                            </Link>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {[row.unit.bedrooms != null ? `${row.unit.bedrooms} bd` : null, row.unit.bathrooms != null ? `${row.unit.bathrooms} ba` : null].filter(Boolean).join(" / ") || "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs tabular-nums">
                        {new Date(row.type === "unit" ? row.unit.completedAt : row.co.completedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-900">
                        {row.type === "unit"
                          ? (row.unit.contractCents > 0 ? fmt(row.unit.contractCents) : <span className="text-gray-400">—</span>)
                          : fmt(row.co.contractValueCents)}
                      </td>
                      <td className="px-4 py-3">
                        {row.type === "unit" ? (
                          <select
                            value={row.unit.billingStatus}
                            onChange={(e) => updateBillingStatus(row.unit, e.target.value)}
                            className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold focus:outline-none cursor-pointer ${billingBadgeCls(row.unit.billingStatus)}`}
                          >
                            {BILLING_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        ) : (
                          <select
                            value={row.co.billingStatus}
                            onChange={(e) => updateCOBillingStatus(row.co.projectId, row.co.id, e.target.value)}
                            className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold focus:outline-none cursor-pointer ${billingBadgeCls(row.co.billingStatus)}`}
                          >
                            {BILLING_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {row.type === "unit" ? <JanInvoiceCell unit={row.unit} /> : <UnitInvoiceChips invoices={row.co.invoices ?? []} compact />}
                      </td>
                    </tr>
                  ));
                })
              )}
            </tbody>
            {shownRows.length > 0 && (
              <tfoot className="border-t-2 border-gray-300 bg-gray-100 text-xs font-semibold text-gray-700">
                <tr>
                  <td className="px-4 py-3" colSpan={4}>
                    Total — {allUnits.length} unit{allUnits.length !== 1 ? "s" : ""}
                    {allCOs.length > 0 ? ` + ${allCOs.length} change order${allCOs.length !== 1 ? "s" : ""}` : ""}
                    {" "}across {shownRows.length} building{shownRows.length !== 1 ? "s" : ""}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(totalCents)}</td>
                  <td className="px-4 py-3" colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
    </div>
  );
}

function JanInvoiceCell({ unit }: { unit: JanUnitRow }) {
  const invoices = unit.invoices ?? [];
  if (invoices.length === 0) return <span className="text-xs text-gray-400">None</span>;
  const expected = expectedBillingStatus(invoices);
  const mismatch = expected !== null && expected !== unit.billingStatus;
  return (
    <span className="flex items-center gap-1.5">
      <UnitInvoiceChips invoices={invoices} compact />
      {mismatch && (
        <span
          title={`HubSpot says ${expected === "PAID" ? "paid" : "invoiced, not paid"}, but this unit is marked ${BILLING_OPTIONS.find((o) => o.value === unit.billingStatus)?.label ?? unit.billingStatus}.`}
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-400 text-[10px] font-bold text-white"
        >
          !
        </span>
      )}
    </span>
  );
}

// ── Recurring ─────────────────────────────────────────────────────────────────

type RecurringPeriodRow = {
  periodId: string;
  periodStart: string;
  /** Flat monthly amount plus any one-off extras. */
  totalCents: number;
  extras: string[];
  billingStatus: string;
  /** HubSpot invoices linked to this month */
  invoices?: UnitInvoiceChip[];
};

type RecurringFlag = "OVERDUE" | "NO_INVOICE";
const RECURRING_FLAGS: Array<{ value: RecurringFlag; label: string }> = [
  { value: "OVERDUE", label: "Overdue invoice" },
  { value: "NO_INVOICE", label: "No invoice" },
];

type RecurringBuildingRow = {
  contractId: string;
  buildingId: string;
  buildingName: string;
  periods: RecurringPeriodRow[];
};

type RecurringResponse = {
  start: string;
  end: string;
  rows: RecurringBuildingRow[];
};

function buildRecurringCsv(rows: RecurringBuildingRow[], start: string, end: string): string {
  const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const headers = ["Building", "Month", "Monthly Amount", "Billing Status", "HubSpot Invoice"].map(escape).join(",");
  const dataRows: string[] = [];
  for (const building of rows) {
    for (const period of building.periods) {
      dataRows.push([
        escape(building.buildingName),
        escape(period.periodStart.slice(0, 7)),
        escape((period.totalCents / 100).toFixed(2)),
        escape(BILLING_OPTIONS.find((o) => o.value === period.billingStatus)?.label ?? period.billingStatus),
        escape((period.invoices ?? []).map((i) => i.invoiceNumber).filter(Boolean).join(" ")),
      ].join(","));
    }
  }
  const total = rows.flatMap((r) => r.periods).reduce((s, p) => s + p.totalCents, 0);
  dataRows.push([escape("TOTAL"), escape(""), escape((total / 100).toFixed(2)), escape(""), escape("")].join(","));
  void end;
  return [headers, ...dataRows].join("\r\n");
}

function RecurringTab({ start, end, search }: { start: string; end: string; search: string }) {
  const [data, setData] = useState<RecurringResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!search.trim() && (!start || !end)) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(billingUrl("/api/erp/billing/recurring", start, end, search))
      .then((r) => r.json())
      .then((d: RecurringResponse) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError("Could not load billing data."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [start, end, search]);

  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [flags, setFlags] = useState<RecurringFlag[]>([]);
  const shownRows: RecurringBuildingRow[] = (data?.rows ?? []).flatMap((b) => {
    if (status === "ALL" && flags.length === 0) return [b];
    const periods = b.periods.filter(
      (p) =>
        (status === "ALL" || normalizeBillingStatus(p.billingStatus) === status) &&
        (!flags.includes("OVERDUE") || hasOverdueInvoice(p.invoices)) &&
        (!flags.includes("NO_INVOICE") || (p.invoices ?? []).length === 0),
    );
    return periods.length > 0 ? [{ ...b, periods }] : [];
  });

  const allPeriods = shownRows.flatMap((r) => r.periods);
  const totalCents = allPeriods.reduce((s, p) => s + p.totalCents, 0);

  async function updateBillingStatus(period: RecurringPeriodRow, billingStatus: string) {
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        rows: prev.rows.map((row) => ({
          ...row,
          periods: row.periods.map((p) => p.periodId === period.periodId ? { ...p, billingStatus } : p),
        })),
      };
    });
    try {
      const res = await fetch(`/api/erp/janitorial/periods/${period.periodId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ billingStatus }),
      });
      if (!res.ok) throw new Error("update failed");
    } catch {
      fetch(billingUrl("/api/erp/billing/recurring", start, end, search))
        .then((r) => r.json()).then((d: RecurringResponse) => setData(d)).catch(() => {});
    }
  }

  function downloadCsv() {
    if (!data) return;
    const csv = buildRecurringCsv(shownRows, data.start, data.end);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = search.trim()
      ? `billing-recurring-search-${search.trim()}.csv`
      : `billing-recurring-${rangeSlug(start, end)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <BillingFilters status={status} onStatus={setStatus} flagOptions={RECURRING_FLAGS} flags={flags} onFlags={setFlags}>
        <button
          type="button"
          onClick={downloadCsv}
          disabled={shownRows.length === 0}
          className="flex items-center gap-2 rounded-md bg-pink-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-pink-500 disabled:opacity-40"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
            <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
            <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
          </svg>
          Download CSV
        </button>
      </BillingFilters>

      <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-gray-300 bg-gray-200 text-xs font-semibold uppercase text-gray-700">
              <tr>
                <th className="px-4 py-3">Building</th>
                <th className="px-4 py-3">Month</th>
                <th className="px-4 py-3 text-right">Monthly Amount</th>
                <th className="px-4 py-3">Billing Status</th>
                <th className="px-4 py-3">
                  <span className="flex items-center gap-1">
                    HubSpot Invoice
                    <InfoTip align="right" text="Linked by hand on the building's Invoices & Quotes tab. Search also finds invoice numbers." />
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
              ) : error ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-red-500">{error}</td></tr>
              ) : !data || data.rows.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">{search.trim() ? `No results for "${search.trim()}".` : "No recurring contract periods in this date range."}</td></tr>
              ) : shownRows.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">Nothing matches these filters.</td></tr>
              ) : (
                shownRows.map((building) =>
                  building.periods.map((period, idx) => (
                    <tr key={period.periodId} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {idx === 0 ? (
                          <Link href={`/erp/buildings/${building.buildingId}`} className="hover:text-pink-600 hover:underline">
                            {building.buildingName}
                          </Link>
                        ) : (
                          <span className="text-gray-300 select-none">↳</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        <Link href={`/erp/janitorial/contracts/${building.contractId}`} className="hover:text-pink-600 hover:underline">
                          {new Date(period.periodStart).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}
                        </Link>
                        {period.extras.length > 0 && (
                          <p className="text-xs text-gray-500">Incl. {period.extras.join(", ")}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-900">
                        {fmt(period.totalCents)}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={period.billingStatus}
                          onChange={(e) => updateBillingStatus(period, e.target.value)}
                          className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold focus:outline-none cursor-pointer ${billingBadgeCls(period.billingStatus)}`}
                        >
                          {BILLING_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        {(period.invoices ?? []).length > 0 ? (
                          <UnitInvoiceChips invoices={period.invoices ?? []} compact />
                        ) : (
                          <Link href={`/erp/buildings/${building.buildingId}?tab=${encodeURIComponent("Invoices & Quotes")}`} className="text-xs text-gray-400 hover:text-pink-600 hover:underline">
                            None
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))
                )
              )}
            </tbody>
            {shownRows.length > 0 && (
              <tfoot className="border-t-2 border-gray-300 bg-gray-100 text-xs font-semibold text-gray-700">
                <tr>
                  <td className="px-4 py-3" colSpan={2}>
                    Total — {allPeriods.length} month{allPeriods.length !== 1 ? "s" : ""} across {shownRows.length} building{shownRows.length !== 1 ? "s" : ""}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(totalCents)}</td>
                  <td className="px-4 py-3" colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const [tab, setTab] = useState<Tab>("post-construction");
  const [start, setStart] = useState(monthStartISO);
  const [end, setEnd] = useState(todayISO);
  // Keeps the picked dates so turning it off goes back to them.
  const [allTime, setAllTime] = useState(false);
  const rangeStart = allTime ? ALL_TIME_START : start;
  const rangeEnd = allTime ? ALL_TIME_END : end;

  // Debounced so typing doesn't fire a request per keystroke, search
  // bypasses the date range entirely (see billingUrl above), so every
  // keystroke here is a real, unscoped query, not a cheap client-side filter.
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    if (t === "post-construction" || t === "janitorial" || t === "recurring") setTab(t);
  }, []);

  function updateTab(t: Tab) {
    setTab(t);
    const params = new URLSearchParams(window.location.search);
    params.set("tab", t);
    history.replaceState(null, "", `?${params.toString()}`);
  }

  // Search and dates are drawn by each tab's toolbar (BillingFilters).
  const controls: BillingControls = {
    searchInput,
    setSearchInput,
    searching: search.trim(),
    start,
    setStart,
    end,
    setEnd,
    allTime,
    setAllTime,
    datesDefault: !allTime && start === monthStartISO() && end === todayISO(),
    resetDates: () => { setAllTime(false); setStart(monthStartISO()); setEnd(todayISO()); },
  };

  const TABS: { id: Tab; label: string }[] = [
    { id: "post-construction", label: "Post-Construction" },
    { id: "janitorial", label: "Janitorial" },
    { id: "recurring", label: "Recurring" },
  ];

  return (
    <BillingControlsContext.Provider value={controls}>
    <div className="space-y-5">
      {/* Header */}
      <h1 className="text-2xl font-semibold text-pink-600">Project Billing</h1>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => updateTab(t.id)}
              className={[
                "px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors",
                tab === t.id
                  ? "border-pink-600 text-pink-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300",
              ].join(" ")}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {tab === "post-construction" && <PostConstructionTab start={rangeStart} end={rangeEnd} search={search} />}
      {tab === "janitorial" && <JanitorialTab start={rangeStart} end={rangeEnd} search={search} />}
      {tab === "recurring" && <RecurringTab start={rangeStart} end={rangeEnd} search={search} />}
    </div>
    </BillingControlsContext.Provider>
  );
}
