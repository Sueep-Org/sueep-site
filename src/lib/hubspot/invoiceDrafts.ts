/**
 * Writing invoices in HubSpot: create a draft, set its lines, open it, or
 * delete it. Drafts never reach QuickBooks; opening one does (HubSpot syncs
 * open invoices), so only the Ready to send page's Approve calls openInvoice.
 * Needs crm.objects.invoices.write and crm.objects.line_items.write.
 */
import { hubspotFetch } from "./client";
import { listAssociatedLineItemIds, listAssociatedObjectIds } from "./invoices";

export class HubSpotWriteError extends Error {}

async function hsJson<T>(path: string, init: RequestInit, what: string): Promise<T> {
  const res = await hubspotFetch(path, init);
  if (!res.ok) {
    const text = await res.text();
    let message = text;
    try {
      message = (JSON.parse(text) as { message?: string }).message ?? text;
    } catch {
      // Not JSON; keep the raw text.
    }
    throw new HubSpotWriteError(`HubSpot ${what} failed (${res.status}): ${message.slice(0, 300)}`);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

/** HubSpot's default association between two records (no type ids needed). */
export async function associateDefault(fromType: string, fromId: string, toType: string, toId: string): Promise<void> {
  await hsJson(`/crm/v4/objects/${fromType}/${fromId}/associations/default/${toType}/${toId}`, { method: "PUT" }, `link ${fromType} to ${toType}`);
}

/** Dates as noon UTC so HubSpot shows the same calendar day in any US zone. */
function dayValue(dateKey: string): string {
  return `${dateKey}T12:00:00.000Z`;
}

export async function createDraftInvoice(input: { invoiceDateKey: string; dueDateKey: string }): Promise<string> {
  const created = await hsJson<{ id: string }>(
    "/crm/v3/objects/invoices",
    {
      method: "POST",
      body: JSON.stringify({
        properties: { hs_currency: "USD", hs_invoice_date: dayValue(input.invoiceDateKey), hs_due_date: dayValue(input.dueDateKey) },
      }),
    },
    "create draft invoice",
  );
  return created.id;
}

export async function setInvoiceDates(invoiceId: string, input: { invoiceDateKey: string; dueDateKey: string }): Promise<void> {
  await hsJson(
    `/crm/v3/objects/invoices/${invoiceId}`,
    { method: "PATCH", body: JSON.stringify({ properties: { hs_invoice_date: dayValue(input.invoiceDateKey), hs_due_date: dayValue(input.dueDateKey) } }) },
    "update invoice dates",
  );
}

export type DraftLine = { name: string; description: string; amountCents: number };

/** Replaces every line on the invoice with these. Only used on drafts. */
export async function replaceInvoiceLines(invoiceId: string, lines: DraftLine[]): Promise<void> {
  for (const id of await listAssociatedLineItemIds(invoiceId)) {
    await hsJson(`/crm/v3/objects/line_items/${id}`, { method: "DELETE" }, "delete line item");
  }
  for (const line of lines) {
    const li = await hsJson<{ id: string }>(
      "/crm/v3/objects/line_items",
      {
        method: "POST",
        body: JSON.stringify({ properties: { name: line.name, description: line.description, quantity: "1", price: (line.amountCents / 100).toFixed(2) } }),
      },
      "create line item",
    );
    await associateDefault("line_items", li.id, "invoices", invoiceId);
  }
}

/** Opens a draft: it gets an invoice number and goes to QuickBooks. */
export async function openInvoice(invoiceId: string): Promise<void> {
  await hsJson(`/crm/v3/objects/invoices/${invoiceId}`, { method: "PATCH", body: JSON.stringify({ properties: { hs_invoice_status: "open" } }) }, "open invoice");
}

/** Deletes a draft and its lines. */
export async function deleteDraftInvoice(invoiceId: string): Promise<void> {
  for (const id of await listAssociatedLineItemIds(invoiceId)) {
    await hsJson(`/crm/v3/objects/line_items/${id}`, { method: "DELETE" }, "delete line item");
  }
  await hsJson(`/crm/v3/objects/invoices/${invoiceId}`, { method: "DELETE" }, "delete invoice");
}

export type InvoiceSnapshot = {
  number: string | null;
  status: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  totalCents: number | null;
  balanceDueCents: number | null;
  viewUrl: string | null;
  pdfUrl: string | null;
};

const cents = (v: string | null | undefined) => (v == null || v === "" ? null : Math.round(Number(v) * 100));

/** The snapshot as the ERP's invoice link columns (HubSpotContractInvoice, HubSpotUnitInvoice, HubSpotSovInvoice). */
export function snapshotColumns(s: InvoiceSnapshot) {
  const d = (v: string | null) => (v ? new Date(v) : null);
  return {
    invoiceNumber: s.number,
    status: s.status,
    invoiceDate: d(s.invoiceDate),
    dueDate: d(s.dueDate),
    invoiceTotalCents: s.totalCents,
    balanceDueCents: s.balanceDueCents,
    viewUrl: s.viewUrl,
    pdfUrl: s.pdfUrl,
  };
}

export async function fetchInvoiceSnapshot(invoiceId: string): Promise<InvoiceSnapshot> {
  const props = ["hs_number", "hs_invoice_status", "hs_invoice_date", "hs_due_date", "hs_amount_billed", "hs_balance_due", "hs_invoice_link", "hs_pdf_download_link"];
  const r = await hsJson<{ properties: Record<string, string | null> }>(
    `/crm/v3/objects/invoices/${invoiceId}?properties=${props.join(",")}`,
    { method: "GET" },
    "read invoice",
  );
  const p = r.properties;
  return {
    number: p.hs_number ?? null,
    status: p.hs_invoice_status ?? null,
    invoiceDate: p.hs_invoice_date ?? null,
    dueDate: p.hs_due_date ?? null,
    totalCents: cents(p.hs_amount_billed),
    balanceDueCents: cents(p.hs_balance_due),
    viewUrl: p.hs_invoice_link ?? null,
    pdfUrl: p.hs_pdf_download_link ?? null,
  };
}

/**
 * Who the invoice is addressed to: the contact and company on the deal's
 * newest invoice, so a draft goes to the same billing person as last time.
 * Falls back to the deal's own first contact and company.
 */
export async function findBillingParties(dealId: string): Promise<{ contactId: string | null; companyId: string | null; from: "last invoice" | "deal" }> {
  const invoiceIds = await listAssociatedObjectIds("deals", dealId, "invoices");
  if (invoiceIds.length) {
    const res = await hsJson<{ results: { id: string; properties: Record<string, string | null> }[] }>(
      "/crm/v3/objects/invoices/batch/read",
      { method: "POST", body: JSON.stringify({ properties: ["hs_invoice_date", "hs_invoice_status"], inputs: invoiceIds.map((id) => ({ id })) }) },
      "read deal invoices",
    );
    const newest = res.results
      .filter((r) => r.properties.hs_invoice_status && r.properties.hs_invoice_status !== "draft")
      .sort((a, b) => (b.properties.hs_invoice_date ?? "").localeCompare(a.properties.hs_invoice_date ?? ""))[0];
    if (newest) {
      const [contacts, companies] = await Promise.all([
        listAssociatedObjectIds("invoices", newest.id, "contacts"),
        listAssociatedObjectIds("invoices", newest.id, "companies"),
      ]);
      if (contacts.length) return { contactId: contacts[0]!, companyId: companies[0] ?? null, from: "last invoice" };
    }
  }
  const [contacts, companies] = await Promise.all([
    listAssociatedObjectIds("deals", dealId, "contacts"),
    listAssociatedObjectIds("deals", dealId, "companies"),
  ]);
  return { contactId: contacts[0] ?? null, companyId: companies[0] ?? null, from: "deal" };
}
