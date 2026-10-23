/**
 * Stage rules for the Deals board (PIPELINE_EXTRAS_PLAN Phase 4): the fields
 * a deal must have to move into each open stage. They drive the card's
 * Missing flag and the check before a move.
 *
 * Stages nobody has edited use the old fix-it list (PIPELINE_PLAN Phase 7):
 * an active owner and a GC always; a Bid Date from Bidding on (post-con); an
 * amount in the quote stages, plus Area SQFT on post-con. Saving the rules
 * page stores every open stage, and Reset deletes them again.
 *
 * Each stage can also have an automatic next step (Phase 5, dealStageSteps.ts):
 * text plus days until due, or due on the deal's Bid Date. None by default;
 * SUGGESTED_STEPS fills the rules page for someone to review and save.
 */
import { prisma } from "@/lib/prisma";
import { outcomeOf, type Bundle, type PipelineKey } from "./postConDeals";
import { nextStepStages } from "./dealFollowUps";
import { fieldsFor, type MissingField } from "./pipelineMissing";

export type StageNextStep = { text: string; days: number; onBidDate: boolean };
export type StageRule = { stageId: string; label: string; required: MissingField[]; nextStep: StageNextStep | null; custom: boolean };

const DEFAULT_STEP_DAYS = 3;

/** Starting ideas by stage name, for the rules page's Use suggested steps. */
const SUGGESTED_STEPS: { match: RegExp; step: StageNextStep }[] = [
  { match: /bidding/i, step: { text: "Send the bid", days: 7, onBidDate: true } },
  { match: /competitive/i, step: { text: "Follow up on the competitive quote", days: 5, onBidDate: false } },
  { match: /quote sent|proposal/i, step: { text: "Follow up on the quote", days: 5, onBidDate: false } },
  { match: /negotiat/i, step: { text: "Check in on the negotiation", days: 3, onBidDate: false } },
  { match: /walk/i, step: { text: "Send the proposal from the walk", days: 2, onBidDate: false } },
  { match: /lead|property management|active turnover/i, step: { text: "First call", days: 1, onBidDate: false } },
];

export function suggestedStep(label: string, pipeline: PipelineKey): StageNextStep | null {
  const hit = SUGGESTED_STEPS.find((s) => s.match.test(label))?.step ?? null;
  return hit && pipeline === "janitorial" && hit.onBidDate ? { ...hit, onBidDate: false } : hit;
}

/** Due date for a stage's next step: the Bid Date when asked and still ahead, else today plus the days. */
export function nextStepDue(step: StageNextStep, bidDate: string | null, today: string): string {
  if (step.onBidDate && bidDate && bidDate >= today) return bidDate;
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Math.max(0, step.days));
  return d.toISOString().slice(0, 10);
}

export function defaultRequired(bundle: Bundle, pipeline: PipelineKey, stageId: string, expectsNext = nextStepStages(bundle)): MissingField[] {
  const out: MissingField[] = ["owner", "company"];
  if (pipeline === "post-con" && expectsNext.has(stageId)) out.push("bidDate");
  if (bundle.quoting.includes(stageId)) out.push("amount");
  if (pipeline === "post-con" && bundle.quoting.includes(stageId)) out.push("sqft");
  return out;
}

/** Every open stage in board order, with its required fields. */
export async function loadStageRules(pipeline: PipelineKey, bundle: Bundle): Promise<StageRule[]> {
  // A missing table (before the migration) means defaults everywhere, never a broken board.
  const saved = await prisma.dealStageRule.findMany({ where: { pipeline } }).catch(() => []);
  const byStage = new Map(saved.map((r) => [r.stageId, r]));
  const allowed = new Set(fieldsFor(pipeline));
  const expectsNext = nextStepStages(bundle);
  return bundle.stageOrder
    .filter((id) => outcomeOf(bundle, id) === "open")
    .map((id) => {
      const row = byStage.get(id);
      return {
        stageId: id,
        label: (bundle.stageLabels[id] ?? id).trim(),
        required: row ? (row.requiredFields.filter((f) => allowed.has(f as MissingField)) as MissingField[]) : defaultRequired(bundle, pipeline, id, expectsNext),
        nextStep: row?.nextStepText?.trim()
          ? { text: row.nextStepText.trim(), days: row.nextStepDays ?? DEFAULT_STEP_DAYS, onBidDate: pipeline === "post-con" && row.nextStepBidDate }
          : null,
        custom: !!row,
      };
    });
}

/** Required fields by stage id (open stages only). */
export async function requiredByStage(pipeline: PipelineKey, bundle: Bundle): Promise<Map<string, MissingField[]>> {
  return new Map((await loadStageRules(pipeline, bundle)).map((r) => [r.stageId, r.required]));
}
