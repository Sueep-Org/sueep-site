"use client";

import { useCallback, useEffect, useState } from "react";
import { centsToDollars } from "@/lib/erp/money";
import { InfoTip } from "@/app/erp/components/ui";
import { InvoiceLinkModal, type LinkTarget } from "@/app/erp/components/InvoiceLinkModal";

type LineItem = { id: string; name: string; amountCents: number | null };

type Invoice = {
  id: string;
  number: string | null;
  status: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  paidDate: string | null;
  billedCents: number | null;
  balanceDueCents: number | null;
  viewUrl: string | null;
  /** Units (building) or SOV items / change orders (project) this invoice is
   * linked to, automatically or by hand. */
  links: InvoiceLink[];
  lineItems: LineItem[];
};

type InvoiceLink = { targetId: string | null; label: string; amountCents: number; manual: boolean; linkedByName: string | null };

type Quote = {
  id: string;
  title: string | null;
  number: string | null;
  status: string | null;
  signed: boolean;
  awaitingSignature: boolean;
  amountCents: number | null;
  createdDate: string | null;
  expirationDate: string | null;
  viewUrl: string | null;
  lineItems: LineItem[];
};

/** Projects only: does the contract match any quote on the deal? */
type ContractCheck = {
  contractCents: number;
  /** Title of the quote whose total (with or without tax) equals the contract, if any. */
  matchingQuoteTitle: string | null;
  matchingQuoteIsDraft: boolean;
};

type Data = {
  dealId: string | null;
  invoices: Invoice[];
  quotes: Quote[];
  quotesError: string | null;
  contractCheck?: ContractCheck | null;
  /** What invoices can be linked to here. No targets = nothing to link (e.g. a project with no SOV). */
  link: { scope: "building" | "project"; ownerId: string; targets: LinkTarget[] };
};

// HubSpot stores invoice/due dates as end-of-day Eastern in UTC, so format in Eastern.
function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });
}

function money(cents: number | null): string {
  return cents == null ? "" : centsToDollars(cents);
}

const INVOICE_STATUS: Record<string, { label: string; cls: string }> = {
  paid: { label: "Paid", cls: "bg-green-100 text-green-800" },
  open: { label: "Open", cls: "bg-blue-100 text-blue-800" },
  draft: { label: "Draft", cls: "bg-gray-100 text-gray-700" },
  voided: { label: "Voided", cls: "bg-gray-100 text-gray-500 line-through" },
};

function invoiceBadge(inv: Invoice) {
  const overdue = inv.status === "open" && inv.dueDate && new Date(inv.dueDate).getTime() < Date.now();
  const s = overdue ? { label: "Overdue", cls: "bg-red-100 text-red-800" } : INVOICE_STATUS[inv.status ?? ""] ?? { label: inv.status ?? "Unknown", cls: "bg-gray-100 text-gray-700" };
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>;
}

function quoteBadge(q: Quote) {
  const s = q.signed
    ? { label: "Signed", cls: "bg-green-100 text-green-800" }
    : q.status === "EXPIRED"
      ? { label: "Expired", cls: "bg-gray-100 text-gray-500" }
      : q.status === "DRAFT"
        ? { label: "Draft", cls: "bg-gray-100 text-gray-700" }
        : q.awaitingSignature
          ? { label: "Awaiting signature", cls: "bg-amber-100 text-amber-800" }
          : q.status === "PUBLISHED"
            ? { label: "Sent", cls: "bg-blue-100 text-blue-800" }
            : { label: q.status ?? "Unknown", cls: "bg-gray-100 text-gray-700" };
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>;
}

function ViewLink({ url }: { url: string | null }) {
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="whitespace-nowrap text-pink-600 hover:underline">
      View
    </a>
  );
}

function LinkedTo({ inv, onEdit }: { inv: Invoice; onEdit: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {inv.links.length === 0 ? (
        inv.status !== "voided" && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">Not linked</span>
      ) : (
        inv.links.map((l, i) => (
          <span
            key={`${l.targetId}-${i}`}
            title={l.manual ? `Linked by ${l.linkedByName ?? "someone"}` : "Matched automatically"}
            className="max-w-[14rem] truncate rounded bg-pink-50 px-1.5 py-0.5 text-xs font-medium text-pink-700"
          >
            {l.label}
            {inv.links.length > 1 && <span className="font-normal text-pink-500"> · {money(l.amountCents)}</span>}
          </span>
        ))
      )}
      <button type="button" onClick={onEdit} className="text-xs text-gray-500 hover:text-pink-600 hover:underline">
        {inv.links.length === 0 ? "Link" : "Edit"}
      </button>
    </div>
  );
}

function LineItems({ items }: { items: LineItem[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="mt-1 space-y-0.5 text-xs text-gray-500">
      {items.map((li) => (
        <li key={li.id} className="max-w-xl truncate" title={li.name}>
          {li.name}
          {li.amountCents != null && <span className="text-gray-400"> · {money(li.amountCents)}</span>}
        </li>
      ))}
    </ul>
  );
}

/** Invoices and quotes on a building's or project's HubSpot deal, loaded
 * when the tab opens. `endpoint` is that record's hubspot-documents route. */
export function HubSpotDocumentsSection({
  endpoint,
  noDealMessage,
  invoicesInfo,
}: {
  endpoint: string;
  noDealMessage: string;
  invoicesInfo: string;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [linking, setLinking] = useState<Invoice | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(endpoint);
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
    return body as Data;
  }, [endpoint]);

  useEffect(() => {
    let cancelled = false;
    load()
      .then((d) => { if (!cancelled) setData(d); })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); });
    return () => {
      cancelled = true;
    };
  }, [load]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return <p className="text-sm text-gray-500">Loading from HubSpot...</p>;
  if (!data.dealId) {
    return <p className="text-sm text-gray-600">{noDealMessage}</p>;
  }

  const openBalance = data.invoices
    .filter((i) => i.status === "open")
    .reduce((sum, i) => sum + (i.balanceDueCents ?? 0), 0);

  const check = data.contractCheck;
  const canLink = data.link.targets.length > 0;

  return (
    <div className="space-y-6">
      {check && !data.quotesError && data.quotes.length > 0 && (
        <p
          className={`rounded-md border px-3 py-2 text-sm ${check.matchingQuoteTitle ? "border-green-200 bg-green-50 text-green-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}
        >
          {check.matchingQuoteTitle
            ? `Contract ${money(check.contractCents)} matches ${check.matchingQuoteIsDraft ? "draft " : ""}quote "${check.matchingQuoteTitle}".`
            : `Contract ${money(check.contractCents)} doesn't match any quote on this deal.`}
        </p>
      )}
      <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <header className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <h3 className="flex items-center gap-1 text-sm font-semibold text-gray-900">
            Invoices
            <InfoTip text={invoicesInfo} />
          </h3>
          {openBalance > 0 && <span className="text-sm text-gray-600">Open balance: <span className="font-semibold text-gray-900">{money(openBalance)}</span></span>}
        </header>
        {data.invoices.length === 0 ? (
          <p className="px-4 py-3 text-sm text-gray-500">No invoices on this deal.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-2">Invoice</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Due / Paid</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                  <th className="px-4 py-2 text-right">Balance</th>
                  {canLink && <th className="px-4 py-2">Linked to</th>}
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.invoices.map((inv) => (
                  <tr key={inv.id} className="align-top">
                    <td className="px-4 py-2">
                      <div className="font-medium text-gray-900">{inv.number ?? inv.id}</div>
                      <LineItems items={inv.lineItems} />
                    </td>
                    <td className="px-4 py-2">{invoiceBadge(inv)}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{fmtDate(inv.invoiceDate)}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{inv.status === "paid" ? fmtDate(inv.paidDate) : fmtDate(inv.dueDate)}</td>
                    <td className="px-4 py-2 text-right">{money(inv.billedCents)}</td>
                    <td className="px-4 py-2 text-right">{money(inv.balanceDueCents)}</td>
                    {canLink && (
                      <td className="px-4 py-2">
                        <LinkedTo inv={inv} onEdit={() => setLinking(inv)} />
                      </td>
                    )}
                    <td className="px-4 py-2">
                      <ViewLink url={inv.viewUrl} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <header className="border-b border-gray-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-gray-900">Quotes</h3>
        </header>
        {data.quotesError ? (
          <p className="px-4 py-3 text-sm text-amber-700">{data.quotesError}</p>
        ) : data.quotes.length === 0 ? (
          <p className="px-4 py-3 text-sm text-gray-500">No quotes on this deal.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-2">Quote</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Created</th>
                  <th className="px-4 py-2">Expires</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.quotes.map((q) => (
                  <tr key={q.id} className="align-top">
                    <td className="px-4 py-2">
                      <div className="font-medium text-gray-900">{q.title ?? q.number ?? q.id}</div>
                      <LineItems items={q.lineItems} />
                    </td>
                    <td className="px-4 py-2">{quoteBadge(q)}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{fmtDate(q.createdDate)}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{fmtDate(q.expirationDate)}</td>
                    <td className="px-4 py-2 text-right">{money(q.amountCents)}</td>
                    <td className="px-4 py-2">
                      <ViewLink url={q.viewUrl} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {linking && (
        <InvoiceLinkModal
          open
          onClose={() => setLinking(null)}
          onSaved={() => {
            setLinking(null);
            load().then(setData).catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
          }}
          scope={data.link.scope}
          ownerId={data.link.ownerId}
          invoice={linking}
          targets={data.link.targets}
          existing={linking.links}
        />
      )}
    </div>
  );
}
