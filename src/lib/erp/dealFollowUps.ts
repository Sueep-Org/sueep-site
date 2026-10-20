/**
 * Next steps on pipeline deals (PIPELINE_PLAN Phase 3): what to do on a deal
 * and by when, kept in the ERP only. One open next step per deal; marking it
 * done keeps it for history. Shown on the pipeline board, the dashboard's Bids
 * cards and the Monday follow-up emails (pipelineFollowUpEmails.ts).
 *
 * - Expected from Bidding (post-con) or Walkthrough (janitorial) up to the
 *   last stage before won. Cards there without one show No next step.
 * - Overdue: due before today. Due this week: today through 6 days out.
 */
import { prisma } from "@/lib/prisma";
import { addDaysKey } from "./manualHoursRepeat";
import { outcomeOf, type Bundle, type PipelineKey } from "./postConDeals";

const MAX_TEXT = 300;
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

export type NextStep = { text: string; dueDate: string; byEmail: string };
export type NextStepState = "overdue" | "week" | "later";

export function nextStepState(dueDate: string, todayKey: string): NextStepState {
  return dueDate < todayKey ? "overdue" : dueDate <= addDaysKey(todayKey, 6) ? "week" : "later";
}

/** Open stages that should have a next step: from Bidding or Walkthrough through the stage before won. */
export function nextStepStages(bundle: Bundle): Set<string> {
  const open = bundle.stageOrder.filter((id) => outcomeOf(bundle, id) === "open");
  const start = open.findIndex((id) => /bidding|walkthrough/i.test(bundle.stageLabels[id] ?? ""));
  return new Set(start >= 0 ? open.slice(start) : bundle.quoting);
}

/** Open next steps by HubSpot deal id. */
export async function openNextSteps(pipeline?: PipelineKey): Promise<Map<string, NextStep>> {
  const rows = await prisma.dealFollowUp.findMany({
    where: { doneAt: null, ...(pipeline ? { pipeline } : {}) },
    select: { hubspotDealId: true, text: true, dueDate: true, updatedByEmail: true },
  });
  return new Map(rows.map((r) => [r.hubspotDealId, { text: r.text, dueDate: r.dueDate, byEmail: r.updatedByEmail }]));
}

export type SaveNextStepInput = { dealId: string; pipeline: PipelineKey; dealName: string; text: string; dueDate: string; byEmail: string };

/** Adds the deal's next step, or changes the open one. */
export async function saveNextStep(input: SaveNextStepInput): Promise<{ error: string } | { nextStep: NextStep }> {
  const text = input.text.trim().slice(0, MAX_TEXT);
  if (!text) return { error: "Say what the next step is." };
  if (!DAY_KEY.test(input.dueDate) || Number.isNaN(Date.parse(`${input.dueDate}T00:00:00Z`))) return { error: "Pick a due date." };
  const open = await prisma.dealFollowUp.findFirst({ where: { hubspotDealId: input.dealId, doneAt: null }, select: { id: true } });
  if (open) {
    await prisma.dealFollowUp.update({
      where: { id: open.id },
      data: { text, dueDate: input.dueDate, dealName: input.dealName, updatedByEmail: input.byEmail },
    });
  } else {
    await prisma.dealFollowUp.create({
      data: {
        hubspotDealId: input.dealId,
        pipeline: input.pipeline,
        dealName: input.dealName,
        text,
        dueDate: input.dueDate,
        createdByEmail: input.byEmail,
        updatedByEmail: input.byEmail,
      },
    });
  }
  return { nextStep: { text, dueDate: input.dueDate, byEmail: input.byEmail } };
}

/** Marks the deal's open next step done. */
export async function completeNextStep(dealId: string, byEmail: string): Promise<{ done: number }> {
  const res = await prisma.dealFollowUp.updateMany({ where: { hubspotDealId: dealId, doneAt: null }, data: { doneAt: new Date(), doneByEmail: byEmail } });
  return { done: res.count };
}
