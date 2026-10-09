import { hubspotFetch } from "@/lib/hubspot/client";
import { fetchLineItemsByIds, listAssociatedObjectIds } from "@/lib/hubspot/invoices";
import { combinedLineItemText } from "@/lib/hubspot/billingMatch";

/**
 * Read-only list of the invoices and quotes on one HubSpot deal, with their
 * public view/PDF links, for showing next to a building's turns. Nothing is
 * stored: HubSpot stays the source of truth, so a resent invoice or revised
 * quote shows up on the next load.
 *
 * Invoice property names (hs_invoice_link, hs_pdf_download_link, etc.) were
 * confirmed against the live account. Quotes need the private app's
 * `crm.objects.quotes.read` scope; without it HubSpot returns 403 and
 * quotesError explains that instead of failing the whole request.
 */

export type DealDocumentLineItem = {
  id: string;
  name: string;
  amountCents: number | null;
  /** Normalized name+description, same text the paid-invoice sync matches on. */
  haystack: string;
};

export type DealInvoice = {
  id: string;
  number: string | null;
  /** draft | open | paid | voided (HubSpot's hs_invoice_status) */
  status: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  paidDate: string | null;
  billedCents: number | null;
  balanceDueCents: number | null;
  viewUrl: string | null;
  pdfUrl: string | null;
  lineItems: DealDocumentLineItem[];
};

export type DealQuote = {
  id: string;
  title: string | null;
  number: string | null;
  /** DRAFT | PUBLISHED | EXPIRED (hs_quote_status). hs_status is just the
   * approval workflow and reads APPROVAL_NOT_NEEDED on nearly every quote. */
  status: string | null;
  signed: boolean;
  awaitingSignature: boolean;
  amountCents: number | null;
  createdDate: string | null;
  expirationDate: string | null;
  viewUrl: string | null;
  pdfUrl: string | null;
  lineItems: DealDocumentLineItem[];
};

export type DealDocuments = {
  invoices: DealInvoice[];
  quotes: DealQuote[];
  quotesError: string | null;
};

const INVOICE_PROPERTIES = [
  "hs_number",
  "hs_invoice_status",
  "hs_invoice_date",
  "hs_due_date",
  "hs_payment_date",
  "hs_amount_billed",
  "hs_balance_due",
  "hs_invoice_link",
  "hs_pdf_download_link",
];

const QUOTE_PROPERTIES = [
  "hs_title",
  "hs_quote_number",
  "hs_quote_status",
  "hs_quote_esign_status",
  "hs_manually_signed",
  "hs_quote_amount",
  "hs_createdate",
  "hs_expiration_date",
  "hs_quote_link",
  "hs_pdf_download_link",
];

type HubSpotObject = { id: string; properties: Record<string, string | null> };

function toCents(raw: string | null | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

async function batchRead(objectType: string, ids: string[], properties: string[]): Promise<HubSpotObject[]> {
  if (ids.length === 0) return [];
  const out: HubSpotObject[] = [];
  // HubSpot batch reads cap at 100 inputs.
  for (let i = 0; i < ids.length; i += 100) {
    const res = await hubspotFetch(`/crm/v3/objects/${objectType}/batch/read`, {
      method: "POST",
      body: JSON.stringify({ properties, inputs: ids.slice(i, i + 100).map((id) => ({ id })) }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new HubSpotDocumentsError(res.status, `HubSpot ${objectType} batch read failed (${res.status}): ${text}`);
    }
    const data = (await res.json()) as { results?: HubSpotObject[] };
    out.push(...(data.results ?? []));
  }
  return out;
}

/** Line items for many objects at once: objectId -> line items. */
async function lineItemsFor(objectType: string, objectIds: string[]): Promise<Map<string, DealDocumentLineItem[]>> {
  const byObject = new Map<string, string[]>();
  for (let i = 0; i < objectIds.length; i += 100) {
    const res = await hubspotFetch(`/crm/v4/associations/${objectType}/line_items/batch/read`, {
      method: "POST",
      body: JSON.stringify({ inputs: objectIds.slice(i, i + 100).map((id) => ({ id })) }),
    });
    // 207 = some inputs had no associations, which is fine.
    if (!res.ok && res.status !== 207) continue;
    const data = (await res.json()) as { results?: Array<{ from?: { id?: string }; to?: Array<{ toObjectId?: number }> }> };
    for (const r of data.results ?? []) {
      if (!r.from?.id) continue;
      byObject.set(r.from.id, (r.to ?? []).map((t) => String(t.toObjectId)).filter(Boolean));
    }
  }

  const allIds = Array.from(new Set(Array.from(byObject.values()).flat()));
  const items = new Map<string, DealDocumentLineItem>();
  for (let i = 0; i < allIds.length; i += 100) {
    for (const li of await fetchLineItemsByIds(allIds.slice(i, i + 100))) {
      const name = [li.properties.name, li.properties.description]
        .map((s) => s?.replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .join(" - ");
      items.set(li.id, {
        id: li.id,
        name: name || "(no name)",
        amountCents: toCents(li.properties.amount),
        haystack: combinedLineItemText(li.properties.name ?? "", li.properties.description),
      });
    }
  }

  const out = new Map<string, DealDocumentLineItem[]>();
  for (const [objectId, ids] of byObject) {
    out.set(objectId, ids.map((id) => items.get(id)).filter((x): x is DealDocumentLineItem => Boolean(x)));
  }
  return out;
}

export class HubSpotDocumentsError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const newestFirst = (a: string | null, b: string | null) => (b ?? "").localeCompare(a ?? "");

export async function fetchDealInvoices(dealId: string): Promise<DealInvoice[]> {
  const ids = await listAssociatedObjectIds("deals", dealId, "invoices");
  const records = await batchRead("invoices", ids, INVOICE_PROPERTIES);
  const lineItems = await lineItemsFor("invoices", records.map((r) => r.id));
  return records
    .map((r) => {
      const p = r.properties;
      return {
        id: r.id,
        number: p.hs_number ?? null,
        status: p.hs_invoice_status ?? null,
        invoiceDate: p.hs_invoice_date ?? null,
        dueDate: p.hs_due_date ?? null,
        paidDate: p.hs_payment_date ?? null,
        billedCents: toCents(p.hs_amount_billed),
        balanceDueCents: toCents(p.hs_balance_due),
        viewUrl: p.hs_invoice_link ?? null,
        pdfUrl: p.hs_pdf_download_link ?? null,
        lineItems: lineItems.get(r.id) ?? [],
      };
    })
    .sort((a, b) => newestFirst(a.invoiceDate, b.invoiceDate));
}

async function fetchQuotes(dealId: string): Promise<DealQuote[]> {
  const ids = await listAssociatedObjectIds("deals", dealId, "quotes");
  const records = await batchRead("quotes", ids, QUOTE_PROPERTIES);
  const lineItems = await lineItemsFor("quotes", records.map((r) => r.id));
  return records
    .map((r) => {
      const p = r.properties;
      return {
        id: r.id,
        title: p.hs_title ?? null,
        number: p.hs_quote_number ?? null,
        status: p.hs_quote_status ?? null,
        signed: p.hs_quote_esign_status === "SIGNED" || p.hs_manually_signed === "true",
        awaitingSignature: p.hs_quote_esign_status === "PENDING_SIGNATURE",
        amountCents: toCents(p.hs_quote_amount),
        createdDate: p.hs_createdate ?? null,
        expirationDate: p.hs_expiration_date ?? null,
        viewUrl: p.hs_quote_link ?? null,
        pdfUrl: p.hs_pdf_download_link ?? null,
        lineItems: lineItems.get(r.id) ?? [],
      };
    })
    .sort((a, b) => newestFirst(a.createdDate, b.createdDate));
}

export async function fetchDealDocuments(dealId: string): Promise<DealDocuments> {
  const [invoices, quotesResult] = await Promise.all([
    fetchDealInvoices(dealId),
    fetchQuotes(dealId).then(
      (quotes) => ({ quotes, error: null as string | null }),
      (err: unknown) => {
        const missingScope = /\(403\)|MISSING_SCOPES|quote-read|quote-access/i.test(String(err));
        return {
          quotes: [] as DealQuote[],
          error: missingScope
            ? "Quotes need the crm.objects.quotes.read scope on the HubSpot private app."
            : `Could not load quotes: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    ),
  ]);
  return { invoices, quotes: quotesResult.quotes, quotesError: quotesResult.error };
}
