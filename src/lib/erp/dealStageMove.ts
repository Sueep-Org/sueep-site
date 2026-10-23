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
 * - Moving forward into an open stage needs that stage's required fields
 *   (dealStageRules.ts, PIPELINE_EXTRAS_PLAN Phase 4), checked against
 *   HubSpot. Moving back never does, so Undo always works.
 */
import { prisma } from "@/lib/prisma";
import type { PipelineKey } from "./postConDeals";
import { isActiveOwner, patchDeal, pipelineStages, readDealForChange } from "./dealGuard";
import { loadDeals, loadJanitorialDeals } from "./dealEdits";
import { requiredByStage } from "./dealStageRules";
import { MISSING_LABELS, missingFrom } from "./pipelineMissing";
import { companyMatcher } from "./winLoss";
import { afterBoardMove } from "./dealStageSteps";
import type { NextStep } from "./dealFollowUps";

const RULE_PROPS = ["hubspot_owner_id", "company", "bid_date", "completion_date", "award_date", "amount", "area_sqft"];

/** Required fields the deal still lacks for `toStageId`, by their labels. */
async function missingForStage(pipeline: PipelineKey, toStageId: string, p: Record<string, string | null>): Promise<string[]> {
  const bundle = pipeline === "janitorial" ? await loadJanitorialDeals() : await loadDeals();
  const required = (await requiredByStage(pipeline, bundle)).get(toStageId) ?? [];
  if (!required.length) return [];
  const companies = required.includes("company") ? await prisma.clientCompany.findMany({ select: { id: true, name: true, aliases: true } }) : [];
  const owner = p.hubspot_owner_id ?? "";
  const missing = missingFrom(required, {
    ownerOk: required.includes("owner") && !!owner ? await isActiveOwner(owner) : !!owner,
    // Same GC matching as the board: the company field, or a GC found in the deal name.
    hasCompany: !!companyMatcher(companies)({ company: p.company?.trim() || null, name: p.dealname ?? "" }),
    bidDate: p.bid_date || null,
    walkDate: p.completion_date || null,
    awardDate: p.award_date || null,
    cents: Math.round(Number(p.amount ?? 0) * 100) || 0,
    sqft: Number(p.area_sqft) || null,
  });
  return missing.map((m) => (m === "company" ? (pipeline === "janitorial" ? "Company" : "GC") : MISSING_LABELS[m]));
}

export type MoveStageInput = { dealId: string; pipeline: PipelineKey; fromStageId: string; toStageId: string; confirmWon: boolean; byEmail: string };

export async function moveDealStage(input: MoveStageInput): Promise<{ error: string; missing?: string[] } | { stageId: string; nextStep: NextStep | null }> {
  if (input.fromStageId === input.toStageId) return { stageId: input.toStageId, nextStep: null };
  const deal = await readDealForChange(input.dealId, input.pipeline, RULE_PROPS);
  if ("error" in deal) return deal;
  const { rules, props: p, stageId: current } = deal;
  if (rules.lost.has(input.toStageId)) return { error: "Use Mark lost, which asks for the reason." };
  const stages = await pipelineStages(rules.pipelineId);
  if ("error" in stages) return stages;
  const orderOf = new Map(stages.map((s) => [s.id, s.displayOrder]));
  if (!orderOf.has(input.toStageId)) return { error: "That stage isn't in this pipeline. Reload the page." };
  if (rules.won.has(input.toStageId) && !input.confirmWon) return { error: "Moving to a won stage needs a confirm." };
  if (deal.outcome === "lost") return { error: "Lost deals can't be moved here. Reopen them in HubSpot." };
  if (rules.won.has(current) && (!rules.won.has(input.toStageId) || (orderOf.get(input.toStageId) ?? 0) <= (orderOf.get(current) ?? 0))) {
    return { error: "Won deals can only move forward to a later won stage." };
  }
  if (current !== input.fromStageId) return { error: "Someone moved this deal in HubSpot since the board loaded. Reload the page." };
  const forwardIntoOpen =
    !rules.won.has(input.toStageId) && !rules.lost.has(input.toStageId) && (orderOf.get(input.toStageId) ?? 0) > (orderOf.get(current) ?? 0);
  if (forwardIntoOpen) {
    const missing = await missingForStage(input.pipeline, input.toStageId, p);
    if (missing.length) return { error: `Fill in first: ${missing.join(", ")}.`, missing };
  }

  // The log table must exist before HubSpot changes, or the move would go unrecorded.
  await prisma.dealInfoChange.findFirst({ select: { id: true } });
  const saved = await patchDeal(input.dealId, { dealstage: input.toStageId }, "move it");
  if ("error" in saved) return saved;
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
  // The new stage's automatic next step, if it has one and the deal has none open.
  const nextStep = await afterBoardMove(input.pipeline, { id: input.dealId, name: p.dealname ?? "(no name)", bidDate: p.bid_date?.slice(0, 10) || null }, current, input.toStageId);
  return { stageId: input.toStageId, nextStep };
}
