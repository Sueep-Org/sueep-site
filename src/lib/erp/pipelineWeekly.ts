/**
 * Pipeline this week and the forecast (PIPELINE_PLAN Phase 8), for the strip
 * above the pipeline board and the Business Manager's dashboard card.
 *
 * - This week: today's HubSpot read against the daily snapshot from 7 days
 *   ago (pipelineSnapshots.ts). Until there's a snapshot that old, the oldest
 *   one is used and `sinceDay` says which day. No snapshots yet: null.
 *   New: open now, not in the snapshot, created since. Moved forward: in a
 *   later open stage than in the snapshot. Won and Closed lost: open in the
 *   snapshot, won or lost now.
 * - Forecast (post-con only): each open deal's amount times its chance to win
 *   (winChance.ts), leaving out Clean up deals, which are usually dead. Shown
 *   next to what we really won from bids created in the last 12 months, so
 *   it reads as a rough guide, not a promise (user decision 2026-10-19).
 */
import { prisma } from "@/lib/prisma";
import { todayEasternKey } from "./dates";
import { addDaysKey } from "./manualHoursRepeat";
import { outcomeOf, type Bundle, type PipelineKey } from "./postConDeals";

const DAY_MS = 86_400_000;

export type WeeklyChanges = {
  /** Snapshot day compared against */
  sinceDay: string;
  newDeals: number;
  newCents: number;
  movedForward: number;
  won: number;
  wonCents: number;
  lost: number;
  /** Open in the snapshot, still open, same or earlier stage */
  stayed: number;
  /** Open deals in the snapshot */
  baseOpen: number;
  /** Open deals and $ per saved day, last TREND_DAYS, oldest first, for the sparkline */
  trend: { day: string; deals: number; cents: number }[];
};

const TREND_DAYS = 30;

export type Forecast = { cents: number; deals: number; wonLast12Cents: number; wonLast12: number };

export async function weeklyChanges(pipeline: PipelineKey, bundle: Bundle, todayKey: string = todayEasternKey()): Promise<WeeklyChanges | null> {
  const target = addDaysKey(todayKey, -7);
  // The snapshot from a week ago, or the oldest one while there isn't one that old yet.
  const base =
    (await prisma.pipelineSnapshot.findFirst({ where: { pipeline, day: { lte: target } }, orderBy: { day: "desc" }, select: { day: true } })) ??
    (await prisma.pipelineSnapshot.findFirst({ where: { pipeline, day: { lt: todayKey } }, orderBy: { day: "asc" }, select: { day: true } }));
  if (!base) return null;
  const [rows, days] = await Promise.all([
    prisma.pipelineSnapshot.findMany({ where: { pipeline, day: base.day }, select: { hubspotDealId: true, stageId: true } }),
    prisma.pipelineSnapshot.groupBy({
      by: ["day"],
      where: { pipeline, day: { gte: addDaysKey(todayKey, -TREND_DAYS) } },
      _count: { _all: true },
      _sum: { cents: true },
      orderBy: { day: "asc" },
    }),
  ]);
  return { ...compareWeek(base.day, rows, bundle), trend: days.map((d) => ({ day: d.day, deals: d._count._all, cents: d._sum.cents ?? 0 })) };
}

/** The comparison itself, kept apart from the database so it can be checked on its own. */
export function compareWeek(sinceDay: string, rows: { hubspotDealId: string; stageId: string }[], bundle: Bundle): Omit<WeeklyChanges, "trend"> {
  const then = new Map(rows.map((r) => [r.hubspotDealId, r.stageId]));
  const order = new Map(bundle.stageOrder.map((id, i) => [id, i]));
  const since = Date.parse(`${sinceDay}T00:00:00Z`);
  const out: Omit<WeeklyChanges, "trend"> = {
    sinceDay,
    newDeals: 0,
    newCents: 0,
    movedForward: 0,
    won: 0,
    wonCents: 0,
    lost: 0,
    stayed: 0,
    baseOpen: rows.length,
  };
  for (const d of bundle.deals) {
    const now = outcomeOf(bundle, d.stageId);
    const was = then.get(d.id);
    if (was == null) {
      if (now === "open" && Date.parse(d.created) >= since) {
        out.newDeals++;
        out.newCents += d.cents;
      }
      continue;
    }
    if (now === "won") {
      out.won++;
      out.wonCents += d.cents;
    } else if (now === "lost") out.lost++;
    else if ((order.get(d.stageId) ?? 0) > (order.get(was) ?? 0)) out.movedForward++;
    else out.stayed++;
  }
  return out;
}

/** `open` are the board's open post-con cards with their chance to win and Clean up flag. */
export function forecastOf(open: { cents: number; chanceP: number | null; cleanup: boolean }[], bundle: Bundle, now = new Date()): Forecast {
  const live = open.filter((c) => c.chanceP != null && !c.cleanup);
  const cutoff = now.getTime() - 365 * DAY_MS;
  const won = bundle.deals.filter((d) => outcomeOf(bundle, d.stageId) === "won" && Date.parse(d.created) >= cutoff);
  return {
    cents: Math.round(live.reduce((s, c) => s + c.cents * c.chanceP!, 0)),
    deals: live.length,
    wonLast12Cents: won.reduce((s, d) => s + d.cents, 0),
    wonLast12: won.length,
  };
}
