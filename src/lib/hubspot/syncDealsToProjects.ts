import { prisma } from "@/lib/prisma";
import {
  classifyHubSpotDealStage,
  erpStatusFromPhase,
  parseHubSpotPipelineStageMap,
  shouldSyncDealToErp,
  type DealLifecyclePhase,
} from "@/lib/hubspot/pipelineStages";
import { searchDealsInConfiguredStages, type HubSpotDealRecord } from "@/lib/hubspot/dealSearch";
import { syncDealContactsToProject } from "@/lib/hubspot/syncDealContactsToProject";

function prop(r: HubSpotDealRecord, name: string): string | null {
  const v = r.properties[name];
  return v === undefined || v === null ? null : String(v);
}

function parseHubSpotDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export type SyncDealResult = {
  hubspotDealId: string;
  projectId: string;
  action: "created" | "updated";
  segment: string;
  phase: DealLifecyclePhase;
};

/**
 * Pull deals from HubSpot (configured pipelines/stages) and upsert `Project` rows
 * so they appear on the schedule / Gantt.
 */
export async function syncHubSpotDealsToProjects(): Promise<{
  synced: SyncDealResult[];
  errors: string[];
  reconciledJanitorial?: Array<{ hubspotDealId: string; projectId: string }>;
}> {
  const deals = await searchDealsInConfiguredStages(200);
  const startDateProperty = process.env.HUBSPOT_PROJECT_START_DATE_PROPERTY?.trim() || null;
  const endDateProperty = process.env.HUBSPOT_PROJECT_END_DATE_PROPERTY?.trim() || null;
  const cfg = parseHubSpotPipelineStageMap();
  const seenDealIds = new Set(deals.map((d) => d.id));
  const synced: SyncDealResult[] = [];
  const errors: string[] = [];

  for (const deal of deals) {
    const pipelineId = prop(deal, "pipeline");
    const stageId = prop(deal, "dealstage");
    const name = prop(deal, "dealname")?.trim() || "Untitled deal";
    const amountRaw = prop(deal, "amount");
    const closeRaw = prop(deal, "closedate");
    const startRaw = startDateProperty ? prop(deal, startDateProperty) : null;
    const endRaw = endDateProperty ? prop(deal, endDateProperty) : null;

    const classified = classifyHubSpotDealStage(pipelineId, stageId);
    if (!classified) {
      errors.push(`Deal ${deal.id}: pipeline ${pipelineId} not in HUBSPOT_PIPELINE_STAGE_MAP`);
      continue;
    }

    const { segment, phase } = classified;
    const projectSegment = segment === "COMMERCIAL" ? "COMMERCIAL_CLEANING" : "RESIDENTIAL_PAINTING";
    const status = erpStatusFromPhase(phase);
    const contractValueCents =
      amountRaw && !Number.isNaN(Number(amountRaw)) ? Math.round(Number(amountRaw) * 100) : undefined;

    try {
      const existing = await prisma.project.findUnique({ where: { hubspotDealId: deal.id } });

      if (!shouldSyncDealToErp(phase) && !existing) {
        continue;
      }
      const projectDate = parseHubSpotDate(startRaw ?? closeRaw);
      const projectEndDate = parseHubSpotDate(endRaw ?? closeRaw);

      if (existing) {
        await prisma.project.update({
          where: { id: existing.id },
          data: {
            jobTitle: name,
            ...(existing.supervisor ? {} : { supervisor: "UNASSIGNED PM" }),
            segment: projectSegment,
            status,
            hubspotPipelineId: pipelineId,
            hubspotStageId: stageId,
            ...(contractValueCents !== undefined ? { contractValueCents } : {}),
            projectDate,
            projectEndDate,
          },
        });
        synced.push({
          hubspotDealId: deal.id,
          projectId: existing.id,
          action: "updated",
          segment,
          phase,
        });
        await syncDealContactsToProject(existing.id, deal.id);
      } else {
        const created = await prisma.project.create({
          data: {
            hubspotDealId: deal.id,
            hubspotPipelineId: pipelineId,
            hubspotStageId: stageId,
            jobTitle: name,
            supervisor: "UNASSIGNED PM",
            segment: projectSegment,
            status,
            contractValueCents: contractValueCents ?? null,
            projectDate,
            projectEndDate,
          },
        });
        synced.push({
          hubspotDealId: deal.id,
          projectId: created.id,
          action: "created",
          segment,
          phase,
        });
        await syncDealContactsToProject(created.id, deal.id);
      }
    } catch (e) {
      errors.push(`Deal ${deal.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const reconciledJanitorial: Array<{ hubspotDealId: string; projectId: string }> = [];
  const janitorialId = cfg?.janitorial.pipelineId;
  const janitorialNoCompleted = cfg && !cfg.janitorial.stages.workCompleted?.trim();
  if (janitorialId && janitorialNoCompleted) {
    const orphans = await prisma.project.findMany({
      where: {
        hubspotPipelineId: janitorialId,
        hubspotDealId: { not: null },
        status: "ACTIVE",
      },
      select: { id: true, hubspotDealId: true },
    });
    for (const row of orphans) {
      const hid = row.hubspotDealId;
      if (!hid || seenDealIds.has(hid)) continue;
      await prisma.project.update({
        where: { id: row.id },
        data: { status: "COMPLETE" },
      });
      reconciledJanitorial.push({ hubspotDealId: hid, projectId: row.id });
    }
  }

  return {
    synced,
    errors,
    ...(reconciledJanitorial.length > 0 ? { reconciledJanitorial } : {}),
  };
}