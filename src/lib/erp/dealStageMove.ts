/**
 * Moving a deal between stages from the pipeline board (PIPELINE_PLAN Phase 9),
 * by dragging or Move to. Writes HubSpot's dealstage and logs it in
 * DealInfoChange (property "dealstage") with who did it.
 *
 * Rules (user decision 2026-10-20, the "safe set"):
 * - Lost deals stay put. A won deal never goes to lost or back to an open
 *   stage (moving it to lost would make the ERP's deal sync delete its
 *   project). Won deals only move forward to a later won stage, with
 *   `confirmWon` (user decision 2026-10-20): the sync then marks the project
 *   billed (Billing) or paid and Complete (Work Completed after Billing).
 * - Open to open: free. Open to won: only with `confirmWon` (the board asks
 *   first), because the next HubSpot sync creates an ERP project for it.
 * - Open to lost goes through Mark lost (dealLostReasons.ts), which asks for
 *   the reason; this refuses lost stages.
 * - `fromStageId` must still be the deal's stage in HubSpot, so a stale board
 *   (or an Undo after someone else moved it) can't overwrite a newer move.
 */
import { prisma } from "@/lib/prisma";
import { hubspotFetch } from "@/lib/hubspot/client";
import { loadRules } from "@/lib/hubspot/pipelineRules";
import type { PipelineKey } from "./postConDeals";

export type MoveStageInput = { dealId: string; pipeline: PipelineKey; fromStageId: string; toStageId: string; confirmWon: boolean; byEmail: string };

export async function moveDealStage(input: MoveStageInput): Promise<{ error: string } | { stageId: string }> {
  if (input.fromStageId === input.toStageId) return { stageId: input.toStageId };
  const rules = (await loadRules()).find((r) => r.key === input.pipeline);
  if (!rules) return { error: "Pipeline not found in HubSpot." };
  if (rules.lost.has(input.toStageId)) return { error: "Use Mark lost, which asks for the reason." };

  const pipes = await hubspotFetch(`/crm/v3/pipelines/deals/${encodeURIComponent(rules.pipelineId)}`);
  if (!pipes.ok) return { error: `Couldn't read HubSpot's stages (${pipes.status}).` };
  const stages = ((await pipes.json()) as { stages?: { id: string; displayOrder: number }[] }).stages ?? [];
  const orderOf = new Map(stages.map((s) => [s.id, s.displayOrder]));
  if (!orderOf.has(input.toStageId)) return { error: "That stage isn't in this pipeline. Reload the page." };
  if (rules.won.has(input.toStageId) && !input.confirmWon) return { error: "Moving to a won stage needs a confirm." };

  const res = await hubspotFetch(`/crm/v3/objects/deals/${encodeURIComponent(input.dealId)}?properties=dealname,dealstage,pipeline`);
  if (res.status === 404) return { error: "This deal is no longer in HubSpot." };
  if (!res.ok) return { error: `Couldn't read the deal from HubSpot (${res.status}).` };
  const p = ((await res.json()) as { properties: Record<string, string | null> }).properties;
  if (p.pipeline !== rules.pipelineId) return { error: "This deal moved to another pipeline in HubSpot. Reload the page." };
  const current = p.dealstage ?? "";
  if (rules.lost.has(current)) return { error: "Lost deals can't be moved here. Reopen them in HubSpot." };
  if (rules.won.has(current) && (!rules.won.has(input.toStageId) || (orderOf.get(input.toStageId) ?? 0) <= (orderOf.get(current) ?? 0))) {
    return { error: "Won deals can only move forward to a later won stage." };
  }
  if (current !== input.fromStageId) return { error: "Someone moved this deal in HubSpot since the board loaded. Reload the page." };

  // The log table must exist before HubSpot changes, or the move would go unrecorded.
  await prisma.dealInfoChange.findFirst({ select: { id: true } });
  const upd = await hubspotFetch(`/crm/v3/objects/deals/${encodeURIComponent(input.dealId)}`, {
    method: "PATCH",
    body: JSON.stringify({ properties: { dealstage: input.toStageId } }),
  });
  if (!upd.ok) {
    const msg = ((await upd.json().catch(() => null)) as { message?: string } | null)?.message;
    return { error: `HubSpot didn't move it${msg ? `: ${msg}` : ` (${upd.status})`}.` };
  }
  await prisma.dealInfoChange.create({
    data: {
      hubspotDealId: input.dealId,
      pipeline: input.pipeline,
      dealName: p.dealname ?? "(no name)",
      property: "dealstage",
      fromValue: current,
      toValue: input.toStageId,
      byEmail: input.byEmail,
    },
  });
  return { stageId: input.toStageId };
}
