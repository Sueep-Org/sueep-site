"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Modal, inputClass, labelClass, useConfirm, useToast } from "@/app/erp/components/ui";
import { HubSpotDocumentsSection } from "@/app/erp/components/HubSpotDocumentsSection";
import { OptionCombobox } from "@/app/erp/components/OptionCombobox";
import { centsToDollars, parseMoneyInput } from "@/lib/erp/money";
import type { InvoiceEvent, InvoiceListRow, InvoiceStatus } from "@/lib/erp/invoiceList";
import { PORTAL_PICKABLE, PORTAL_STATUS_LABELS, type PortalStatus } from "@/lib/erp/portalStatus";
import { FOLLOW_UP_METHODS, FOLLOW_UP_METHOD_LABELS, type FollowUpMethod } from "@/lib/erp/invoiceFollowUpShared";
import { SHORT_PAY_LABELS, SHORT_PAY_REASONS, type ShortPayReason } from "@/lib/erp/invoiceShortPayShared";

type StatusFilter = "ALL" | "UNPAID" | "OVERDUE" | "PAID" | "PORTAL" | "PROMISE_MISSED";
type Fix = "NEEDS_LINKING" | "MISMATCH" | "NOT_IN_QBO" | "SHORT_PAY";
type Filters = { status: StatusFilter; client: string; from: string; to: string; fix: Fix | null };
const NO_FILTERS: Filters = { status: "ALL", client: "", from: "", to: "", fix: null };

const STATUSES: { key: StatusFilter; label: string; match: (r: InvoiceListRow) => boolean }[] = [
  { key: "ALL", label: "All", match: () => true },
  { key: "UNPAID", label: "Unpaid", match: (r) => r.balanceCents > 0 },
  { key: "OVERDUE", label: "Overdue", match: (r) => r.daysLate > 0 && r.balanceCents > 0 },
  { key: "PAID", label: "Paid", match: (r) => r.balanceCents <= 0 },
  { key: "PROMISE_MISSED", label: "Missed promise", match: (r) => !!r.followUp?.promiseMissed },
  { key: "PORTAL", label: "In portal, not approved", match: (r) => r.balanceCents > 0 && !!r.sent?.portal && r.sent.portal.status !== "APPROVED" },
];
const FIXES: { key: Fix; label: string; hint: string; match: (r: InvoiceListRow) => boolean }[] = [
  { key: "NEEDS_LINKING", label: "Needs linking", hint: "Not tied to any work in the ERP", match: (r) => r.needsLinking },
  { key: "MISMATCH", label: "Paid doesn't match", hint: "The invoice and its lines disagree on paid", match: (r) => !!r.paidMismatch },
  { key: "NOT_IN_QBO", label: "Not in QuickBooks", hint: "HubSpot invoices that never reached QuickBooks", match: (r) => r.status === "NOT_IN_QBO" },
  { key: "SHORT_PAY", label: "Short pay, no reason", hint: "Paid less than the invoice and nobody said why", match: (r) => isShortPaid(r) && !r.shortPay },
];

/** Some of it was paid, not all. */
function isShortPaid(r: InvoiceListRow): boolean {
  return r.balanceCents > 0 && r.balanceCents < r.totalCents;
}
/** ?filter= values from links (dashboard, flow bar, Ready to send) */
const URL_FILTERS: Record<string, Partial<Filters>> = {
  unpaid: { status: "UNPAID" },
  overdue: { status: "OVERDUE" },
  paid: { status: "PAID" },
  portal: { status: "PORTAL" },
  "missed-promise": { status: "PROMISE_MISSED" },
  "short-pay": { fix: "SHORT_PAY" },
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
export function InvoiceList({ rows, showQuickBooks, canEdit }: { rows: InvoiceListRow[]; showQuickBooks: boolean; canEdit: boolean }) {
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
                      {r.balanceCents > 0 &&
                        // One line under the status: missed promise, then why it was paid short, then portal status, then a promise still to come.
                        (r.followUp?.promiseMissed ? (
                          <div className="mt-0.5 whitespace-nowrap text-xs text-red-700">Missed promise {fmtDay(r.followUp.promisedDay)}</div>
                        ) : isShortPaid(r) ? (
                          <div className={`mt-0.5 whitespace-nowrap text-xs ${r.shortPay ? "text-gray-500" : "text-amber-800"}`}>{r.shortPay ? r.shortPay.label : "Short, no reason yet"}</div>
                        ) : r.sent?.portal ? (
                          <div className={`mt-0.5 whitespace-nowrap text-xs ${r.sent.portal.status === "SENT_BACK" ? "text-red-700" : "text-gray-500"}`}>
                            {r.sent.portal.method}: {r.sent.portal.label}
                          </div>
                        ) : r.followUp?.promisedDay ? (
                          <div className="mt-0.5 whitespace-nowrap text-xs text-gray-500">Promised {fmtDay(r.followUp.promisedDay)}</div>
                        ) : null)}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-gray-50">
                      <td colSpan={8} className="px-3 pb-4 pt-1">
                        <InvoiceDetails r={r} showQuickBooks={showQuickBooks} canEdit={canEdit} onLink={() => setLinking(r)} />
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

function InvoiceDetails({ r, showQuickBooks, canEdit, onLink }: { r: InvoiceListRow; showQuickBooks: boolean; canEdit: boolean; onLink: () => void }) {
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
          <div className="font-semibold uppercase tracking-wide text-gray-400">History</div>
          <InvoiceHistory r={r} canEdit={canEdit} />
        </div>
        <div className="space-y-1">
          <div className="font-semibold uppercase tracking-wide text-gray-400">Status and links</div>
          {r.sent?.waiting && <div className="text-amber-800">{r.sent.waiting}</div>}
          {r.balanceCents > 0 && r.followUp && (
            <div className={r.followUp.promiseMissed ? "text-red-700" : "text-gray-700"}>
              Last follow-up {fmtDay(r.followUp.lastDay)} by {r.followUp.lastBy}
              {r.followUp.promisedDay && <div>{r.followUp.promiseMissed ? "Missed promise" : "Promised"} {fmtDay(r.followUp.promisedDay)}</div>}
            </div>
          )}
          {(isShortPaid(r) || r.shortPay) && r.balanceCents > 0 && <ShortPayControl r={r} canEdit={canEdit} />}
          {canEdit && r.balanceCents > 0 && r.number && <LogFollowUp invoiceNumber={r.number} client={r.client} />}
          {r.sent?.portal && <PortalStatusControl deliveryId={r.sent.deliveryId} portal={r.sent.portal} paid={r.balanceCents <= 0} canEdit={canEdit} />}
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

/**
 * Everything that happened to an invoice, oldest first: its date, approval on
 * Ready to send, emailed or uploaded (with proof), portal status changes and
 * payments from QuickBooks.
 */
function InvoiceHistory({ r, canEdit }: { r: InvoiceListRow; canEdit: boolean }) {
  const link = "font-medium text-pink-600 hover:underline";
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();

  async function removeFollowUp(id: string) {
    if (!(await confirm({ title: "Remove this follow-up?", message: "Only for one logged by mistake.", confirmLabel: "Remove", danger: true }))) return;
    const res = await fetch(`/api/erp/invoice-follow-ups/${id}`, { method: "DELETE" });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    toast(res.ok ? "Follow-up removed." : String(data.error ?? "Could not remove."));
    if (res.ok) router.refresh();
  }
  // Day-only entries: the invoice date sorts first on its day, payments last.
  const events: InvoiceEvent[] = [
    ...(r.invoiceDate ? [{ day: r.invoiceDate, sort: "", what: "Invoice dated", by: null, detail: null, proofs: [], tone: null }] : []),
    ...(r.sent?.events ?? []),
    ...r.followUps,
    ...(r.shortPay
      ? [
          {
            day: r.shortPay.day,
            sort: r.shortPay.at,
            what: `Short pay: ${r.shortPay.label}${r.shortPay.amountCents != null ? ` ${centsToDollars(r.shortPay.amountCents)}` : ""}`,
            by: r.shortPay.by,
            detail: r.shortPay.note,
            proofs: [],
            tone: null,
          },
        ]
      : []),
    ...r.payments.map((p) => ({
      day: p.date ?? r.invoiceDate ?? "",
      sort: "~",
      what: `Payment ${centsToDollars(p.cents)}`,
      by: null,
      detail: p.ref,
      proofs: [],
      tone: "good" as const,
    })),
    ...(!r.payments.length && r.paidDate ? [{ day: r.paidDate, sort: "~", what: "Paid", by: null, detail: null, proofs: [], tone: "good" as const }] : []),
  ].sort((a, b) => a.day.localeCompare(b.day) || a.sort.localeCompare(b.sort));

  if (!events.length) return <div className="text-gray-500">Nothing yet</div>;
  return (
    <ol className="space-y-1.5 border-l border-gray-200 pl-3">
      {events.map((e, i) => (
        <li key={i} className="relative">
          <span
            aria-hidden
            className={`absolute -left-[16.5px] top-1 h-2 w-2 rounded-full ${e.tone === "bad" ? "bg-red-500" : e.tone === "good" ? "bg-emerald-500" : "bg-gray-300"}`}
          />
          <div className={e.tone === "bad" ? "text-red-700" : "text-gray-900"}>
            <span className="tabular-nums text-gray-500">{fmtDay(e.day)}</span> · {e.what}
            {e.by && <span className="text-gray-500"> by {e.by}</span>}
            {canEdit && e.followUpId && (
              <button type="button" onClick={() => void removeFollowUp(e.followUpId!)} className="ml-2 text-gray-400 hover:text-red-600" aria-label="Remove follow-up">
                Remove
              </button>
            )}
          </div>
          {(e.detail || e.proofs.length > 0) && (
            <div className="text-gray-500">
              {e.detail}
              {e.proofs.map((p, j) => (
                <a key={p.url} href={p.url} target="_blank" rel="noreferrer" title={p.filename} className={`${link} ${e.detail || j > 0 ? "ml-2" : ""}`}>
                  {e.proofs.length === 1 ? "Proof" : `Proof ${j + 1}`}
                </a>
              ))}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

/** Where the client's portal has an uploaded invoice, and buttons to change it after checking the portal. */
function PortalStatusControl({
  deliveryId,
  portal,
  paid,
  canEdit,
}: {
  deliveryId: string;
  portal: NonNullable<NonNullable<InvoiceListRow["sent"]>["portal"]>;
  paid: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [sendingBack, setSendingBack] = useState(false);
  const [reason, setReason] = useState("");

  async function save(status: PortalStatus, note: string | null) {
    setSaving(true);
    const res = await fetch(`/api/erp/invoice-deliveries/${deliveryId}/portal-status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, note }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    setSaving(false);
    if (!res.ok) {
      toast(String(data.error ?? "Could not save."));
      return;
    }
    toast(status === "SENT_BACK" ? "Marked sent back. It's on Ready to send to resubmit." : `Marked ${PORTAL_STATUS_LABELS[status].toLowerCase()}.`);
    setSendingBack(false);
    setReason("");
    router.refresh();
  }

  const at = portal.at ? new Date(portal.at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null;
  const tone = portal.status === "SENT_BACK" ? "text-red-700" : portal.status === "APPROVED" ? "text-emerald-700" : "text-gray-700";
  // Sent back is fixed with Resubmit on Ready to send, not here.
  const choices = paid || portal.status === "SENT_BACK" ? [] : PORTAL_PICKABLE.filter((s) => s !== portal.status);

  return (
    <div className="space-y-1">
      <div className={tone}>
        {portal.method}: <span className="font-medium">{portal.label}</span>
        {at ? ` ${at}` : ""}
        {portal.status === "SENT_BACK" && portal.reason && <div className="text-red-700">{portal.reason}</div>}
        {portal.status === "SENT_BACK" && (
          <a href="/erp/ready-to-send" className="font-medium text-pink-600 hover:underline">
            Resubmit on Ready to send
          </a>
        )}
      </div>
      {canEdit && choices.length > 0 && !sendingBack && (
        <div className="flex flex-wrap gap-1.5">
          {choices.map((s) => (
            <button
              key={s}
              type="button"
              disabled={saving}
              onClick={() => (s === "SENT_BACK" ? setSendingBack(true) : void save(s, null))}
              className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {PORTAL_STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      )}
      {sendingBack && (
        <div className="space-y-1.5">
          <textarea
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={1000}
            rows={2}
            placeholder="Why they sent it back, e.g. Wrong retainage amount"
            className={`${inputClass.sm} w-full`}
          />
          <div className="flex gap-1.5">
            <Button size="xs" disabled={saving || !reason.trim()} onClick={() => void save("SENT_BACK", reason.trim())}>
              Mark sent back
            </Button>
            <Button size="xs" variant="secondary" disabled={saving} onClick={() => setSendingBack(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Log follow-up: how we chased an unpaid invoice, who we spoke to, what they said, and when they promised to pay. */
function LogFollowUp({ invoiceNumber, client }: { invoiceNumber: string; client: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<FollowUpMethod>("EMAIL");
  const [contactName, setContactName] = useState("");
  const [note, setNote] = useState("");
  const [promisedDate, setPromisedDate] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const res = await fetch("/api/erp/invoice-follow-ups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoiceNumber, method, contactName, note, promisedDate }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    setSaving(false);
    if (!res.ok) {
      toast(String(data.error ?? "Could not save."));
      return;
    }
    toast("Follow-up logged.");
    setOpen(false);
    setContactName("");
    setNote("");
    setPromisedDate("");
    router.refresh();
  }

  return (
    <>
      <div>
        <Button size="xs" variant="secondary" onClick={() => setOpen(true)}>
          Log follow-up
        </Button>
      </div>
      {open && (
        <Modal open onClose={() => setOpen(false)} dismissible={!saving} size="sm">
          <h3 className="text-base font-semibold text-gray-900">Follow-up on {invoiceNumber}</h3>
          {client && <p className="mt-1 text-xs text-gray-500">{client}</p>}
          <div className="mt-4 space-y-3">
            <div>
              <span className={labelClass.default}>How</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {FOLLOW_UP_METHODS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMethod(m)}
                    className={`rounded-full border px-2.5 py-1 text-xs ${method === m ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"}`}
                  >
                    {FOLLOW_UP_METHOD_LABELS[m]}
                  </button>
                ))}
              </div>
            </div>
            <label className={labelClass.default}>
              Who you spoke to
              <input value={contactName} onChange={(e) => setContactName(e.target.value)} maxLength={200} placeholder="e.g. Maria in AP" className={`${inputClass.md} mt-1 w-full`} />
            </label>
            <label className={labelClass.default}>
              What they said
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={2000}
                rows={3}
                placeholder="e.g. Check goes out Friday, waiting on owner approval"
                className={`${inputClass.md} mt-1 w-full`}
              />
            </label>
            <label className={labelClass.default}>
              Promised to pay by
              <input type="date" value={promisedDate} onChange={(e) => setPromisedDate(e.target.value)} className={`${inputClass.md} mt-1 w-full`} />
            </label>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" disabled={saving || !note.trim()} onClick={() => void save()}>
              {saving ? "Saving..." : "Log follow-up"}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}

/** Why the client paid less than the invoice: shown on the invoice, with Explain / Edit for Admins and the Business Manager. */
function ShortPayControl({ r, canEdit }: { r: InvoiceListRow; canEdit: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ShortPayReason>(r.shortPay?.reason ?? "RETAINAGE");
  const [amount, setAmount] = useState(((r.shortPay?.amountCents ?? r.balanceCents) / 100).toFixed(2));
  const [note, setNote] = useState(r.shortPay?.note ?? "");
  const [saving, setSaving] = useState(false);
  const amountCents = parseMoneyInput(amount);
  const ready = !!amountCents && amountCents > 0 && (reason !== "OTHER" || !!note.trim());

  async function save() {
    setSaving(true);
    const res = await fetch("/api/erp/invoice-short-pays", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      // The whole balance is saved as null, so it keeps matching if QuickBooks' balance moves.
      body: JSON.stringify({ invoiceNumber: r.number, reason, amountCents: amountCents === r.balanceCents ? null : amountCents, note }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    setSaving(false);
    if (!res.ok) {
      toast(String(data.error ?? "Could not save."));
      return;
    }
    toast("Saved.");
    setOpen(false);
    router.refresh();
  }

  async function clear() {
    if (!(await confirm({ title: "Clear the short pay reason?", message: "The invoice goes back to Short pay, no reason.", confirmLabel: "Clear", danger: true }))) return;
    const res = await fetch(`/api/erp/invoice-short-pays?invoiceNumber=${encodeURIComponent(r.number ?? "")}`, { method: "DELETE" });
    toast(res.ok ? "Cleared." : "Could not clear.");
    if (res.ok) {
      setOpen(false);
      router.refresh();
    }
  }

  const sp = r.shortPay;
  return (
    <div className="space-y-1">
      {sp ? (
        <div className="text-gray-700">
          <span className="font-medium">{sp.label}</span>: {centsToDollars(sp.amountCents ?? r.balanceCents)} of {centsToDollars(r.balanceCents)} open
          {sp.note && <div className="text-gray-500">{sp.note}</div>}
        </div>
      ) : (
        <div className="text-amber-800">Paid {centsToDollars(r.totalCents - r.balanceCents)} of {centsToDollars(r.totalCents)}. Why short?</div>
      )}
      {canEdit && r.number && (
        <Button size="xs" variant="secondary" onClick={() => setOpen(true)}>
          {sp ? "Edit short pay" : "Explain short pay"}
        </Button>
      )}
      {open && (
        <Modal open onClose={() => setOpen(false)} dismissible={!saving} size="sm">
          <h3 className="text-base font-semibold text-gray-900">Why {r.number} was paid short</h3>
          <p className="mt-1 text-xs text-gray-500">
            Paid {centsToDollars(r.totalCents - r.balanceCents)} of {centsToDollars(r.totalCents)}, {centsToDollars(r.balanceCents)} open.
          </p>
          <div className="mt-4 space-y-3">
            <div>
              <span className={labelClass.default}>Why</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {SHORT_PAY_REASONS.map((x) => (
                  <button
                    key={x}
                    type="button"
                    onClick={() => setReason(x)}
                    className={`rounded-full border px-2.5 py-1 text-xs ${reason === x ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"}`}
                  >
                    {SHORT_PAY_LABELS[x]}
                  </button>
                ))}
              </div>
            </div>
            <label className={labelClass.default}>
              Amount
              <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className={`${inputClass.md} mt-1 w-full`} />
            </label>
            <label className={labelClass.default}>
              Note
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={2000}
                rows={2}
                placeholder={reason === "RETAINAGE" ? "e.g. 10% held until the job closes" : reason === "BACK_CHARGE" ? "e.g. Charged us for the dumpster" : "What happened"}
                className={`${inputClass.md} mt-1 w-full`}
              />
            </label>
          </div>
          <div className="mt-5 flex items-center justify-between gap-2">
            {sp ? (
              <button type="button" onClick={() => void clear()} disabled={saving} className="text-xs text-gray-500 hover:text-red-600">
                Clear
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button size="sm" disabled={!ready || saving} onClick={() => void save()}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
