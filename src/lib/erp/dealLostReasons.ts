/**
 * Lost reasons from the pipeline board (PIPELINE_PLAN Phase 2): set HubSpot's
 * Deal Lost Reason on a lost deal, or move an open deal to lost with a
 * reason. Each change is logged (DealLostChange). On GC Not Awarded, who won
 * and their price are kept in the ERP only (DealLostWinner).
 *
 * - The deal is read from HubSpot first, so a deal from another pipeline or
 *   one already won can't be changed by a stale board.
 * - Moving to lost never creates an ERP project (only won stages do), so it's
 *   safe from the board. Other stage moves stay in HubSpot.
 * - HubSpot's reason is a checkbox list: values joined with ";". Values and
 *   labels differ for one option ("Proyecto en HOLD" is "Did Not Move Forward").
 */
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { hubspotFetch } from "@/lib/hubspot/client";
import type { PipelineKey } from "./postConDeals";
import { patchDeal, readDealForChange } from "./dealGuard";

export const GC_NOT_AWARDED = "GC Not Awarded";
const MAX_PRICE_CENTS = 100_000_000_00;

export type LostReasonOption = { value: string; label: string };

async function fetchLostReasonOptions(): Promise<LostReasonOption[]> {
  const res = await hubspotFetch("/crm/v3/properties/deals/deal_lost_reason");
  if (!res.ok) throw new Error(`HubSpot lost reasons failed: ${res.status}`);
  const data = (await res.json()) as { options?: { value: string; label: string; hidden?: boolean }[] };
  return (data.options ?? []).filter((o) => !o.hidden).map((o) => ({ value: o.value, label: o.label.trim() || o.value }));
}

/** HubSpot's Deal Lost Reason options, cached an hour like the deals. */
export const loadLostReasonOptions = unstable_cache(fetchLostReasonOptions, ["deal-lost-reason-options-v1"], { revalidate: 3600 });

/** "A;B" from HubSpot into a list. */
export function splitReasons(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(";")
    .map((r) => r.trim())
    .filter(Boolean);
}

export type LostWinnerInput = { companyId: string | null; name: string; priceCents: number | null } | null;

export type SetLostReasonInput = {
  dealId: string;
  pipeline: PipelineKey;
  reasons: string[];
  /** true: the deal is open and should move to the pipeline's lost stage */
  markLost: boolean;
  winner: LostWinnerInput;
  byEmail: string;
};

export type SetLostReasonResult = { error: string } | { stageId: string; reasons: string[]; winner: { name: string; priceCents: number | null } | null };

export async function setLostReason(input: SetLostReasonInput): Promise<SetLostReasonResult> {
  const options = await fetchLostReasonOptions();
  const known = new Set(options.map((o) => o.value));
  const reasons = [...new Set(input.reasons)];
  if (!reasons.length) return { error: "Pick at least one reason." };
  if (reasons.some((r) => !known.has(r))) return { error: "That reason isn't in HubSpot's list anymore. Reload the page." };

  const winner = reasons.includes(GC_NOT_AWARDED) ? input.winner : null;
  if (winner) {
    if (!winner.name.trim()) return { error: "Pick the GC that won, or leave it blank." };
    if (winner.priceCents != null && (!Number.isInteger(winner.priceCents) || winner.priceCents < 0 || winner.priceCents > MAX_PRICE_CENTS)) {
      return { error: "Check the winning price." };
    }
  }

  const deal = await readDealForChange(input.dealId, input.pipeline, ["deal_lost_reason"]);
  if ("error" in deal) return deal;
  const { rules, props: p, stageId: fromStage } = deal;
  const lostStage = [...rules.lost][0];
  if (!lostStage) return { error: "This pipeline has no lost stage in HubSpot." };
  const isLost = deal.outcome === "lost";
  if (deal.outcome === "won") return { error: "This deal is won in HubSpot, so it can't be marked lost here." };
  if (!isLost && !input.markLost) return { error: "This deal is open in HubSpot. Use Mark lost instead." };

  // The log table must exist before HubSpot changes, or the change would go unrecorded.
  await prisma.dealLostChange.findFirst({ select: { id: true } });

  const patch: Record<string, string> = { deal_lost_reason: reasons.join(";") };
  if (!isLost) patch.dealstage = lostStage;
  const saved = await patchDeal(input.dealId, patch);
  if ("error" in saved) return saved;
  const toStage = isLost ? fromStage : lostStage;

  await prisma.dealLostChange.create({
    data: {
      hubspotDealId: input.dealId,
      pipeline: input.pipeline,
      dealName: p.dealname ?? "(no name)",
      action: isLost ? "REASON" : "MARK_LOST",
      fromStageId: fromStage,
      toStageId: toStage,
      reasons,
      previousReasons: p.deal_lost_reason ?? null,
      byEmail: input.byEmail,
    },
  });
  if (winner) {
    const data = { winningCompanyId: winner.companyId, winningName: winner.name.trim(), winningPriceCents: winner.priceCents, updatedByEmail: input.byEmail };
    await prisma.dealLostWinner.upsert({ where: { hubspotDealId: input.dealId }, create: { hubspotDealId: input.dealId, ...data }, update: data });
  } else {
    await prisma.dealLostWinner.deleteMany({ where: { hubspotDealId: input.dealId } });
  }

  return { stageId: toStage, reasons, winner: winner ? { name: winner.name.trim(), priceCents: winner.priceCents } : null };
}

/** Changes made after the cached HubSpot read, newest last, so the board can show them before the next refresh. */
export async function lostChangesSince(pipeline: PipelineKey, since: string) {
  return prisma.dealLostChange.findMany({
    where: { pipeline, createdAt: { gt: new Date(since) } },
    orderBy: { createdAt: "asc" },
    select: { hubspotDealId: true, toStageId: true, reasons: true, createdAt: true },
  });
}
