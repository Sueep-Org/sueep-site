/**
 * Which HubSpot deal stages count as won and lost, per pipeline, read from
 * HubSpot's own stage order so renamed or reordered stages still work. Used
 * by the dashboard's Wins tab and the post-construction deal data
 * (erp/postConDeals.ts).
 */
import { hubspotFetch } from "./client";
import { parseHubSpotPipelineStageMap } from "./pipelineStages";

const LOST_LABEL = /deal lost|not awarded/i;
/** HubSpot's built-in id for the default pipeline's "Quote Sent" stage. */
const DEFAULT_QUOTE_SENT_STAGE = "presentationscheduled";

export type PipelineRules = {
  key: "post-con" | "janitorial";
  label: string;
  pipelineId: string;
  /** Stage ids that count as won / lost. */
  won: Set<string>;
  lost: Set<string>;
  /** The "quote sent" stage for turnaround, when known. */
  quoteStageId: string | null;
};

type HubSpotStage = { id: string; label: string; displayOrder: number };

/** Won/lost stage sets per pipeline, from HubSpot's own stage order. */
export async function loadRules(): Promise<PipelineRules[]> {
  const cfg = parseHubSpotPipelineStageMap();
  if (!cfg) throw new Error("HUBSPOT_PIPELINE_STAGE_MAP is not set");
  const res = await hubspotFetch("/crm/v3/pipelines/deals");
  if (!res.ok) throw new Error(`HubSpot pipelines failed: ${res.status}`);
  const data = (await res.json()) as { results?: { id: string; stages?: HubSpotStage[] }[] };
  const stagesOf = (pipelineId: string) => (data.results ?? []).find((p) => p.id === pipelineId)?.stages ?? [];

  const build = (key: PipelineRules["key"], label: string, pipelineId: string, firstWonStageId: string | undefined, quoteStageId: string | null): PipelineRules => {
    const stages = stagesOf(pipelineId);
    const lost = new Set(stages.filter((s) => LOST_LABEL.test(s.label)).map((s) => s.id));
    const firstWon = stages.find((s) => s.id === firstWonStageId);
    const won = new Set(firstWon ? stages.filter((s) => s.displayOrder >= firstWon.displayOrder && !lost.has(s.id)).map((s) => s.id) : []);
    return { key, label, pipelineId, won, lost, quoteStageId: quoteStageId && stages.some((s) => s.id === quoteStageId) ? quoteStageId : null };
  };

  const pc = cfg.postConstruction;
  const jan = cfg.janitorial;
  const pcQuote = pc.stages.quoteSent?.trim() || (pc.pipelineId === "default" ? DEFAULT_QUOTE_SENT_STAGE : null);
  return [
    build("post-con", "Post-construction", pc.pipelineId, pc.stages.quoteApproved, pcQuote),
    build("janitorial", "Janitorial", jan.pipelineId, jan.stages.activeTurnovers || jan.stages.quoteApproved, jan.stages.proposal?.trim() || null),
  ];
}

