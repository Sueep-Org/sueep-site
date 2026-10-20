/**
 * Pipeline board (DEALS_BILLING_PLAN Phase 6): every post-construction or
 * janitorial deal as a card in its HubSpot stage column, from postConDeals.ts.
 * Read-only; stages are changed in HubSpot.
 *
 * - Columns follow HubSpot's stage order, Deal Lost last.
 * - Open stages show every deal, except Lead. Lead, won and lost stages show
 *   deals created or active in the last CLOSED_DAYS unless "all" is picked.
 * - Amounts are HubSpot's Amount, so column totals match HubSpot's board.
 * - GC from companyMatcher, stale from staleQuotes, price flags from
 *   quotePriceCheck, same rules as Win/Loss and the Estimation dashboard.
 *   Janitorial has no price flags (its benchmarks are post-con jobs).
 * - Days in stage from HubSpot's date entered for the current stage. Stuck:
 *   open and past its stage's limit (stuckLimitDays). Clean up: open and
 *   CLEANUP_DAYS or more in stage, usually a dead deal nobody closed out.
 * - The viewer's own deals: HubSpot owner email matched to the ERP login.
 * - Chance to win and the GC record for bid or skip: winChance.ts.
 * - GC Not Awarded losses: who won (DealLostWinner) and re-bids (dealRebids.ts).
 * - This week and the forecast: pipelineWeekly.ts.
 * - Missing info (open deals only): no owner or an inactive one, no GC; from
 *   Bidding on (post-con) no Bid Date; in the quote stages no amount, and on
 *   post-con no Area SQFT. Job Walk Date is never flagged (unused).
 */
import { prisma } from "@/lib/prisma";
import { todayEasternKey } from "./dates";
import {
  WORK_SCOPE_LABELS,
  dealUrl,
  loadDealBundle,
  loadJanitorialDealBundle,
  outcomeOf,
  type Bundle,
  type Outcome,
  type PipelineKey,
  type WorkScope,
} from "./postConDeals";
import { companyMatcher, staleQuotes } from "./winLoss";
import { quotePriceCheck } from "./quotePriceCheck";
import { splitReasons } from "./dealLostReasons";
import { nextStepStages, openNextSteps, type NextStep } from "./dealFollowUps";
import { applyErpEdits } from "./dealEdits";
import { buildWinModel, type GcRecordShort, type WinBacktest, type WinChance } from "./winChance";
import { loadRebids, rebidName } from "./dealRebids";
import { GC_NOT_AWARDED } from "./dealLostReasons";
import { forecastOf, weeklyChanges, type Forecast, type WeeklyChanges } from "./pipelineWeekly";
import type { MissingField } from "./pipelineMissing";

export type { MissingField };

const DAY_MS = 86_400_000;
export const CLOSED_DAYS = 90;
/** Company types that hire us directly, shown apart from GCs. */
const CLIENT_KINDS = new Set(["PROPERTY_MANAGER", "OWNER"]);
export const CLEANUP_DAYS = 180;

/** Days an open stage can hold a deal before it's stuck. Quoting waits on the GC longer than early stages. */
export function stuckLimitDays(stageLabel: string): number {
  if (/quote sent|proposal/i.test(stageLabel)) return 30;
  if (/negotiation|competitive/i.test(stageLabel)) return 21;
  return 14;
}

/** Lead piles up with leads nobody followed, so it gets the same window as won and lost. */
const LEAD_LABEL = /^\s*leads?\s*$/i;

export type BoardPriceFlag = { kind: "high" | "low" | "check"; diff: number };

export type BoardCard = {
  id: string;
  name: string;
  stageId: string;
  cents: number;
  ownerId: string | null;
  owner: string | null;
  gc: { key: string; label: string; companyId: string | null } | null;
  /** GC, property manager or owner, a name that matches no company, or no company at all */
  companyKind: "gc" | "client" | "unlinked" | "none";
  scope: WorkScope;
  scopeLabel: string;
  bidDate: string | null;
  walkDate: string | null;
  /** ISO time of the last HubSpot activity (or creation), for sorting */
  activeAt: string;
  daysQuiet: number | null;
  stale: boolean;
  /** Days since the deal entered its current stage */
  daysInStage: number | null;
  /** HubSpot's date entered is the 2024-12-26 bulk import, so days in stage is overstated */
  importedStage: boolean;
  stuck: boolean;
  cleanup: boolean;
  perSqft: number | null;
  priceFlag: BoardPriceFlag | null;
  /** HubSpot Deal Lost Reason values */
  lostReasons: string[];
  /** Who won the job (GC Not Awarded only), from the ERP */
  winner: { name: string; priceCents: number | null } | null;
  /** Open next step (ERP only) */
  nextStep: NextStep | null;
  /** Raw HubSpot values, for editing */
  companyText: string | null;
  sqft: number | null;
  /** What this open deal is missing for its stage */
  missing: MissingField[];
  /** Chance to win (open post-construction deals only) */
  chance: WinChance | null;
  /** The GC's record with us, on early-stage cards (before Quote Sent), for bid or skip */
  gcRecord: GcRecordShort | null;
  /** Lost as GC Not Awarded (post-con): ask who won, then offer a re-bid */
  gcNotAwarded: boolean;
  /** Name for the re-bid deal, when a winner is recorded */
  rebidName: string | null;
  /** The re-bid deal already made from this one */
  rebid: { newDealId: string; url: string | null } | null;
  url: string | null;
};

export type BoardColumn = { stageId: string; label: string; outcome: Outcome; hidden: number; stuckLimit: number | null; expectsNextStep: boolean };

export type PipelineBoard = {
  pipeline: PipelineKey;
  columns: BoardColumn[];
  cards: BoardCard[];
  closed: "recent" | "all";
  /** This week against the snapshot from 7 days ago; null until the first snapshot */
  weekly: WeeklyChanges | null;
  /** Post-construction only */
  forecast: Forecast | null;
  /** Our overall win rate on decided post-construction bids, for comparing each factor */
  winBase: number | null;
  /** Usual $ per sq ft per type of work (post-construction only), from the quote price check */
  priceRanges: { scope: WorkScope; low: number; mid: number; high: number; basis: "won" | "all bids"; samples: number }[];
  /** How the chance to win did on past bids (post-construction only) */
  winBacktest: WinBacktest | null;
  /** Active HubSpot owners, for the owner picker */
  activeOwners: { id: string; name: string }[];
  /** HubSpot owner id of the person viewing, when their login email is a HubSpot owner */
  viewerOwnerId: string | null;
  fetchedAt: string;
};

/** HubSpot's bulk import day; stage dates on it aren't real. */
const IMPORT_DAY = "2024-12-26";

export async function loadPipelineBoard(
  pipeline: PipelineKey,
  closed: "recent" | "all",
  viewerEmail: string | null,
  now = new Date(),
  preloaded?: Bundle,
): Promise<PipelineBoard> {
  const [cached, companies, winners, nextSteps, rebids] = await Promise.all([
    preloaded ?? (pipeline === "janitorial" ? loadJanitorialDealBundle() : loadDealBundle()),
    prisma.clientCompany.findMany({ select: { id: true, name: true, aliases: true, type: true } }),
    prisma.dealLostWinner.findMany({ select: { hubspotDealId: true, winningName: true, winningPriceCents: true } }),
    openNextSteps(pipeline),
    pipeline === "post-con" ? loadRebids() : Promise.resolve(new Map<string, { newDealId: string; winningName: string }>()),
  ]);
  // ERP changes since the cached HubSpot read show right away (dealEdits.ts).
  const bundle = await applyErpEdits(cached, pipeline);
  const winnerOf = new Map(winners.map((w) => [w.hubspotDealId, { name: w.winningName, priceCents: w.winningPriceCents }]));
  const match = companyMatcher(companies);
  const companyType = new Map(companies.map((c) => [c.id, c.type]));
  const stale = new Set(staleQuotes(bundle, now).map((s) => s.id));
  const flags = new Map<string, BoardPriceFlag>();
  let priceRanges: PipelineBoard["priceRanges"] = [];
  if (pipeline === "post-con") {
    const check = await quotePriceCheck(bundle, now);
    priceRanges = check.benchmarks.map((b) => ({ scope: b.scope, low: b.low, mid: b.mid, high: b.high, basis: b.basis, samples: b.samples }));
    for (const r of check.outside) flags.set(r.id, { kind: r.diff > 0 ? "high" : "low", diff: r.diff });
    for (const r of check.checkNumbers) flags.set(r.id, { kind: "check", diff: r.diff });
  }

  // Deal Lost goes last, like HubSpot's board puts closed stages at the end.
  const order = [...bundle.stageOrder.filter((id) => !bundle.lost.includes(id)), ...bundle.stageOrder.filter((id) => bundle.lost.includes(id))];
  const windowed = new Set(order.filter((id) => outcomeOf(bundle, id) !== "open" || LEAD_LABEL.test(bundle.stageLabels[id] ?? "")));
  const hidden = new Map<string, number>();
  const since = now.getTime() - CLOSED_DAYS * DAY_MS;
  const cards: BoardCard[] = [];
  const expectsNext = nextStepStages(bundle);
  const model = pipeline === "post-con" ? buildWinModel(bundle, (d) => match(d)?.key ?? null) : null;
  const firstQuote = bundle.stageOrder.findIndex((id) => bundle.quoting.includes(id));
  const early = new Set(bundle.stageOrder.filter((id, i) => outcomeOf(bundle, id) === "open" && (firstQuote < 0 || i < firstQuote)));
  const limitOf = new Map(order.map((id) => [id, outcomeOf(bundle, id) === "open" ? stuckLimitDays(bundle.stageLabels[id] ?? "") : null]));
  const viewer = viewerEmail?.toLowerCase();
  const viewerOwnerId = viewer ? (Object.entries(bundle.ownerEmails).find(([, e]) => e === viewer)?.[0] ?? null) : null;

  for (const d of bundle.deals) {
    const activeAt = d.lastActivity ?? d.created;
    const active = Date.parse(activeAt);
    if (closed === "recent" && windowed.has(d.stageId)) {
      const created = Date.parse(d.created);
      const recent = (Number.isFinite(created) && created >= since) || (Number.isFinite(active) && active >= since);
      if (!recent) {
        hidden.set(d.stageId, (hidden.get(d.stageId) ?? 0) + 1);
        continue;
      }
    }
    const entered = d.stageEnteredAt ? Date.parse(d.stageEnteredAt) : NaN;
    const daysInStage = Number.isFinite(entered) ? Math.max(0, Math.floor((now.getTime() - entered) / DAY_MS)) : null;
    const limit = limitOf.get(d.stageId) ?? null;
    const gc = match(d);
    const gna = pipeline === "post-con" && outcomeOf(bundle, d.stageId) === "lost" && splitReasons(d.lostReason).includes(GC_NOT_AWARDED);
    const missing: MissingField[] = [];
    if (outcomeOf(bundle, d.stageId) === "open") {
      if (!d.ownerId || !bundle.ownerEmails[d.ownerId]) missing.push("owner");
      if (!gc) missing.push("company");
      if (pipeline === "post-con" && expectsNext.has(d.stageId) && !d.bidDate) missing.push("bidDate");
      if (bundle.quoting.includes(d.stageId) && !d.cents) missing.push("amount");
      if (pipeline === "post-con" && bundle.quoting.includes(d.stageId) && !d.sqft) missing.push("sqft");
    }
    cards.push({
      id: d.id,
      name: d.name,
      stageId: d.stageId,
      cents: d.cents,
      ownerId: d.ownerId,
      owner: d.ownerId ? (bundle.owners[d.ownerId] ?? null) : null,
      gc,
      companyKind: !gc ? "none" : !gc.companyId ? "unlinked" : CLIENT_KINDS.has(companyType.get(gc.companyId) ?? "") ? "client" : "gc",
      scope: d.scope,
      scopeLabel: WORK_SCOPE_LABELS[d.scope],
      bidDate: d.bidDate,
      walkDate: d.walkDate,
      activeAt,
      daysQuiet: Number.isFinite(active) ? Math.max(0, Math.floor((now.getTime() - active) / DAY_MS)) : null,
      stale: stale.has(d.id),
      daysInStage,
      importedStage: d.stageEnteredAt?.startsWith(IMPORT_DAY) ?? false,
      stuck: limit != null && daysInStage != null && daysInStage > limit,
      cleanup: limit != null && daysInStage != null && daysInStage >= CLEANUP_DAYS,
      perSqft: d.sqft && d.cents ? d.cents / 100 / d.sqft : null,
      priceFlag: flags.get(d.id) ?? null,
      lostReasons: splitReasons(d.lostReason),
      winner: winnerOf.get(d.id) ?? null,
      nextStep: nextSteps.get(d.id) ?? null,
      chance: model && outcomeOf(bundle, d.stageId) === "open" ? model.score(d) : null,
      gcRecord: model && early.has(d.stageId) ? model.gcRecord(d) : null,
      gcNotAwarded: gna,
      rebidName: gna && winnerOf.get(d.id) ? rebidName(d.name, d.company ?? gc?.label ?? null, winnerOf.get(d.id)!.name) : null,
      rebid: rebids.has(d.id) ? { newDealId: rebids.get(d.id)!.newDealId, url: dealUrl(bundle.hubId, rebids.get(d.id)!.newDealId) } : null,
      companyText: d.company,
      sqft: d.sqft,
      missing,
      url: dealUrl(bundle.hubId, d.id),
    });
  }
  cards.sort((a, b) => b.activeAt.localeCompare(a.activeAt));
  const weekly = await weeklyChanges(pipeline, bundle, todayEasternKey(now));
  const forecast = model
    ? forecastOf(
        cards.map((c) => ({ cents: c.cents, chanceP: c.chance?.p ?? null, cleanup: c.cleanup })),
        bundle,
        now,
      )
    : null;

  return {
    pipeline,
    columns: order.map((id) => ({
      stageId: id,
      label: (bundle.stageLabels[id] ?? id).trim(),
      outcome: outcomeOf(bundle, id),
      hidden: hidden.get(id) ?? 0,
      stuckLimit: limitOf.get(id) ?? null,
      expectsNextStep: expectsNext.has(id),
    })),
    cards,
    closed,
    viewerOwnerId,
    weekly,
    forecast,
    winBacktest: model?.backtest ?? null,
    winBase: model?.base ?? null,
    priceRanges,
    activeOwners: Object.keys(bundle.ownerEmails)
      .map((id) => ({ id, name: bundle.owners[id] ?? id }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    fetchedAt: bundle.fetchedAt,
  };
}
