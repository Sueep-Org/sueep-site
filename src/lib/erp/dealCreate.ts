/**
 * New deal from the Deals board: creates the deal in HubSpot, in the picked
 * pipeline and open stage, and keeps a copy (DealCreated) so the board shows
 * it before the next hourly HubSpot read (dealEdits.ts).
 *
 * - Open stages only. A won stage would make an ERP project, so deals are
 *   won in HubSpot or by moving the card later.
 * - Company is HubSpot's company text, the same field Edit info and re-bids
 *   set, which is what the board matches GCs on.
 * - Owner must be an active HubSpot owner. Blank fields are left out.
 * - Clone (PIPELINE_EXTRAS_PLAN Phase 6): `copyFromDealId` puts "Copied from"
 *   and the source deal's description in the new deal's description.
 */
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { hubspotFetch } from "@/lib/hubspot/client";
import { loadRules } from "@/lib/hubspot/pipelineRules";
import { scopeFromTypeOfBusiness, type PipelineKey, type RawDeal } from "./postConDeals";
import { isActiveOwner, pipelineStages } from "./dealGuard";

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_CENTS = 1_000_000_000_00;
const MAX_SQFT = 100_000_000;
/** A new deal can take a few minutes to show in HubSpot's search, so a read just after it may still miss it. */
const SEARCH_LAG_MS = 10 * 60_000;
/** Longer than the HubSpot read is cached, so the copy is never needed after this. */
const KEEP_MS = 2 * 3600_000;

export type TypeOfBusinessOption = { value: string; label: string };

async function fetchTypeOfBusinessOptions(): Promise<TypeOfBusinessOption[]> {
  const res = await hubspotFetch("/crm/v3/properties/deals/type_of_business");
  if (!res.ok) return [];
  const data = (await res.json()) as { options?: { value: string; label: string; hidden?: boolean }[] };
  return (data.options ?? []).filter((o) => !o.hidden).map((o) => ({ value: o.value, label: o.label.trim() || o.value }));
}

/** HubSpot's Type of business options, cached an hour like the deals. Empty when HubSpot has none. */
export const loadTypeOfBusinessOptions = unstable_cache(fetchTypeOfBusinessOptions, ["deal-type-of-business-options-v1"], { revalidate: 3600 });

export type CreateDealInput = {
  pipeline: PipelineKey;
  name: string;
  stageId: string;
  ownerId: string | null;
  company: string | null;
  bidDate: string | null;
  walkDate: string | null;
  cents: number | null;
  sqft: number | null;
  typeOfBusiness: string | null;
  /** Cloning: the deal it was copied from */
  copyFromDealId?: string | null;
  byEmail: string;
};

export async function createDeal(input: CreateDealInput): Promise<{ error: string } | { newDealId: string }> {
  const name = input.name.trim().slice(0, 250);
  if (!name) return { error: "Give the deal a name." };
  for (const [v, label] of [
    [input.bidDate, "Bid Date"],
    [input.walkDate, "Job Walk Date"],
  ] as const) {
    if (v && (!DAY_KEY.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`)))) return { error: `Check the ${label}.` };
  }
  const c = input.cents;
  if (c != null && (!Number.isInteger(c) || c < 0 || c > MAX_CENTS)) return { error: "Check the amount." };
  const q = input.sqft;
  if (q != null && (!Number.isFinite(q) || q < 0 || q > MAX_SQFT)) return { error: "Check the square footage." };
  if (input.ownerId && !(await isActiveOwner(input.ownerId))) return { error: "That owner isn't active in HubSpot. Pick another." };

  const rules = (await loadRules()).find((r) => r.key === input.pipeline);
  if (!rules) return { error: "Pipeline not found in HubSpot." };
  const stages = await pipelineStages(rules.pipelineId);
  if ("error" in stages) return stages;
  const stage = stages.find((s) => s.id === input.stageId);
  if (!stage) return { error: "That stage is no longer in HubSpot. Reload the page." };
  if (rules.won.has(stage.id) || rules.lost.has(stage.id)) return { error: "Pick an open stage. Won and lost deals are set later." };
  if (input.typeOfBusiness && !(await loadTypeOfBusinessOptions()).some((o) => o.value === input.typeOfBusiness))
    return { error: "Pick a Type of business from the list." };

  const company = input.company?.trim().slice(0, 200) || null;
  const sqft = q == null ? null : Math.round(q);
  const properties: Record<string, string> = { dealname: name, pipeline: rules.pipelineId, dealstage: stage.id };
  if (input.ownerId) properties.hubspot_owner_id = input.ownerId;
  if (company) properties.company = company;
  if (input.bidDate) properties.bid_date = input.bidDate;
  // HubSpot's "Job Walk Date" lives in a property named completion_date.
  if (input.walkDate) properties.completion_date = input.walkDate;
  if (c != null) properties.amount = (c / 100).toFixed(2);
  if (sqft != null) properties.area_sqft = String(sqft);
  if (input.typeOfBusiness) properties.type_of_business = input.typeOfBusiness;
  if (input.copyFromDealId) {
    const src = await hubspotFetch(`/crm/v3/objects/deals/${encodeURIComponent(input.copyFromDealId)}?properties=dealname,description`);
    if (!src.ok) return { error: "Couldn't read the deal being copied from HubSpot." };
    const sp = ((await src.json()) as { properties: Record<string, string | null> }).properties;
    properties.description = [`Copied from deal: ${sp.dealname ?? input.copyFromDealId} (${input.copyFromDealId})`, sp.description?.trim()].filter(Boolean).join("\n\n").slice(0, 60_000);
  }

  // The table must exist before HubSpot gets a new deal, or the board wouldn't show it until the next read.
  await prisma.dealCreated.findFirst({ select: { id: true } });
  const created = await hubspotFetch("/crm/v3/objects/deals", { method: "POST", body: JSON.stringify({ properties }) });
  if (!created.ok) {
    const msg = ((await created.json().catch(() => null)) as { message?: string } | null)?.message;
    return { error: `HubSpot didn't create the deal${msg ? `: ${msg}` : ` (${created.status})`}.` };
  }
  const newDealId = String(((await created.json()) as { id: string }).id);
  await prisma.dealCreated.create({
    data: {
      hubspotDealId: newDealId,
      pipeline: input.pipeline,
      dealName: name,
      stageId: stage.id,
      amountCents: c,
      ownerId: input.ownerId,
      company,
      bidDate: input.bidDate,
      walkDate: input.walkDate,
      sqft,
      typeOfBusiness: input.typeOfBusiness,
      byEmail: input.byEmail,
    },
  });
  return { newDealId };
}

/**
 * Deals made in the ERP that the cached HubSpot read doesn't have yet: made
 * after it, or just before it while HubSpot's search was still catching up.
 */
export async function createdDealsMissing(pipeline: PipelineKey, fetchedAt: string, have: Set<string>): Promise<RawDeal[]> {
  const read = Date.parse(fetchedAt);
  // Before the table's migration runs this fails; the board then just waits for HubSpot.
  const rows = await prisma.dealCreated
    .findMany({
      where: { pipeline, createdAt: { gt: new Date(Math.max(read - SEARCH_LAG_MS, Date.now() - KEEP_MS)) } },
      orderBy: { createdAt: "asc" },
    })
    .catch(() => []);
  return rows
    .filter((r) => !have.has(r.hubspotDealId))
    .map((r) => ({
      id: r.hubspotDealId,
      name: r.dealName,
      stageId: r.stageId,
      cents: r.amountCents ?? 0,
      created: r.createdAt.toISOString(),
      ownerId: r.ownerId,
      company: r.company,
      lostReason: null,
      source: null,
      sqft: r.sqft && r.sqft > 0 ? r.sqft : null,
      lastActivity: r.createdAt.toISOString(),
      scope: scopeFromTypeOfBusiness(r.typeOfBusiness) ?? "UNKNOWN",
      bidDate: r.bidDate,
      walkDate: r.walkDate,
      awardDate: null,
      stageEnteredAt: r.createdAt.toISOString(),
    }));
}
