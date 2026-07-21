import { hubspotFetch } from "@/lib/hubspot/client";
import type { HubSpotPipelineStageMap } from "@/lib/hubspot/pipelineStages";
import { parseHubSpotPipelineStageMap } from "@/lib/hubspot/pipelineStages";

function collectAllDealStageIds(cfg: HubSpotPipelineStageMap): string[] {
  const ids = new Set<string>();
  const add = (s: Record<string, string>) => {
    for (const id of Object.values(s)) {
      const t = id?.trim();
      if (t) ids.add(t);
    }
  };
  add(cfg.postConstruction.stages);
  // Janitorial pipeline excluded — units are now managed via the external PM form, not HubSpot sync
  if (cfg.realEstate) add(cfg.realEstate.stages);
  return [...ids];
}

export type HubSpotDealRecord = {
  id: string;
  properties: Record<string, string | null>;
};

/**
 * Fetch deals whose `dealstage` is one of your configured stages (all three pipelines).
 * HubSpot search API: POST /crm/v3/objects/deals/search
 */
export async function searchDealsInConfiguredStages(
  limit = 100,
  extraProperties: string[] = [],
): Promise<HubSpotDealRecord[]> {
  const cfg = parseHubSpotPipelineStageMap();
  if (!cfg) {
    throw new Error("HUBSPOT_PIPELINE_STAGE_MAP is not set");
  }
  const stageIds = collectAllDealStageIds(cfg);
  if (stageIds.length === 0) return [];

  const baseProperties = ["dealname", "amount", "pipeline", "dealstage", "closedate", "hs_is_closed", "hubspot_owner_id"];
  const properties = [...new Set([...baseProperties, ...extraProperties.filter(Boolean)])];

  const res = await hubspotFetch("/crm/v3/objects/deals/search", {
    method: "POST",
    body: JSON.stringify({
      filterGroups: [
        {
          filters: [
            {
              propertyName: "dealstage",
              operator: "IN",
              values: stageIds,
            },
          ],
        },
      ],
      properties,
      limit,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HubSpot search failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { results?: HubSpotDealRecord[] };
  return data.results ?? [];
}

/** The janitorial pipeline stages worth surfacing when creating a new
 * building from a deal — from "Walkthrough" through "Signed", i.e. a deal
 * that's live/in-flight but not yet turned into recurring work. Excludes
 * early lead stages and "Not Awarded"/"Recurring Complete Turns". */
function collectJanitorialBuildingSearchStageIds(cfg: HubSpotPipelineStageMap): string[] {
  const s = cfg.janitorial.stages;
  return [s.walkthrough, s.proposal, s.activeTurnovers, s.quoteApproved, s.workInProgress]
    .map((id) => id?.trim())
    .filter((id): id is string => Boolean(id));
}

/**
 * Free-text search for janitorial-pipeline deals in Walkthrough/Proposal/
 * Active Turnovers/Awarded/Signed — used when creating a new Building from
 * the New Project wizard, so the building can be named + linked from the
 * matching deal instead of typed in blind.
 */
export async function searchJanitorialDealsForBuildingCreation(query: string, limit = 10): Promise<HubSpotDealRecord[]> {
  const cfg = parseHubSpotPipelineStageMap();
  if (!cfg) {
    throw new Error("HUBSPOT_PIPELINE_STAGE_MAP is not set");
  }
  const stageIds = collectJanitorialBuildingSearchStageIds(cfg);

  const res = await hubspotFetch("/crm/v3/objects/deals/search", {
    method: "POST",
    body: JSON.stringify({
      query,
      filterGroups: [
        {
          filters: [
            { propertyName: "pipeline", operator: "EQ", value: cfg.janitorial.pipelineId },
            ...(stageIds.length > 0 ? [{ propertyName: "dealstage", operator: "IN", values: stageIds }] : []),
          ],
        },
      ],
      properties: ["dealname"],
      limit,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HubSpot janitorial deal search failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { results?: HubSpotDealRecord[] };
  return data.results ?? [];
}
