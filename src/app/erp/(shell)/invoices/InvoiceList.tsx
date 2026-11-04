"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal, inputClass } from "@/app/erp/components/ui";
import { HubSpotDocumentsSection } from "@/app/erp/components/HubSpotDocumentsSection";
import { OptionCombobox } from "@/app/erp/components/OptionCombobox";
import { centsToDollars } from "@/lib/erp/money";
import type { InvoiceListRow, InvoiceStatus } from "@/lib/erp/invoiceList";

type StatusFilter = "ALL" | "UNPAID" | "OVERDUE" | "PAID";
type Fix = "NEEDS_LINKING" | "MISMATCH" | "NOT_IN_QBO";
type Filters = { status: StatusFilter; client: string; from: string; to: string; fix: Fix | null };
const NO_FILTERS: Filters = { status: "ALL", client: "", from: "", to: "", fix: null };

const STATUSES: { key: StatusFilter; label: string; match: (r: InvoiceListRow) => boolean }[] = [
  { key: "ALL", label: "All", match: () => true },
  { key: "UNPAID", label: "Unpaid", match: (r) => r.balanceCents > 0 },
  { key: "OVERDUE", label: "Overdue", match: (r) => r.daysLate > 0 && r.balanceCents > 0 },
  { key: "PAID", label: "Paid", match: (r) => r.balanceCents <= 0 },
];
const FIXES: { key: Fix; label: string; hint: string; match: (r: InvoiceListRow) => boolean }[] = [
  { key: "NEEDS_LINKING", label: "Needs linking", hint: "Not tied to any work in the ERP", match: (r) => r.needsLinking },
  { key: "MISMATCH", label: "Paid doesn't match", hint: "The invoice and its lines disagree on paid", match: (r) => !!r.paidMismatch },
  { key: "NOT_IN_QBO", label: "Not in QuickBooks", hint: "HubSpot invoices that never reached QuickBooks", match: (r) => r.status === "NOT_IN_QBO" },
];
/** ?filter= values from links (dashboard, flow bar, Ready to send) */
const URL_FILTERS: Record<string, Partial<Filters>> = {
  unpaid: { status: "UNPAID" },
  overdue: { status: "OVERDUE" },
  paid: { status: "PAID" },
  "not-in-quickbooks": { fix: "NOT_IN_QBO" },
  "needs-linking": { fix: "NEEDS_LINKING" },
  mismatch: { fix: "MISMATCH" },
};
type Sort = "work" | "date" | "due" | "amount" | "balance";

/** YYYY-MM-DD in local time. */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function datePresets(): { label: string; from: string; to: string }[] {
  const now = new Date();
  const y = now.getFullYear();
  return [
    { label: "This month", from: dayKey(new Date(y, now.getMonth(), 1)), to: "" },
    { label: "Last 30 days", from: dayKey(new Date(Date.now() - 30 * 86_400_000)), to: "" },
    { label: "This year", from: `${y}-01-01`, to: "" },
    { label: "Last year", from: `${y - 1}-01-01`, to: `${y - 1}-12-31` },
  ];
}

function matches(r: InvoiceListRow, f: Filters): boolean {
  if (!STATUSES.find((x) => x.key === f.status)!.match(r)) return false;
  if (f.client && r.client !== f.client) return false;
  if (f.from && (r.invoiceDate ?? "") < f.from) return false;
  if (f.to && (r.invoiceDate ?? "") > f.to) return false;
  if (f.fix && !FIXES.find((x) => x.key === f.fix)!.match(r)) return false;
  return true;
}

const PILL: Record<InvoiceStatus, string> = {
  PAID: "bg-emerald-50 text-emerald-700",
  PARTLY_PAID: "bg-sky-50 text-sky-700",
  OPEN: "bg-gray-100 text-gray-700",
  OVERDUE: "bg-red-50 text-red-700",
  NOT_IN_QBO: "bg-amber-50 text-amber-800",
};

const PAGE = 50;

function fmtDay(key: string | null): string {
  if (!key) return "-";
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** When the billed work was finished: "Oct 3, 2026", "Oct 3 to Oct 12, 2026", or "Oct 2026" for a janitorial month. */
function fmtWork(w: InvoiceListRow["workDate"]): string {
  if (!w) return "-";
  const date = (key: string) => {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y!, m! - 1, d!);
  };
  const from = date(w.from);
  const to = date(w.to);
  const sameYear = from.getFullYear() === to.getFullYear();
  if (w.monthly) {
    const month = (d: Date, year: boolean) => d.toLocaleDateString("en-US", { month: "short", ...(year ? { year: "numeric" } : {}) });
    return from.getMonth() === to.getMonth() && sameYear ? month(from, true) : `${month(from, !sameYear)} to ${month(to, true)}`;
  }
  if (w.from === w.to) return fmtDay(w.from);
  const day = (d: Date, year: boolean) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(year ? { year: "numeric" } : {}) });
  return `${day(from, !sameYear)} to ${day(to, true)}`;
}

function statusLabel(r: InvoiceListRow): string {
  switch (r.status) {
    case "PAID":
      return "Paid";
    case "PARTLY_PAID":
      return "Partly paid";
    case "OPEN":
      return "Open";
    case "OVERDUE":
      return `Overdue ${r.daysLate}d`;
    case "NOT_IN_QBO":
      return "Not in QuickBooks";
  }
}

function statusHint(r: InvoiceListRow): string {
  if (r.status === "NOT_IN_QBO") return "HubSpot has this invoice but it never reached QuickBooks, usually a HubSpot sync failure.";
  if (r.status === "PAID") return r.paidDate ? `Paid ${fmtDay(r.paidDate)}` : "Paid";
  if (r.status === "OVERDUE") return `Due ${fmtDay(r.dueDate)}, ${centsToDollars(r.balanceCents)} still owed`;
  if (r.status === "PARTLY_PAID") return `${centsToDollars(r.totalCents - r.balanceCents)} paid, ${centsToDollars(r.balanceCents)} still owed`;
  return `Due ${fmtDay(r.dueDate)}`;
}

/** Invoice list with search and one Filter button (status, client, date, fixes); a row opens its details. */
export function InvoiceList({ rows, showQuickBooks }: { rows: InvoiceListRow[]; showQuickBooks: boolean }) {
  const [filters, setFiltersState] = useState<Filters>(NO_FILTERS);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ by: Sort; desc: boolean }>({ by: "date", desc: true });
  const [open, setOpen] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);
  const [linking, setLinking] = useState<InvoiceListRow | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const router = useRouter();

  const setFilters = (next: Partial<Filters>) => {
    setFiltersState((f) => ({ ...f, ...next }));
    setShown(PAGE);
  };

  // Links open a filter or a search, e.g. an invoice number from Project Billing.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const f = URL_FILTERS[p.get("filter") ?? ""];
    if (f) setFiltersState({ ...NO_FILTERS, ...f });
    const q = p.get("q");
    if (q) {
      setQuery(q);
      const one = rows.filter((r) => r.number?.toUpperCase() === q.trim().toUpperCase());
      if (one.length === 1) setOpen(one[0]!.key);
    }
    // Only on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => [r.number, r.client, r.forTitle, r.subCustomer].some((v) => v?.toLowerCase().includes(q)));
  }, [rows, query]);

  const visible = useMemo(() => {
    const value = (r: InvoiceListRow): string | number =>
      sort.by === "amount"
        ? r.totalCents
        : sort.by === "balance"
          ? r.balanceCents
          : sort.by === "due"
            ? (r.dueDate ?? "")
            : sort.by === "work"
              ? (r.workDate?.from ?? "")
              : (r.invoiceDate ?? "");
    return searched
      .filter((r) => matches(r, filters))
      .sort((a, b) => {
        const x = value(a);
        const y = value(b);
        const c = typeof x === "number" ? x - (y as number) : x.localeCompare(y as string);
        return sort.desc ? -c : c;
      });
  }, [searched, filters, sort]);

  const totals = visible.reduce((s, r) => ({ total: s.total + r.totalCents, balance: s.balance + r.balanceCents }), { total: 0, balance: 0 });
  const clients = useMemo(() => [...new Set(rows.map((r) => r.client).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b)), [rows]);
  const fixCount = rows.filter((r) => FIXES.some((f) => f.match(r))).length;

  // Active filters as removable chips.
  const chips: { label: string; clear: Partial<Filters> }[] = [
    ...(filters.status !== "ALL" ? [{ label: STATUSES.find((x) => x.key === filters.status)!.label, clear: { status: "ALL" as const } }] : []),
    ...(filters.client ? [{ label: filters.client, clear: { client: "" } }] : []),
    ...(filters.from || filters.to
      ? [{ label: filters.from && filters.to ? `${fmtDay(filters.from)} to ${fmtDay(filters.to)}` : filters.from ? `Since ${fmtDay(filters.from)}` : `Until ${fmtDay(filters.to)}`, clear: { from: "", to: "" } }]
      : []),
    ...(filters.fix ? [{ label: FIXES.find((x) => x.key === filters.fix)!.label, clear: { fix: null } }] : []),
  ];

  function sortBy(by: Sort) {
    setSort((s) => (s.by === by ? { by, desc: !s.desc } : { by, desc: true }));
  }

  const th = (label: string, by: Sort | null, right = false) => (
    <th className={`px-3 py-2 font-medium ${right ? "text-right" : "text-left"}`}>
      {by ? (
        <button type="button" onClick={() => sortBy(by)} className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-gray-800">
          {label}
          <span className={sort.by === by ? "text-gray-700" : "invisible"}>{sort.desc ? "↓" : "↑"}</span>
        </button>
      ) : (
        label
      )}
    </th>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShown(PAGE);
          }}
          placeholder="Search number, client, building or job"
          className={`${inputClass.sm} w-full sm:w-72`}
        />
        <FilterMenu
          open={filterOpen}
          setOpen={setFilterOpen}
          filters={filters}
          setFilters={setFilters}
          clients={clients}
          active={chips.length}
          counts={{
            status: Object.fromEntries(STATUSES.map((x) => [x.key, searched.filter(x.match).length])) as Record<StatusFilter, number>,
            fix: Object.fromEntries(FIXES.map((x) => [x.key, rows.filter(x.match).length])) as Record<Fix, number>,
          }}
        />
        {chips.map((c) => (
          <span key={c.label} className="inline-flex items-center gap-1 rounded-full bg-pink-50 py-0.5 pl-2.5 pr-1 text-xs font-medium text-pink-700">
            {c.label}
            <button type="button" aria-label={`Remove ${c.label}`} onClick={() => setFilters(c.clear)} className="rounded-full px-1 hover:bg-pink-100">
              ×
            </button>
          </span>
        ))}
        {chips.length > 1 && (
          <button type="button" onClick={() => setFilters(NO_FILTERS)} className="text-xs text-gray-500 hover:text-gray-800">
            Clear all
          </button>
        )}
        {!filters.fix && fixCount > 0 && (
          <button type="button" onClick={() => setFilterOpen(true)} className="ml-auto inline-flex items-center gap-1.5 text-xs text-amber-800 hover:underline">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            {fixCount} need a fix
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              {th("Number", null)}
              {th("Client", null)}
              {th("Work done", "work")}
              {th("Date", "date")}
              {th("Due", "due")}
              {th("Amount", "amount", true)}
              {th("Balance", "balance", true)}
              {th("Status", null)}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visible.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-sm text-gray-500">
                  No invoices match.
                </td>
              </tr>
            )}
            {visible.slice(0, shown).map((r) => {
              const isOpen = open === r.key;
              return (
                <Fragment key={r.key}>
                  <tr onClick={() => setOpen(isOpen ? null : r.key)} className={`cursor-pointer hover:bg-gray-50 ${isOpen ? "bg-gray-50" : ""}`}>
                    <td className="whitespace-nowrap px-3 py-2 font-medium text-gray-900">
                      {r.number ?? "-"}
                      {r.pdfUrl && (
                        <a
                          href={r.pdfUrl}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="ml-2 text-xs font-normal text-pink-600 hover:text-pink-700"
                        >
                          PDF
                        </a>
                      )}
                      {(r.needsLinking || r.paidMismatch) && (
                        <span
                          title={r.paidMismatch ?? "Not linked to any work in the ERP"}
                          aria-label={r.paidMismatch ?? "Not linked to any work in the ERP"}
                          className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-500 align-middle"
                        />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-gray-900">{r.client ?? "-"}</div>
                      {(r.forTitle ?? r.subCustomer) && <div className="text-xs text-gray-500">{r.forTitle ?? r.subCustomer}</div>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-gray-700">{fmtWork(r.workDate)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-gray-700">{fmtDay(r.invoiceDate)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-gray-700">{fmtDay(r.dueDate)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-900">{centsToDollars(r.totalCents)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.balanceCents > 0 ? "text-gray-900" : "text-gray-400"}`}>{centsToDollars(r.balanceCents)}</td>
                    <td className="px-3 py-2">
                      <span title={statusHint(r)} className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${PILL[r.daysLate > 0 && r.balanceCents > 0 ? "OVERDUE" : r.status]}`}>
                        {r.status === "NOT_IN_QBO" && r.daysLate > 0 && r.balanceCents > 0 ? `Not in QuickBooks · ${r.daysLate}d late` : statusLabel(r)}
                      </span>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-gray-50">
                      <td colSpan={8} className="px-3 pb-4 pt-1">
                        <InvoiceDetails r={r} showQuickBooks={showQuickBooks} onLink={() => setLinking(r)} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          {visible.length > 0 && (
            <tfoot className="border-t border-gray-200 text-sm">
              <tr>
                <td colSpan={5} className="px-3 py-2 text-xs text-gray-500">
                  {visible.length} invoice{visible.length === 1 ? "" : "s"}
                </td>
                <td className="px-3 py-2 text-right font-medium tabular-nums text-gray-900">{centsToDollars(totals.total)}</td>
                <td className="px-3 py-2 text-right font-medium tabular-nums text-gray-900">{centsToDollars(totals.balance)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {linking?.linkTarget && (
        <Modal
          open
          onClose={() => {
            setLinking(null);
            // Links saved in the modal change this list.
            router.refresh();
          }}
          size="lg"
        >
          <h3 className="text-base font-semibold text-gray-900">
            Link {linking.number ?? "invoice"} on {linking.linkTarget.title}
          </h3>
          <p className="mt-1 text-xs text-gray-500">Click Link on the invoice below and pick the lines it covers. Close this when you&apos;re done.</p>
          <div className="mt-3 max-h-[70vh] overflow-y-auto">
            <HubSpotDocumentsSection
              endpoint={`/api/erp/${linking.linkTarget.scope === "project" ? "projects" : "buildings"}/${linking.linkTarget.id}/hubspot-documents`}
              noDealMessage="No HubSpot deal is linked here."
              invoicesInfo="Read live from the HubSpot deal."
            />
          </div>
        </Modal>
      )}

      {visible.length > shown && (
        <div className="text-center">
          <button type="button" onClick={() => setShown((n) => n + PAGE)} className="text-sm font-medium text-pink-600 hover:text-pink-700">
            Show more ({visible.length - shown} left)
          </button>
        </div>
      )}
    </div>
  );
}

/** The Filter button and its panel: status, client, invoice date and fixes. */
function FilterMenu({
  open,
  setOpen,
  filters,
  setFilters,
  clients,
  active,
  counts,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  filters: Filters;
  setFilters: (next: Partial<Filters>) => void;
  clients: string[];
  active: number;
  counts: { status: Record<StatusFilter, number>; fix: Record<Fix, number> };
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      // The client picker's list can sit outside the panel's box, so only close on clicks outside the whole menu.
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, setOpen]);

  const heading = "text-[10px] font-semibold uppercase tracking-wide text-gray-400";
  const option = (on: boolean) => `rounded-full border px-2.5 py-1 text-xs ${on ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"}`;
  const fixes = FIXES.filter((x) => counts.fix[x.key] > 0);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium ${
          active ? "border-pink-300 bg-pink-50 text-pink-700" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
        }`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 4.5h18M6.75 12h10.5M10.5 19.5h3" />
        </svg>
        Filter{active ? ` (${active})` : ""}
      </button>
      {open && (
        <div className="absolute left-0 z-20 mt-2 w-80 space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-lg">
          <div>
            <p className={heading}>Status</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {STATUSES.map((x) => (
                <button key={x.key} type="button" onClick={() => setFilters({ status: x.key })} className={option(filters.status === x.key)}>
                  {x.label} <span className="tabular-nums opacity-60">{counts.status[x.key]}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className={heading}>Client</p>
            <OptionCombobox options={clients.map((c) => ({ value: c, label: c }))} value={filters.client} onChange={(v) => setFilters({ client: v })} allLabel="All clients" />
          </div>

          <div>
            <p className={heading}>Invoice date</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {datePresets().map((d) => (
                <button key={d.label} type="button" onClick={() => setFilters({ from: d.from, to: d.to })} className={option(filters.from === d.from && filters.to === d.to)}>
                  {d.label}
                </button>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-gray-600">
              <input type="date" aria-label="From" value={filters.from} max={filters.to || undefined} onChange={(e) => setFilters({ from: e.target.value })} className={`${inputClass.sm} flex-1`} />
              to
              <input type="date" aria-label="To" value={filters.to} min={filters.from || undefined} onChange={(e) => setFilters({ to: e.target.value })} className={`${inputClass.sm} flex-1`} />
            </div>
          </div>

          {fixes.length > 0 && (
            <div>
              <p className={heading}>Needs a fix</p>
              <div className="mt-1.5 space-y-1">
                {fixes.map((x) => (
                  <button
                    key={x.key}
                    type="button"
                    title={x.hint}
                    onClick={() => setFilters({ fix: filters.fix === x.key ? null : x.key })}
                    className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs ${
                      filters.fix === x.key ? "bg-amber-100 font-medium text-amber-900" : "text-amber-800 hover:bg-amber-50"
                    }`}
                  >
                    {x.label}
                    <span className="tabular-nums">{counts.fix[x.key]}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-between border-t border-gray-100 pt-3">
            <button type="button" onClick={() => setFilters(NO_FILTERS)} className="text-xs text-gray-500 hover:text-gray-800">
              Clear all
            </button>
            <button type="button" onClick={() => setOpen(false)} className="text-xs font-medium text-pink-600 hover:text-pink-700">
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function InvoiceDetails({ r, showQuickBooks, onLink }: { r: InvoiceListRow; showQuickBooks: boolean; onLink: () => void }) {
  const link = "font-medium text-pink-600 hover:underline";
  return (
    <div className="space-y-2">
      {(r.needsLinking || r.paidMismatch) && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <span>
            {r.paidMismatch ??
              (r.linkTarget
                ? `Not linked to any work in the ERP. It's on ${r.linkTarget.title}'s HubSpot deal.`
                : "Not linked to any work in the ERP, and the ERP can't tell which job it's for. Link it from the right building or job's Invoices & Quotes tab.")}
          </span>
          {r.needsLinking && r.linkTarget && (
            <button type="button" onClick={onLink} className="ml-auto rounded-md bg-white px-2.5 py-1 font-medium text-amber-900 shadow-sm ring-1 ring-amber-300 hover:bg-amber-100">
              Link to lines
            </button>
          )}
          {r.paidMismatch && r.billingHref && (
            <a href={r.billingHref} className="ml-auto font-medium underline">
              Fix on Project Billing
            </a>
          )}
        </div>
      )}
      <div className="grid gap-4 rounded-md border border-gray-200 bg-white p-3 text-xs text-gray-700 sm:grid-cols-3">
        <div className="space-y-1">
          <div className="font-semibold uppercase tracking-wide text-gray-400">For</div>
          {r.forHref ? (
            <>
              <a href={r.forHref} className={link}>
                {r.forTitle}
              </a>
              {r.billingHref && (
                <div>
                  <a href={r.billingHref} className={link}>
                    See the work on Project Billing
                  </a>
                </div>
              )}
            </>
          ) : (
            <div>{r.subCustomer ?? "Not linked to a building or job in the ERP"}</div>
          )}
          {r.fromErp && <div className="text-gray-500">Made on Ready to send</div>}
        </div>
        <div className="space-y-1">
          <div className="font-semibold uppercase tracking-wide text-gray-400">Payments</div>
          {r.payments.length ? (
            r.payments.map((p, i) => (
              <div key={i} className="tabular-nums">
                {fmtDay(p.date)} · {centsToDollars(p.cents)}
                {p.ref && <span className="text-gray-500"> · {p.ref}</span>}
              </div>
            ))
          ) : (
            <div className="text-gray-500">{r.paidDate ? `Paid ${fmtDay(r.paidDate)}` : "None yet"}</div>
          )}
        </div>
        <div className="space-y-1">
          <div className="font-semibold uppercase tracking-wide text-gray-400">Sent and links</div>
          {r.sent && <div>{r.sent}</div>}
          <div className="flex flex-wrap gap-3">
            {r.pdfUrl && (
              <a href={r.pdfUrl} target="_blank" rel="noreferrer" className={link}>
                PDF
              </a>
            )}
            {showQuickBooks && r.qboUrl && (
              <a href={r.qboUrl} target="_blank" rel="noreferrer" className={link}>
                Open in QuickBooks
              </a>
            )}
            {r.hubspotUrl && (
              <a href={r.hubspotUrl} target="_blank" rel="noreferrer" className={link}>
                HubSpot invoice
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
