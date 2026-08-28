import { hubspotFetch } from "@/lib/hubspot/client";

/**
 * Low-level HubSpot Invoice/line-item API calls, following the same request
 * shapes already used for deals/contacts (dealSearch.ts, syncDealContactsToProject.ts).
 *
 * Object name (`invoices`) and paid-status property (`hs_invoice_status` =
 * "paid") confirmed directly against the live HubSpot account, including the
 * exact search filter shape used below and invoice -> deal / line-item
 * associations. Requires the `crm.objects.invoices.read` and
 * `crm.objects.line_items.read` private-app scopes.
 */

export type HubSpotInvoiceRecord = {
  id: string;
  properties: Record<string, string | null>;
};

export type HubSpotLineItemRecord = {
  id: string;
  properties: {
    name?: string | null;
    description?: string | null;
    amount?: string | null;
    quantity?: string | null;
  };
};

/** All invoices HubSpot currently considers paid — paginated, since accounts
 * can easily have 100+ paid invoices and a single unpaginated page would
 * silently miss newer ones depending on HubSpot's default sort order (this
 * was a real bug: a brand-new paid test invoice didn't show up in the first
 * 100 results and was never processed). */
export async function searchPaidInvoices(pageSize = 100): Promise<HubSpotInvoiceRecord[]> {
  const results: HubSpotInvoiceRecord[] = [];
  let after: string | undefined;

  do {
    const res = await hubspotFetch("/crm/v3/objects/invoices/search", {
      method: "POST",
      body: JSON.stringify({
        filterGroups: [
          { filters: [{ propertyName: "hs_invoice_status", operator: "EQ", value: "paid" }] },
        ],
        properties: ["hs_invoice_status", "hs_number", "hs_createdate"],
        limit: pageSize,
        ...(after ? { after } : {}),
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HubSpot invoice search failed: ${res.status} ${text}`);
    }
    const data = (await res.json()) as { results?: HubSpotInvoiceRecord[]; paging?: { next?: { after?: string } } };
    results.push(...(data.results ?? []));
    after = data.paging?.next?.after;
  } while (after);

  return results;
}

type HubSpotAssociationPage = {
  results?: Array<{ toObjectId?: number }>;
  paging?: { next?: { after?: string } };
};

async function listAssociatedObjectIds(fromObjectType: string, fromId: string, toObjectType: string): Promise<string[]> {
  const ids: string[] = [];
  let after: string | null = null;

  do {
    const qp = new URLSearchParams({ limit: "100" });
    if (after) qp.set("after", after);
    const res = await hubspotFetch(`/crm/v4/objects/${fromObjectType}/${fromId}/associations/${toObjectType}?${qp.toString()}`);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HubSpot ${fromObjectType}->${toObjectType} associations failed (${res.status}): ${text}`);
    }
    const data = (await res.json()) as HubSpotAssociationPage;
    const pageIds = (data.results || [])
      .map((r) => (typeof r.toObjectId === "number" ? String(r.toObjectId) : null))
      .filter((x): x is string => Boolean(x));
    ids.push(...pageIds);
    after = data.paging?.next?.after || null;
  } while (after);

  return Array.from(new Set(ids));
}

/** The deal this invoice was generated from (a single deal is expected — the
 * first association returned is used if HubSpot ever returns more than one). */
export async function fetchAssociatedDealId(invoiceId: string): Promise<string | null> {
  const ids = await listAssociatedObjectIds("invoices", invoiceId, "deals");
  return ids[0] ?? null;
}

export async function listAssociatedLineItemIds(invoiceId: string): Promise<string[]> {
  return listAssociatedObjectIds("invoices", invoiceId, "line_items");
}

export async function fetchLineItemsByIds(lineItemIds: string[]): Promise<HubSpotLineItemRecord[]> {
  if (lineItemIds.length === 0) return [];
  const res = await hubspotFetch("/crm/v3/objects/line_items/batch/read", {
    method: "POST",
    body: JSON.stringify({
      properties: ["name", "description", "amount", "quantity"],
      inputs: lineItemIds.map((id) => ({ id })),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HubSpot line items batch read failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as { results?: HubSpotLineItemRecord[] };
  return data.results ?? [];
}
