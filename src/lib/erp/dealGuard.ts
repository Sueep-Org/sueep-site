/**
 * Shared checks for every change the ERP makes to a HubSpot deal (lost
 * reasons, Mark lost, Edit info, stage moves, re-bids): read the deal fresh,
 * make sure it's still in the expected pipeline, and report errors in one
 * consistent wording. Each caller then applies its own rules on top.
 */
import { hubspotFetch } from "@/lib/hubspot/client";
import { loadRules, type PipelineRules } from "@/lib/hubspot/pipelineRules";
import type { PipelineKey } from "./postConDeals";

export type Outcome = "won" | "lost" | "open";
export type DealForChange = { rules: PipelineRules; props: Record<string, string | null>; stageId: string; outcome: Outcome };
export type HubSpotStage = { id: string; label: string; displayOrder: number };

/** The deal as HubSpot has it right now, with `props` (dealname, dealstage and pipeline are always read). */
export async function readDealForChange(dealId: string, pipeline: PipelineKey, props: string[] = []): Promise<{ error: string } | DealForChange> {
  const rules = (await loadRules()).find((r) => r.key === pipeline);
  if (!rules) return { error: "Pipeline not found in HubSpot." };
  const wanted = [...new Set(["dealname", "dealstage", "pipeline", ...props])].join(",");
  const res = await hubspotFetch(`/crm/v3/objects/deals/${encodeURIComponent(dealId)}?properties=${wanted}`);
  if (res.status === 404) return { error: "This deal is no longer in HubSpot." };
  if (!res.ok) return { error: `Couldn't read the deal from HubSpot (${res.status}).` };
  const p = ((await res.json()) as { properties: Record<string, string | null> }).properties;
  if (p.pipeline !== rules.pipelineId) return { error: "This deal moved to another pipeline in HubSpot. Reload the page." };
  const stageId = p.dealstage ?? "";
  return { rules, props: p, stageId, outcome: rules.won.has(stageId) ? "won" : rules.lost.has(stageId) ? "lost" : "open" };
}

/** A pipeline's stages in HubSpot's board order. */
export async function pipelineStages(pipelineId: string): Promise<{ error: string } | HubSpotStage[]> {
  const res = await hubspotFetch(`/crm/v3/pipelines/deals/${encodeURIComponent(pipelineId)}`);
  if (!res.ok) return { error: `Couldn't read HubSpot's stages (${res.status}).` };
  return (((await res.json()) as { stages?: HubSpotStage[] }).stages ?? []).sort((a, b) => a.displayOrder - b.displayOrder);
}

/** True when the HubSpot owner exists and isn't archived. */
export async function isActiveOwner(ownerId: string): Promise<boolean> {
  if (!/^\d+$/.test(ownerId)) return false;
  return (await hubspotFetch(`/crm/v3/owners/${ownerId}?archived=false`)).ok;
}

/** Saves properties on a deal; HubSpot's own message comes back on failure. */
export async function patchDeal(dealId: string, properties: Record<string, string>, what = "save it"): Promise<{ error: string } | { ok: true }> {
  const res = await hubspotFetch(`/crm/v3/objects/deals/${encodeURIComponent(dealId)}`, { method: "PATCH", body: JSON.stringify({ properties }) });
  if (res.ok) return { ok: true };
  const msg = ((await res.json().catch(() => null)) as { message?: string } | null)?.message;
  return { error: `HubSpot didn't ${what}${msg ? `: ${msg}` : ` (${res.status})`}.` };
}
