/**
 * HubSpot deals with the ERP's own recent changes on top. The HubSpot read is
 * cached for an hour (postConDeals.ts), so lost reasons, Mark lost, Edit info,
 * stage moves and new deals made in the ERP since that read are applied here.
 * Every page that shows deals loads them through this, so a change shows
 * everywhere at once (board, Win/Loss, dashboard cards, emails), not after the refresh.
 */
import { loadDealBundle, loadJanitorialDealBundle, type Bundle, type PipelineKey } from "./postConDeals";
import { lostChangesSince } from "./dealLostReasons";
import { infoChangesSince } from "./dealInfo";
import { createdDealsMissing } from "./dealCreate";

/** Applies ERP changes made after `bundle.fetchedAt`, oldest first. */
export async function applyErpEdits(cached: Bundle, pipeline: PipelineKey): Promise<Bundle> {
  const [lost, info, added] = await Promise.all([
    lostChangesSince(pipeline, cached.fetchedAt),
    infoChangesSince(pipeline, cached.fetchedAt),
    createdDealsMissing(pipeline, cached.fetchedAt, new Set(cached.deals.map((d) => d.id))),
  ]);
  // Deals made with New deal go in first, so edits made to them since apply too.
  const bundle = added.length ? { ...cached, deals: [...cached.deals, ...added] } : cached;
  if (!lost.length && !info.length) return bundle;
  const lostOf = new Map(lost.map((c) => [c.hubspotDealId, c]));
  const infoOf = new Map<string, typeof info>();
  for (const e of info) infoOf.set(e.hubspotDealId, [...(infoOf.get(e.hubspotDealId) ?? []), e]);
  return {
    ...bundle,
    deals: bundle.deals.map((d) => {
      let next = d;
      const c = lostOf.get(d.id);
      if (c) next = { ...next, stageId: c.toStageId, lostReason: c.reasons.join(";"), lastActivity: c.createdAt.toISOString() };
      for (const e of infoOf.get(d.id) ?? []) {
        const v = e.toValue;
        if (e.property === "hubspot_owner_id") next = { ...next, ownerId: v || null };
        else if (e.property === "company") next = { ...next, company: v || null };
        else if (e.property === "bid_date") next = { ...next, bidDate: v || null };
        else if (e.property === "completion_date") next = { ...next, walkDate: v || null };
        else if (e.property === "amount") next = { ...next, cents: v ? Math.round(Number(v) * 100) : 0 };
        else if (e.property === "area_sqft") next = { ...next, sqft: v && Number(v) > 0 ? Number(v) : null };
        else if (e.property === "dealstage") next = { ...next, stageId: v, stageEnteredAt: e.createdAt.toISOString(), lastActivity: e.createdAt.toISOString() };
      }
      return next;
    }),
  };
}

/** Post-construction deals, as HubSpot has them plus the ERP's recent changes. */
export async function loadDeals(): Promise<Bundle> {
  return applyErpEdits(await loadDealBundle(), "post-con");
}

/** Janitorial deals, the same way. */
export async function loadJanitorialDeals(): Promise<Bundle> {
  return applyErpEdits(await loadJanitorialDealBundle(), "janitorial");
}

export function loadDealsFor(pipeline: PipelineKey): Promise<Bundle> {
  return pipeline === "janitorial" ? loadJanitorialDeals() : loadDeals();
}
