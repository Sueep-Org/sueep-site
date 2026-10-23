/**
 * Automatic next steps (PIPELINE_EXTRAS_PLAN Phase 5): when a deal moves
 * forward into an open stage that has a next step in its stage rules, the
 * deal gets that step, unless it already has an open one (a step someone
 * typed is never replaced).
 *
 * - Moves made on the board: moveDealStage calls addStageStep right away.
 * - Moves made in HubSpot: the hourly cron compares each open deal's stage
 *   with DealStageSeen. A deal seen for the first time is only recorded, so
 *   the first run doesn't hand out steps for moves made long ago.
 */
import { prisma } from "@/lib/prisma";
import { todayEasternKey } from "./dates";
import { loadDeals, loadJanitorialDeals } from "./dealEdits";
import { loadStageRules, nextStepDue, type StageNextStep } from "./dealStageRules";
import { outcomeOf, type Bundle, type PipelineKey } from "./postConDeals";
import type { NextStep } from "./dealFollowUps";

/** Shown as who added the step. */
export const STAGE_RULE_AUTHOR = "Stage rule";

type StepDeal = { id: string; name: string; bidDate: string | null };

/** Adds the stage's next step to the deal if it has none open. Returns the step added, or null. */
export async function addStageStep(pipeline: PipelineKey, deal: StepDeal, step: StageNextStep | null, today = todayEasternKey()): Promise<NextStep | null> {
  if (!step) return null;
  const open = await prisma.dealFollowUp.findFirst({ where: { hubspotDealId: deal.id, doneAt: null }, select: { id: true } });
  if (open) return null;
  const dueDate = nextStepDue(step, deal.bidDate, today);
  await prisma.dealFollowUp.create({
    data: {
      hubspotDealId: deal.id,
      pipeline,
      dealName: deal.name,
      text: step.text,
      dueDate,
      createdByEmail: STAGE_RULE_AUTHOR,
      updatedByEmail: STAGE_RULE_AUTHOR,
    },
  });
  return { text: step.text, dueDate, byEmail: STAGE_RULE_AUTHOR };
}

export async function markStageSeen(dealId: string, pipeline: PipelineKey, stageId: string) {
  await prisma.dealStageSeen.upsert({ where: { hubspotDealId: dealId }, create: { hubspotDealId: dealId, pipeline, stageId }, update: { stageId } });
}

/** After a board move: the step for the new stage (forward moves only) and the seen stage. Never throws. */
export async function afterBoardMove(pipeline: PipelineKey, deal: StepDeal, fromStageId: string, toStageId: string): Promise<NextStep | null> {
  try {
    const bundle = pipeline === "janitorial" ? await loadJanitorialDeals() : await loadDeals();
    await markStageSeen(deal.id, pipeline, toStageId);
    if (outcomeOf(bundle, toStageId) !== "open" || bundle.stageOrder.indexOf(toStageId) <= bundle.stageOrder.indexOf(fromStageId)) return null;
    const rule = (await loadStageRules(pipeline, bundle)).find((r) => r.stageId === toStageId);
    return await addStageStep(pipeline, deal, rule?.nextStep ?? null);
  } catch (e) {
    console.error("automatic next step after a board move failed:", e);
    return null;
  }
}

export type StageStepRow = { pipeline: PipelineKey; dealId: string; dealName: string; from: string | null; to: string; result: "recorded" | "step" | "had step" | "no rule" | "back" };

async function runPipeline(pipeline: PipelineKey, bundle: Bundle, apply: boolean, today: string): Promise<StageStepRow[]> {
  const rules = new Map((await loadStageRules(pipeline, bundle)).map((r) => [r.stageId, r]));
  const open = bundle.deals.filter((d) => outcomeOf(bundle, d.stageId) === "open");
  const seen = new Map((await prisma.dealStageSeen.findMany({ where: { hubspotDealId: { in: open.map((d) => d.id) } } })).map((s) => [s.hubspotDealId, s.stageId]));
  const label = (id: string | null) => (id ? (bundle.stageLabels[id] ?? id).trim() : null);
  const rows: StageStepRow[] = [];
  const firstSeen: { hubspotDealId: string; pipeline: string; stageId: string }[] = [];

  for (const d of open) {
    const before = seen.get(d.id) ?? null;
    if (before === d.stageId) continue;
    const row: StageStepRow = { pipeline, dealId: d.id, dealName: d.name, from: label(before), to: label(d.stageId)!, result: "recorded" };
    if (before == null) {
      firstSeen.push({ hubspotDealId: d.id, pipeline, stageId: d.stageId });
      rows.push(row);
      continue;
    }
    const forward = bundle.stageOrder.indexOf(d.stageId) > bundle.stageOrder.indexOf(before);
    const step = rules.get(d.stageId)?.nextStep ?? null;
    if (!forward) row.result = "back";
    else if (!step) row.result = "no rule";
    else if (apply) row.result = (await addStageStep(pipeline, d, step, today)) ? "step" : "had step";
    else row.result = (await prisma.dealFollowUp.findFirst({ where: { hubspotDealId: d.id, doneAt: null }, select: { id: true } })) ? "had step" : "step";
    if (apply) await markStageSeen(d.id, pipeline, d.stageId);
    rows.push(row);
  }
  if (apply && firstSeen.length) await prisma.dealStageSeen.createMany({ data: firstSeen, skipDuplicates: true });
  return rows;
}

/** Both pipelines. `apply: false` only reports what it would do. `bundles` skips the cache, for checks run outside the app. */
export async function runStageNextSteps({ apply, bundles }: { apply: boolean; bundles?: { post: Bundle; jan: Bundle } }): Promise<StageStepRow[]> {
  const today = todayEasternKey();
  const [post, jan] = bundles ? [bundles.post, bundles.jan] : await Promise.all([loadDeals(), loadJanitorialDeals()]);
  return [...(await runPipeline("post-con", post, apply, today)), ...(await runPipeline("janitorial", jan, apply, today))];
}
