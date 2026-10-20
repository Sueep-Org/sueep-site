/**
 * What needs attention on a deal, most urgent first: one list shared by the
 * board card (its one flag), the deal panel (Do next) and the board's quick
 * views (My to-dos, Lost follow-up), so they never disagree. Safe to import
 * on the client.
 */
import type { BoardCard } from "./pipelineBoard";
import { MISSING_LABELS } from "./pipelineMissing";
import { addDays, pct, shortDay } from "./pipelineUi";

export type AttentionKey = "lateStep" | "cleanup" | "bidSoon" | "stuck" | "noStep" | "missing" | "quiet" | "price" | "skip" | "noReason" | "whoWon" | "rebid";
export type AttentionTone = "red" | "rose" | "amber" | "sky" | "pink" | "gray" | "green";
export type AttentionAction = "nextStep" | "editInfo" | "moveTo" | "markLost" | "lostReason" | "rebid";

/** `chip`: the short flag on a card. `text`: the sentence in the panel. */
export type Attention = { key: AttentionKey; chip: string; text: string; tone: AttentionTone; action?: AttentionAction; actionLabel?: string };

/** Things to do on open deals; My to-dos shows deals with any of these. */
export const TODO_KEYS: AttentionKey[] = ["lateStep", "cleanup", "bidSoon", "stuck", "noStep", "missing", "quiet"];
/** Things to do on lost deals; Lost follow-up shows deals with any of these. */
export const LOST_KEYS: AttentionKey[] = ["noReason", "whoWon", "rebid"];
/** Shown as the line under the GC on a card, not as the card's flag. */
const STEP_KEYS: AttentionKey[] = ["lateStep", "noStep"];

export function dealAttention(
  c: BoardCard,
  ctx: { outcome: "open" | "won" | "lost"; stageLabel: string; expectsNextStep: boolean; today: string; companyWord: string },
): Attention[] {
  const out: Attention[] = [];
  if (ctx.outcome === "open") {
    if (c.nextStep && c.nextStep.dueDate < ctx.today)
      out.push({ key: "lateStep", chip: "Step late", text: `Next step is late: ${c.nextStep.text}`, tone: "red", action: "nextStep", actionLabel: "Update" });
    if (c.cleanup)
      out.push({
        key: "cleanup",
        chip: "Clean up",
        text: `No movement in ${c.daysInStage} days. Is it still alive?`,
        tone: "rose",
        action: "markLost",
        actionLabel: "Mark lost",
      });
    if (c.bidDate && c.bidDate >= ctx.today && c.bidDate <= addDays(ctx.today, 3))
      out.push({ key: "bidSoon", chip: `Bid ${shortDay(c.bidDate)}`, text: `Bid is due ${shortDay(c.bidDate)}.`, tone: "pink" });
    if (c.stuck && !c.cleanup)
      out.push({
        key: "stuck",
        chip: `Stuck ${c.daysInStage}d`,
        text: `${c.daysInStage} days in ${ctx.stageLabel}. Push it forward or close it out.`,
        tone: "amber",
        action: "moveTo",
        actionLabel: "Move to",
      });
    if (!c.nextStep && ctx.expectsNextStep)
      out.push({
        key: "noStep",
        chip: "No step",
        text: "No next step. Decide what happens next and when.",
        tone: "amber",
        action: "nextStep",
        actionLabel: "Add",
      });
    if (c.missing.length) {
      const names = c.missing.map((m) => (m === "company" ? ctx.companyWord : MISSING_LABELS[m]));
      out.push({
        key: "missing",
        chip: `Missing ${c.missing.length}`,
        text: `Missing ${names.join(", ")}`,
        tone: "sky",
        action: "editInfo",
        actionLabel: "Fix",
      });
    }
    if (c.stale && !c.stuck && !c.cleanup && c.daysQuiet != null)
      out.push({
        key: "quiet",
        chip: `Quiet ${c.daysQuiet}d`,
        text: `Quiet for ${c.daysQuiet} days. Follow up with the GC.`,
        tone: "amber",
        action: "nextStep",
        actionLabel: "Next step",
      });
    if (c.priceFlag) {
      const check = c.priceFlag.kind === "check";
      const dir = c.priceFlag.kind === "high" ? "above" : "below";
      out.push({
        key: "price",
        chip: check ? "Check price" : `${c.priceFlag.kind === "high" ? "+" : "-"}${pct(Math.abs(c.priceFlag.diff))} price`,
        text: check ? "Price looks far off. Check Area SQFT and the amount." : `Price is ${pct(Math.abs(c.priceFlag.diff))} ${dir} what we usually charge.`,
        tone: "amber",
      });
    }
    if (c.gcRecord?.skip)
      out.push({ key: "skip", chip: "Skip?", text: `We've bid ${c.gcRecord.bids} times with this GC and never won. Worth the effort?`, tone: "gray" });
  } else if (ctx.outcome === "lost") {
    if (!c.lostReasons.length)
      out.push({ key: "noReason", chip: "Add reason", text: "No lost reason yet.", tone: "rose", action: "lostReason", actionLabel: "Add reason" });
    else if (c.gcNotAwarded && !c.winner)
      out.push({
        key: "whoWon",
        chip: "Who won?",
        text: "Our GC lost the job. Which GC won it?",
        tone: "amber",
        action: "lostReason",
        actionLabel: "Who won?",
      });
    else if (c.gcNotAwarded && c.winner && !c.rebid)
      out.push({
        key: "rebid",
        chip: `Re-bid with ${c.winner.name}`,
        text: `${c.winner.name} won the job and still needs a sub.`,
        tone: "green",
        action: "rebid",
        actionLabel: "Re-bid",
      });
  }
  return out;
}

/** The card's one flag: the most urgent item that isn't about the next step (that has its own line). */
export function cardFlag(items: Attention[]): Attention | null {
  return items.find((a) => !STEP_KEYS.includes(a.key)) ?? null;
}

export const TONE_CLASS: Record<AttentionTone, string> = {
  red: "bg-red-50 text-red-700",
  rose: "bg-rose-50 text-rose-700",
  amber: "bg-amber-50 text-amber-700",
  sky: "bg-sky-50 text-sky-700",
  pink: "bg-pink-50 text-pink-700",
  gray: "bg-gray-100 text-gray-600",
  green: "bg-emerald-50 text-emerald-700",
};

/** Panel rows: a soft box per item. */
export const TONE_BOX: Record<AttentionTone, string> = {
  red: "border-red-200 bg-red-50 text-red-800",
  rose: "border-rose-200 bg-rose-50 text-rose-800",
  amber: "border-amber-200 bg-amber-50 text-amber-900",
  sky: "border-sky-200 bg-sky-50 text-sky-900",
  pink: "border-pink-200 bg-pink-50 text-pink-900",
  gray: "border-gray-200 bg-gray-50 text-gray-700",
  green: "border-emerald-200 bg-emerald-50 text-emerald-800",
};
