/**
 * Maps your three HubSpot deal pipelines + stages into ERP segment + lifecycle phase.
 *
 * Pipelines:
 * - Post-construction + Janitorial → ERP segment COMMERCIAL_CLEANING
 * - Real Estate → ERP segment REAL_ESTATE
 *
 * Stages (your naming):
 * - Commercial: Quote approved = awarded, Work in progress, Work completed
 * - Real Estate: same stage naming as commercial (quoteApproved, workInProgress, workCompleted)
 * - Janitorial: Omit `workCompleted` (empty string) to sync only active stages (e.g. Awarded + Signed as WIP);
 *   deals that leave those stages are marked COMPLETE on the next sync.
 *
 * Set `HUBSPOT_PIPELINE_STAGE_MAP` in Vercel to a JSON string (see `.env.example`).
 * Get IDs: HubSpot → Settings → Data Management → Objects → Deals → Pipelines,
 * or inspect a deal’s `pipeline` / `dealstage` property values in the API.
 */

export type ErpSegment = "COMMERCIAL" | "REAL_ESTATE";

/** Awarded/confirmed & WIP should appear on Schedule/Gantt; completed = done in ERP. */
export type DealLifecyclePhase = "AWARDED" | "WIP" | "COMPLETED" | "BILLING" | "OTHER";

export type HubSpotPipelineStageMap = {
  /** Post-construction pipeline object id (string from HubSpot) */
  postConstruction: { pipelineId: string; stages: { quoteApproved: string; workInProgress: string; workCompleted: string; billing?: string } };
  /** Janitorial pipeline. quoteApproved/workInProgress map to this
   * pipeline's actual "Awarded"/"Signed" stages; walkthrough/proposal/
   * activeTurnovers are additional stages surfaced only when searching for
   * a deal to name/link a new Building from (see searchJanitorialDealsForBuildingCreation) — not used for Project sync. */
  janitorial: {
    pipelineId: string;
    stages: {
      quoteApproved: string;
      workInProgress: string;
      workCompleted: string;
      walkthrough?: string;
      proposal?: string;
      activeTurnovers?: string;
    };
  };
  /** Real estate pipeline (formerly residential) — syncs as REAL_ESTATE segment */
  realEstate?: { pipelineId: string; stages: { quoteApproved: string; workInProgress: string; workCompleted: string } };
};

export function parseHubSpotPipelineStageMap(): HubSpotPipelineStageMap | null {
  const raw = process.env.HUBSPOT_PIPELINE_STAGE_MAP?.trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as HubSpotPipelineStageMap;
  } catch {
    console.error("HUBSPOT_PIPELINE_STAGE_MAP: invalid JSON");
    return null;
  }
}

/**
 * Given a deal’s `pipeline` + `dealstage` ids, returns ERP segment and lifecycle phase.
 * Returns null if pipeline isn’t one of the three configured pipelines.
 */
export function classifyHubSpotDealStage(
  pipelineId: string | null | undefined,
  dealStageId: string | null | undefined,
): { segment: ErpSegment; phase: DealLifecyclePhase } | null {
  if (!pipelineId || !dealStageId) return null;
  const cfg = parseHubSpotPipelineStageMap();
  if (!cfg) return null;

  const matches = (configured: string) => {
    const c = configured?.trim();
    return Boolean(c) && dealStageId === c;
  };

  if (pipelineId === cfg.postConstruction.pipelineId) {
    const { quoteApproved, workInProgress, workCompleted, billing } = cfg.postConstruction.stages;
    if (matches(quoteApproved)) return { segment: "COMMERCIAL", phase: "AWARDED" };
    if (matches(workInProgress)) return { segment: "COMMERCIAL", phase: "WIP" };
    if (matches(workCompleted)) return { segment: "COMMERCIAL", phase: "COMPLETED" };
    if (billing && matches(billing)) return { segment: "COMMERCIAL", phase: "BILLING" };
    return { segment: "COMMERCIAL", phase: "OTHER" };
  }

  if (pipelineId === cfg.janitorial.pipelineId) {
    const { quoteApproved, workInProgress, workCompleted } = cfg.janitorial.stages;
    if (matches(quoteApproved)) return { segment: "COMMERCIAL", phase: "AWARDED" };
    if (matches(workInProgress)) return { segment: "COMMERCIAL", phase: "WIP" };
    if (matches(workCompleted)) return { segment: "COMMERCIAL", phase: "COMPLETED" };
    return { segment: "COMMERCIAL", phase: "OTHER" };
  }

  if (cfg.realEstate && pipelineId === cfg.realEstate.pipelineId) {
    const { quoteApproved, workInProgress, workCompleted } = cfg.realEstate.stages;
    if (matches(quoteApproved)) return { segment: "REAL_ESTATE", phase: "AWARDED" };
    if (matches(workInProgress)) return { segment: "REAL_ESTATE", phase: "WIP" };
    if (matches(workCompleted)) return { segment: "REAL_ESTATE", phase: "COMPLETED" };
    return { segment: "REAL_ESTATE", phase: "OTHER" };
  }

  return null;
}

/** Stages that should create/update an ERP row for schedule & Gantt (not yet closed out). */
export function shouldSyncDealToErp(phase: DealLifecyclePhase): boolean {
  return phase === "AWARDED" || phase === "WIP" || phase === "BILLING";
}

/** Maps lifecycle to existing ERP `Project.status` (extend later if you add finer states). */
export function erpStatusFromPhase(phase: DealLifecyclePhase): "ACTIVE" | "UPCOMING" | "COMPLETE" | "ON_HOLD" {
  if (phase === "COMPLETED" || phase === "BILLING") return "COMPLETE";
  if (phase === "AWARDED") return "UPCOMING";
  if (phase === "OTHER") return "ON_HOLD";
  return "ACTIVE";
}
