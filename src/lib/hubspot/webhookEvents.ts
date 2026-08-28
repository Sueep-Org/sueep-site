/** Shape of CRM webhook payloads HubSpot POSTs (array of events). */

import { syncHubSpotDealsToProjects } from "./syncDealsToProjects";

export type HubSpotCrmWebhookEvent = {
  eventId: number;
  subscriptionId: number;
  portalId: number;
  occurredAt: number;
  subscriptionType: string;
  attemptNumber: number;
  objectId: number;
  changeSource?: string;
  changeFlag?: string;
  appId?: number;
};

export function parseHubSpotWebhookBody(raw: string): HubSpotCrmWebhookEvent[] | null {
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return null;
    return data as HubSpotCrmWebhookEvent[];
  } catch {
    return null;
  }
}

const DEAL_EVENT_TYPES = new Set([
  "deal.creation",
  "deal.deletion",
  "deal.propertyChange",
  "deal.associationChange",
]);

// Paid-invoice billing sync (processPaidInvoices, in syncInvoicePayments.ts)
// is NOT triggered from here — HubSpot's private-app webhook subscriptions
// don't currently support the Invoice object, so there's no invoice event
// this handler could ever receive. It's driven by a scheduled poll instead,
// see src/app/api/cron/hubspot-invoice-sync/route.ts.

/**
 * Triggered after each verified webhook POST. Runs a full deal→project sync
 * whenever any deal event is present in the batch.
 */
export async function handleHubSpotWebhookEvents(events: HubSpotCrmWebhookEvent[]): Promise<void> {
  const hasDealEvent = events.some((e) => DEAL_EVENT_TYPES.has(e.subscriptionType));

  if (!hasDealEvent) {
    console.info("[hubspot webhook] no deal events in batch, skipping sync", {
      types: [...new Set(events.map((e) => e.subscriptionType))],
    });
    return;
  }

  console.info("[hubspot webhook] deal event received, triggering sync", {
    count: events.length,
    types: [...new Set(events.map((e) => e.subscriptionType))],
  });
  try {
    const result = await syncHubSpotDealsToProjects();
    console.info("[hubspot webhook] deal sync complete", {
      synced: result.synced.length,
      errors: result.errors,
    });
  } catch (e) {
    console.error("[hubspot webhook] deal sync failed", e);
  }
}
