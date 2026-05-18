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
  add(cfg.janitorial.stages);
  add(cfg.residential.stages);
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

  const baseProperties = ["dealname", "amount", "pipeline", "dealstage", "closedate", "hs_is_closed"];
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
