import { prisma } from "@/lib/prisma";
import {
  classifyHubSpotDealStage,
  erpStatusFromPhase,
  shouldSyncDealToErp,
  type DealLifecyclePhase,
} from "@/lib/hubspot/pipelineStages";
import { searchDealsInConfiguredStages, type HubSpotDealRecord } from "@/lib/hubspot/dealSearch";
import { syncDealContactsToProject, HubSpotScopesError } from "@/lib/hubspot/syncDealContactsToProject";
import { hubspotFetch } from "@/lib/hubspot/client";

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

type OwnerRecord = { id: string; email: string; firstName: string; lastName: string };

async function fetchAllOwners(): Promise<Map<string, OwnerRecord>> {
  const map = new Map<string, OwnerRecord>();
  try {
    const res = await hubspotFetch("/crm/v3/owners?limit=100");
    if (!res.ok) return map;
    const data = (await res.json()) as { results?: OwnerRecord[] };
    for (const o of data.results ?? []) {
      map.set(o.id, o);
    }
  } catch {
    // non-fatal — owner info stays blank if unavailable
  }
  return map;
}

async function isDealClosedLost(dealId: string): Promise<boolean> {
  try {
    const res = await hubspotFetch(`/crm/v3/objects/deals/${dealId}?properties=hs_is_closed,hs_deal_stage_probability`);
    if (!res.ok) return false;
    const data = (await res.json()) as { properties?: { hs_is_closed?: string; hs_deal_stage_probability?: string } };
    const props = data.properties ?? {};
    if (props.hs_is_closed !== "true") return false;
    const prob = parseFloat(props.hs_deal_stage_probability ?? "");
    return Number.isFinite(prob) && prob < 5;
  } catch {
    return false;
  }
}

/**
 * Pull deals from HubSpot (configured pipelines/stages) and upsert `Project` rows
 * so they appear on the schedule / Gantt.
 */
export async function syncHubSpotDealsToProjects(): Promise<{
  synced: SyncDealResult[];
  errors: string[];
  removedLostDeals?: string[];
}> {
  const startDateProperty = process.env.HUBSPOT_PROJECT_START_DATE_PROPERTY?.trim() || null;
  const endDateProperty = process.env.HUBSPOT_PROJECT_END_DATE_PROPERTY?.trim() || null;
  const extraProperties = [startDateProperty, endDateProperty].filter((p): p is string => Boolean(p));
  const [deals, owners] = await Promise.all([
    searchDealsInConfiguredStages(200, extraProperties),
    fetchAllOwners(),
  ]);
  const seenDealIds = new Set(deals.map((d) => d.id));
  const synced: SyncDealResult[] = [];
  const errors: string[] = [];
  let contactScopesError: string | null = null;

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
    const projectSegment = segment === "REAL_ESTATE" ? "REAL_ESTATE" : "COMMERCIAL_CLEANING";
    const status = erpStatusFromPhase(phase);
    const contractValueCents =
      amountRaw && !Number.isNaN(Number(amountRaw)) ? Math.round(Number(amountRaw) * 100) : undefined;

    const ownerIdRaw = prop(deal, "hubspot_owner_id");
    const owner = ownerIdRaw ? owners.get(ownerIdRaw) : null;
    const hubspotOwnerId = ownerIdRaw ?? undefined;
    const hubspotOwnerName = owner ? `${owner.firstName} ${owner.lastName}`.trim() || owner.email : undefined;
    const hubspotOwnerEmail = owner?.email ?? undefined;

    let syncedProjectId: string | null = null;
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
            ...(existing.supervisor ? {} : { supervisor: "UNASSIGNED PM" }),
            segment: projectSegment,
            status,
            hubspotPipelineId: pipelineId,
            hubspotStageId: stageId,
            projectDate,
            projectEndDate,
            ...(hubspotOwnerId !== undefined ? { hubspotOwnerId } : {}),
            ...(hubspotOwnerName !== undefined ? { hubspotOwnerName } : {}),
            ...(hubspotOwnerEmail !== undefined ? { hubspotOwnerEmail } : {}),
            ...(phase === "BILLING" ? { billingStatus: "BILLING" } : {}),
          },
        });
        syncedProjectId = existing.id;
        synced.push({
          hubspotDealId: deal.id,
          projectId: existing.id,
          action: "updated",
          segment,
          phase,
        });
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
            hubspotOwnerId: hubspotOwnerId ?? null,
            hubspotOwnerName: hubspotOwnerName ?? null,
            hubspotOwnerEmail: hubspotOwnerEmail ?? null,
            ...(phase === "BILLING" ? { billingStatus: "BILLING" } : {}),
          },
        });
        syncedProjectId = created.id;
        synced.push({
          hubspotDealId: deal.id,
          projectId: created.id,
          action: "created",
          segment,
          phase,
        });
      }
    } catch (e) {
      errors.push(`Deal ${deal.id}: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }

    if (syncedProjectId && !contactScopesError) {
      try {
        await syncDealContactsToProject(syncedProjectId, deal.id);
      } catch (e) {
        if (e instanceof HubSpotScopesError) {
          contactScopesError = e.message;
        } else {
          console.warn(`Deal ${deal.id}: contact sync skipped —`, e instanceof Error ? e.message : e);
        }
      }
    }
  }

  // Remove projects whose HubSpot deal is now closed-lost (no longer in any active stage)
  const removedLostDeals: string[] = [];
  const orphanedProjects = await prisma.project.findMany({
    where: {
      hubspotDealId: { not: null },
      NOT: { hubspotDealId: { in: [...seenDealIds] } },
    },
    select: { id: true, hubspotDealId: true },
  });
  for (const project of orphanedProjects) {
    const hid = project.hubspotDealId!;
    const lost = await isDealClosedLost(hid);
    if (lost) {
      try {
        await prisma.project.delete({ where: { id: project.id } });
        removedLostDeals.push(hid);
      } catch {
        // project may have been deleted already or has constraints
      }
    }
  }

  return {
    synced,
    errors,
    ...(removedLostDeals.length > 0 ? { removedLostDeals } : {}),
    ...(contactScopesError ? { contactScopesError } : {}),
  };
}