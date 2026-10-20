/**
 * Chance to win on open post-construction bids (PIPELINE_PLAN Phase 4), from
 * our own past bids. No AI: simple win rates per group, combined.
 *
 * - Signals (user decision 2026-10-19): where the bid came from, the GC's
 *   record with us, job size, type of work. A missing signal (no GC, unknown
 *   type of work) is left out instead of guessed.
 * - Each group's rate leans on the overall rate until it has enough bids
 *   (SMOOTHING), so a GC with 1 bid and 1 win isn't "100%".
 * - Rates are combined as odds against the overall rate, then banded:
 *   Strong STRONG_AT and up, Fair FAIR_AT and up, else Long shot.
 * - The backtest scores the newest quarter of decided bids using only the
 *   older ones, so the bands can be checked against what really happened.
 * - Bid or skip: a GC with SKIP_MIN_BIDS or more decided bids and no wins.
 */
import { prisma } from "@/lib/prisma";
import { companyMatcher } from "./winLoss";
import { outcomeOf, WORK_SCOPE_LABELS, type Bundle, type RawDeal } from "./postConDeals";

const SMOOTHING = 5;
export const STRONG_AT = 0.15;
export const FAIR_AT = 0.04;
export const SKIP_MIN_BIDS = 10;
const MIN_P = 0.005;
const MAX_P = 0.8;

export type WinBand = "Strong" | "Fair" | "Long shot";
/** One signal behind the score: the group this deal is in and how that group did. */
export type WinFactor = { label: string; won: number; bids: number };
export type WinChance = { band: WinBand; p: number; reasons: string[]; factors: WinFactor[] };
export type WinBacktest = { trained: number; tested: number; bands: { band: WinBand; bids: number; won: number }[] };
export type GcRecordShort = { bids: number; won: number; skip: boolean };

type GcKeyOf = (d: RawDeal) => string | null;
type Decided = { d: RawDeal; won: boolean; gc: string | null };

const SIZES = [
  { label: "Under $10k", max: 10_000_00 },
  { label: "$10k to $50k", max: 50_000_00 },
  { label: "$50k to $200k", max: 200_000_00 },
  { label: "$200k and up", max: Infinity },
];

function sizeOf(d: RawDeal): string {
  return d.cents ? SIZES.find((s) => d.cents < s.max)!.label : "No amount";
}

/** Each signal: its group for a deal (null = leave it out) and how to say it. */
const SIGNALS: { key: string; group: (x: Decided) => string | null; say: (g: string) => string }[] = [
  { key: "source", group: (x) => x.d.source ?? "Source not filled in", say: (g) => g },
  { key: "gc", group: (x) => x.gc, say: () => "This GC" },
  { key: "size", group: (x) => sizeOf(x.d), say: (g) => g },
  { key: "scope", group: (x) => (x.d.scope === "UNKNOWN" ? null : x.d.scope), say: (g) => WORK_SCOPE_LABELS[g as keyof typeof WORK_SCOPE_LABELS] ?? g },
];

export function bandOf(p: number): WinBand {
  return p >= STRONG_AT ? "Strong" : p >= FAIR_AT ? "Fair" : "Long shot";
}

const odds = (p: number) => p / (1 - p);

/** Rates from `train`; returns a scorer for any deal. */
function fit(train: Decided[]) {
  const base = train.length ? train.filter((x) => x.won).length / train.length : 0.05;
  const tables = SIGNALS.map((s) => {
    const m = new Map<string, { n: number; w: number }>();
    for (const x of train) {
      const g = s.group(x);
      if (g == null) continue;
      const e = m.get(g) ?? { n: 0, w: 0 };
      e.n++;
      if (x.won) e.w++;
      m.set(g, e);
    }
    return m;
  });
  return (x: Decided): WinChance => {
    let o = odds(base);
    const reasons: string[] = [];
    const factors: WinFactor[] = [];
    SIGNALS.forEach((s, i) => {
      const g = s.group(x);
      if (g == null) return;
      const e = tables[i]!.get(g) ?? { n: 0, w: 0 };
      const rate = (e.w + SMOOTHING * base) / (e.n + SMOOTHING);
      o *= odds(rate) / odds(base);
      if (e.n) {
        reasons.push(`${s.say(g)}: won ${e.w} of ${e.n}`);
        factors.push({ label: s.say(g), won: e.w, bids: e.n });
      }
    });
    const p = Math.min(MAX_P, Math.max(MIN_P, o / (1 + o)));
    return { band: bandOf(p), p, reasons, factors };
  };
}

export type WinModel = {
  score: (d: RawDeal) => WinChance;
  gcRecord: (d: RawDeal) => GcRecordShort | null;
  backtest: WinBacktest;
  /** Overall win rate of decided bids */
  base: number;
};

/** Post-construction only: janitorial has too few lost deals to score from. */
export function buildWinModel(bundle: Bundle, gcKeyOf: GcKeyOf): WinModel {
  const decided: Decided[] = bundle.deals
    .filter((d) => outcomeOf(bundle, d.stageId) !== "open")
    .map((d) => ({ d, won: outcomeOf(bundle, d.stageId) === "won", gc: gcKeyOf(d) }))
    .sort((a, b) => a.d.created.localeCompare(b.d.created));
  const scoreDecided = fit(decided);

  const cut = Math.floor(decided.length * 0.75);
  const testScore = fit(decided.slice(0, cut));
  const bands: WinBacktest["bands"] = (["Strong", "Fair", "Long shot"] as const).map((band) => ({ band, bids: 0, won: 0 }));
  for (const x of decided.slice(cut)) {
    const b = bands.find((r) => r.band === testScore(x).band)!;
    b.bids++;
    if (x.won) b.won++;
  }

  const gcStats = new Map<string, { bids: number; won: number }>();
  for (const x of decided) {
    if (!x.gc) continue;
    const e = gcStats.get(x.gc) ?? { bids: 0, won: 0 };
    e.bids++;
    if (x.won) e.won++;
    gcStats.set(x.gc, e);
  }

  return {
    score: (d) => scoreDecided({ d, won: false, gc: gcKeyOf(d) }),
    gcRecord: (d) => {
      const k = gcKeyOf(d);
      const e = k ? gcStats.get(k) : null;
      return e ? { ...e, skip: e.bids >= SKIP_MIN_BIDS && e.won === 0 } : null;
    },
    backtest: { trained: cut, tested: decided.length - cut, bands },
    base: decided.length ? decided.filter((x) => x.won).length / decided.length : 0,
  };
}

/** Band for each open deal, with GCs matched to Companies, for the dashboard and emails. */
export async function loadWinBands(bundle: Bundle): Promise<(d: RawDeal) => WinBand | null> {
  const match = companyMatcher(await prisma.clientCompany.findMany({ select: { id: true, name: true, aliases: true } }));
  const model = buildWinModel(bundle, (d) => match(d)?.key ?? null);
  return (d) => (outcomeOf(bundle, d.stageId) === "open" ? model.score(d).band : null);
}
