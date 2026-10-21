/**
 * Post-construction deals read live from HubSpot, shared by Win/loss, the
 * quote price check, the bid cards, the pipeline board and the Management
 * calendar's Bids. Janitorial deals load the same way, for the pipeline board
 * only. The ERP deletes lost deals on sync, so HubSpot is the only place that
 * has them.
 * Cached for an hour.
 *
 * - Won: Quote Approved or any later stage (same rule as the dashboard's Wins
 *   tab, dashboardWins.ts). Lost: Deal Lost. Everything else is open.
 * - Type of work: from the deal's line items (copied from its quote): painting
 *   words, cleaning words, or both. No line items: HubSpot's Type of business.
 *   Neither: unknown, kept as its own group.
 * - Amounts: a won deal that is an ERP project can use the project's contract
 *   value (withErpWonAmounts); HubSpot's Amount is often stale on those.
 */
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { hubspotFetch } from "@/lib/hubspot/client";
import { loadRules } from "@/lib/hubspot/pipelineRules";

const CACHE_SECONDS = 3600;

export type RawDeal = {
  id: string;
  name: string;
  stageId: string;
  cents: number;
  created: string;
  ownerId: string | null;
  company: string | null;
  lostReason: string | null;
  source: string | null;
  sqft: number | null;
  lastActivity: string | null;
  scope: WorkScope;
  /** HubSpot Bid Date, Job Walk Date and Award Date ("YYYY-MM-DD"), for the Management calendar's Bids category */
  bidDate: string | null;
  walkDate: string | null;
  /** When the GC expects to award the job (HubSpot award_date). Optional so older cached bundles still read. */
  awardDate?: string | null;
  /** When the deal entered its current stage (HubSpot hs_v2_date_entered_<stage>), for days in stage */
  stageEnteredAt: string | null;
};

export const WORK_SCOPES = ["CLEANING", "PAINTING", "BOTH", "UNKNOWN"] as const;
export type WorkScope = (typeof WORK_SCOPES)[number];
export const WORK_SCOPE_LABELS: Record<WorkScope, string> = {
  CLEANING: "Cleaning",
  PAINTING: "Painting",
  BOTH: "Cleaning + painting",
  UNKNOWN: "Not known",
};

const PAINT_WORDS = /\b(paint\w*|primer|prime|coats?|stain\w*|drywall|caulk\w*)\b/i;
const CLEAN_WORDS = /\b(clean\w*|wash\w*|rough|final|windows?|janitor\w*|sweep\w*|debris|scrub\w*|mop\w*|pressure)\b/i;

/** Painting, cleaning or both, from line item text; null when the text says neither. */
export function scopeFromText(text: string): WorkScope | null {
  const p = PAINT_WORDS.test(text), c = CLEAN_WORDS.test(text);
  return p && c ? "BOTH" : p ? "PAINTING" : c ? "CLEANING" : null;
}

/** HubSpot's Type of business values, for deals without line items. */
export function scopeFromTypeOfBusiness(v: string | null): WorkScope | null {
  if (!v) return null;
  if (/\+|cleaning and painting/i.test(v)) return "BOTH";
  return /paint/i.test(v) ? "PAINTING" : /clean/i.test(v) ? "CLEANING" : null;
}

export type Bundle = {
  deals: RawDeal[];
  won: string[];
  lost: string[];
  /** Quote Sent through the last stage before won */
  quoting: string[];
  stageLabels: Record<string, string>;
  /** Every stage id in HubSpot's board order, for the pipeline board */
  stageOrder: string[];
  owners: Record<string, string>;
  /** HubSpot owner id to lowercase email, for matching owners to ERP logins */
  ownerEmails: Record<string, string>;
  hubId: string | null;
  fetchedAt: string;
};

const PROPS = ["dealname", "dealstage", "amount", "createdate", "hubspot_owner_id", "company", "deal_lost_reason", "how_the_customer_reach_sueep", "area_sqft", "notes_last_updated", "hs_lastmodifieddate", "type_of_business", "bid_date", "completion_date", "award_date"];

async function searchAll(pipelineId: string, stageIds: string[]): Promise<RawDeal[]> {
  // HubSpot keeps one "date entered" property per stage; the old hs_date_entered_ names come back empty.
  const enteredProps = stageIds.map((id) => `hs_v2_date_entered_${id}`);
  const out: RawDeal[] = [];
  let after: string | undefined;
  for (let page = 0; page < 60; page++) {
    const res = await hubspotFetch("/crm/v3/objects/deals/search", {
      method: "POST",
      body: JSON.stringify({
        filterGroups: [{ filters: [{ propertyName: "pipeline", operator: "EQ", value: pipelineId }] }],
        properties: [...PROPS, ...enteredProps],
        sorts: [{ propertyName: "createdate", direction: "ASCENDING" }],
        limit: 200,
        ...(after ? { after } : {}),
      }),
    });
    if (!res.ok) throw new Error(`HubSpot deal search failed: ${res.status}`);
    const data = (await res.json()) as { results?: { id: string; properties: Record<string, string | null> }[]; paging?: { next?: { after?: string } } };
    for (const d of data.results ?? []) {
      const p = d.properties;
      const sqft = Number(p.area_sqft);
      out.push({
        id: d.id,
        name: p.dealname ?? "(no name)",
        stageId: p.dealstage ?? "",
        cents: Math.round(Number(p.amount ?? 0) * 100) || 0,
        created: p.createdate ?? "",
        ownerId: p.hubspot_owner_id ?? null,
        company: p.company?.trim() || null,
        lostReason: p.deal_lost_reason?.trim() || null,
        source: p.how_the_customer_reach_sueep?.trim() || null,
        sqft: Number.isFinite(sqft) && sqft > 0 ? sqft : null,
        lastActivity: p.notes_last_updated ?? p.hs_lastmodifieddate ?? null,
        // Filled in from line items in computeBundle; Type of business is the fallback.
        scope: scopeFromTypeOfBusiness(p.type_of_business ?? null) ?? "UNKNOWN",
        bidDate: p.bid_date?.slice(0, 10) || null,
        // HubSpot's "Job Walk Date" lives in a property named completion_date.
        walkDate: p.completion_date?.slice(0, 10) || null,
        awardDate: p.award_date?.slice(0, 10) || null,
        stageEnteredAt: (p.dealstage && p[`hs_v2_date_entered_${p.dealstage}`]) || null,
      });
    }
    after = data.paging?.next?.after;
    if (!after) break;
  }
  return out;
}

/** Every deal's line item text, in a few batch calls (associations, then the items). */
async function loadLineItemText(dealIds: string[]): Promise<Map<string, string>> {
  const itemsByDeal = new Map<string, string[]>();
  for (let i = 0; i < dealIds.length; i += 500) {
    const res = await hubspotFetch("/crm/v4/associations/deals/line_items/batch/read", {
      method: "POST",
      body: JSON.stringify({ inputs: dealIds.slice(i, i + 500).map((id) => ({ id })) }),
    });
    if (!res.ok) throw new Error(`HubSpot line item links failed: ${res.status}`);
    const data = (await res.json()) as { results?: { from: { id: string }; to: { toObjectId: number | string }[] }[] };
    for (const r of data.results ?? []) itemsByDeal.set(String(r.from.id), r.to.map((t) => String(t.toObjectId)));
  }
  const allItems = [...new Set([...itemsByDeal.values()].flat())];
  const textByItem = new Map<string, string>();
  for (let i = 0; i < allItems.length; i += 100) {
    const res = await hubspotFetch("/crm/v3/objects/line_items/batch/read", {
      method: "POST",
      body: JSON.stringify({ properties: ["name", "description"], inputs: allItems.slice(i, i + 100).map((id) => ({ id })) }),
    });
    if (!res.ok) throw new Error(`HubSpot line items failed: ${res.status}`);
    const data = (await res.json()) as { results?: { id: string; properties: Record<string, string | null> }[] };
    for (const li of data.results ?? []) textByItem.set(li.id, `${li.properties.name ?? ""} ${li.properties.description ?? ""}`);
  }
  return new Map([...itemsByDeal].map(([deal, items]) => [deal, items.map((id) => textByItem.get(id) ?? "").join(" | ")]));
}

/**
 * Every HubSpot owner, including archived ones (people who left still own
 * old deals), marked "(inactive)". Only current owners' emails are kept,
 * for matching logins.
 */
async function loadOwners(): Promise<{ owners: Record<string, string>; ownerEmails: Record<string, string> }> {
  const owners: Record<string, string> = {};
  const ownerEmails: Record<string, string> = {};
  for (const archived of [false, true]) {
    let after: string | undefined;
    for (let page = 0; page < 10; page++) {
      const res = await hubspotFetch(`/crm/v3/owners?limit=100&archived=${archived}${after ? `&after=${after}` : ""}`);
      if (!res.ok) break;
      const data = (await res.json()) as { results?: { id: string; firstName?: string; lastName?: string; email?: string }[]; paging?: { next?: { after?: string } } };
      for (const o of data.results ?? []) {
        if (owners[o.id]) continue;
        const name = `${o.firstName ?? ""} ${o.lastName ?? ""}`.trim() || o.email || o.id;
        owners[o.id] = archived ? `${name} (inactive)` : name;
        if (o.email && !archived) ownerEmails[o.id] = o.email.toLowerCase();
      }
      after = data.paging?.next?.after;
      if (!after) break;
    }
  }
  return { owners, ownerEmails };
}

/** Our HubSpot account id, for links to deals. */
async function loadHubId(): Promise<string | null> {
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) return null;
  const res = await fetch("https://api.hubapi.com/oauth/v2/private-apps/get/access-token-info", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tokenKey: token }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { hubId?: number };
  return data.hubId ? String(data.hubId) : null;
}

export type PipelineKey = "post-con" | "janitorial";

/** Post-construction unless told otherwise. Janitorial is only used by the pipeline board. */
export async function computeBundle(key: PipelineKey = "post-con"): Promise<Bundle> {
  const rules = (await loadRules()).find((r) => r.key === key);
  if (!rules) throw new Error(`${key === "janitorial" ? "Janitorial" : "Post-construction"} pipeline not found`);
  // Throwing (not returning a half-empty bundle) keeps a HubSpot hiccup out of the hour-long cache.
  const res = await hubspotFetch("/crm/v3/pipelines/deals");
  if (!res.ok) throw new Error(`HubSpot pipelines failed: ${res.status}`);
  const pipes = (await res.json()) as { results?: { id: string; stages?: { id: string; label: string; displayOrder: number }[] }[] };
  const stages = (pipes.results ?? []).find((p) => p.id === rules.pipelineId)?.stages ?? [];
  const wonOrders = stages.filter((s) => rules.won.has(s.id)).map((s) => s.displayOrder);
  if (!wonOrders.length) throw new Error(`No won stage found in the ${rules.label.toLowerCase()} pipeline. Check HUBSPOT_PIPELINE_STAGE_MAP against HubSpot's stages.`);
  const firstWon = Math.min(...wonOrders);
  const quoteStart = stages.find((s) => s.id === rules.quoteStageId)?.displayOrder ?? stages.find((s) => /quote sent/i.test(s.label))?.displayOrder ?? firstWon;
  const quoting = stages.filter((s) => s.displayOrder >= quoteStart && s.displayOrder < firstWon && !rules.lost.has(s.id)).map((s) => s.id);
  const [found, { owners, ownerEmails }, hubId] = await Promise.all([searchAll(rules.pipelineId, stages.map((s) => s.id)), loadOwners(), loadHubId()]);
  const lineText = await loadLineItemText(found.map((d) => d.id));
  const deals = found.map((d) => ({ ...d, scope: scopeFromText(lineText.get(d.id) ?? "") ?? d.scope }));
  return {
    deals,
    won: [...rules.won],
    lost: [...rules.lost],
    quoting,
    stageLabels: Object.fromEntries(stages.map((s) => [s.id, s.label])),
    stageOrder: [...stages].sort((a, b) => a.displayOrder - b.displayOrder).map((s) => s.id),
    owners,
    ownerEmails,
    hubId,
    fetchedAt: new Date().toISOString(),
  };
}

/** Cached an hour. Errors aren't cached, so the next visit tries again. */
export const loadDealBundle = unstable_cache(() => computeBundle("post-con"), ["post-con-deals-v7"], { revalidate: CACHE_SECONDS });

/** Janitorial pipeline deals, same shape and cache time, for the pipeline board. */
export const loadJanitorialDealBundle = unstable_cache(() => computeBundle("janitorial"), ["janitorial-deals-v2"], { revalidate: CACHE_SECONDS });

export function dealUrl(hubId: string | null, dealId: string): string | null {
  return hubId ? `https://app.hubspot.com/contacts/${hubId}/record/0-3/${dealId}` : null;
}

export type Outcome = "won" | "lost" | "open";

export function outcomeOf(b: Pick<Bundle, "won" | "lost">, stageId: string): Outcome {
  return b.won.includes(stageId) ? "won" : b.lost.includes(stageId) ? "lost" : "open";
}

/**
 * Won deals that are ERP projects get the project's contract value instead
 * of HubSpot's Amount. Returns the adjusted deals and how many were swapped.
 */
export async function withErpWonAmounts(bundle: Bundle): Promise<{ deals: RawDeal[]; fromErp: number }> {
  const wonIds = bundle.deals.filter((d) => bundle.won.includes(d.stageId)).map((d) => d.id);
  const projects = wonIds.length
    ? await prisma.project.findMany({ where: { hubspotDealId: { in: wonIds }, contractValueCents: { not: null } }, select: { hubspotDealId: true, contractValueCents: true } })
    : [];
  const erp = new Map(projects.map((p) => [p.hubspotDealId!, p.contractValueCents!]));
  return { deals: bundle.deals.map((d) => (erp.has(d.id) ? { ...d, cents: erp.get(d.id)! } : d)), fromErp: erp.size };
}
