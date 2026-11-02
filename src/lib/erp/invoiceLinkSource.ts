/**
 * Invoice links (HubSpotUnitInvoice, HubSpotSovInvoice, HubSpotContractInvoice)
 * hold invoices from HubSpot and, after the switch, invoices the ERP made in
 * QuickBooks (ERP_QBO_INVOICING_PLAN.md Phase 2). A HubSpot row has
 * hubspotInvoiceId, a QuickBooks row has qboInvoiceId.
 */

/** Where filter for the rows HubSpot syncs and HubSpot-only features may touch. */
export const HUBSPOT_LINKS = { source: "HUBSPOT" } as const;
export const QUICKBOOKS_LINKS = { source: "QUICKBOOKS" } as const;

/** One key per invoice across both systems, for grouping a link's rows. */
export function invoiceKey(l: { hubspotInvoiceId: string | null; qboInvoiceId?: string | null }): string {
  return l.hubspotInvoiceId ?? `qbo:${l.qboInvoiceId ?? ""}`;
}

/** The rows with a HubSpot invoice, typed so, for HubSpot-only features (HubSpot drafts, deal documents). */
export function withHubSpotId<T extends { hubspotInvoiceId: string | null }>(rows: T[]): (T & { hubspotInvoiceId: string })[] {
  return rows.flatMap((r) => (r.hubspotInvoiceId ? [{ ...r, hubspotInvoiceId: r.hubspotInvoiceId }] : []));
}
