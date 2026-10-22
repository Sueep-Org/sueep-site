/**
 * Sub scores, 1-5. Confidence is the average of the three hand-entered
 * ratings (quality, reliability, communication). Pricing, unless someone set
 * it by hand, averages two parts, whichever they have:
 *  - Vs other subs: how their bids compare with the cheapest other sub on
 *    the same work.
 *  - Margin kept: our margin on their jobs. Awarded bids count with the
 *    bid's margin; jobs they were paid on count with the job's labor margin
 *    (contract minus every sub's pay and employee labor, change orders
 *    included). A job with an awarded bid from them counts once, as the bid.
 * Plain helpers, no server imports.
 */

export const RATING_KEYS = ["quality", "reliability", "communication"] as const;
export type RatingKey = (typeof RATING_KEYS)[number];
export const RATING_LABELS: Record<RatingKey, string> = {
  quality: "Quality",
  reliability: "Reliability",
  communication: "Communication",
};

/** One job counted in the margin part of the pricing score. */
export type PricingJob = {
  projectId: string;
  projectTitle: string;
  marginPct: number;
  /** Awarded bid, or paid on the job (labor margin of the whole job) */
  source: "bid" | "paid";
};

export type SubScores = {
  quality: number | null;
  reliability: number | null;
  communication: number | null;
  /** Average of the three */
  confidence: number | null;
  ratingCount: number;
  /** Average of the two parts below; null when they have neither */
  pricingAuto: number | null;
  /** From bids that had another sub's bid to compare with */
  vsOthersScore: number | null;
  comparedBids: number;
  /** From the margin on their awarded bids and paid jobs */
  marginScore: number | null;
  avgMarginPct: number | null;
  marginJobs: PricingJob[];
  pricingOverride: number | null;
  /** What to show: the override, else the worked-out one */
  pricing: number | null;
};

/** Avg % over (+) or under (-) the cheapest other bid → 1-5. Lowest or tied is a 5. */
const PRICING_STEPS: [maxPctOver: number, score: number][] = [
  [0, 5],
  [5, 4],
  [15, 3],
  [30, 2],
];

export function pricingScoreFromVsLowest(avgVsLowestPct: number | null): number | null {
  if (avgVsLowestPct == null) return null;
  const pct = Math.round(avgVsLowestPct);
  return PRICING_STEPS.find(([max]) => pct <= max)?.[1] ?? 1;
}

/** Average margin % kept on their jobs → 1-5. */
const MARGIN_STEPS: [minPct: number, score: number][] = [
  [50, 5],
  [40, 4],
  [30, 3],
  [20, 2],
];

export function marginScoreFromPct(avgMarginPct: number | null): number | null {
  if (avgMarginPct == null) return null;
  const pct = Math.round(avgMarginPct);
  return MARGIN_STEPS.find(([min]) => pct >= min)?.[1] ?? 1;
}

export const PRICING_SCORE_HELP =
  "Average of two parts. Vs other subs: how their bids compare with the cheapest other sub on the same work (lowest or tied 5, up to 5% over 4, up to 15% 3, up to 30% 2, more 1). Margin kept: our average margin on their awarded bids and the jobs we paid them on, using the whole job's labor margin (50%+ 5, 40% 4, 30% 3, 20% 2, less 1). A job with an awarded bid counts once.";

export function isValidScore(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 5;
}

/** "4.3" for averages, "4" for whole numbers, "-" when missing. */
export function formatScore(v: number | null): string {
  if (v == null) return "-";
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/** "★★★★☆ 4.3" for plain-text spots (dropdown labels): stars rounded to the nearest one, then the exact number. */
export function starsText(v: number | null): string {
  if (v == null) return "";
  const n = Math.max(0, Math.min(5, Math.round(v)));
  return `${"★".repeat(n)}${"☆".repeat(5 - n)} ${formatScore(v)}`;
}
