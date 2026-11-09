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
 * Field, worked out from what happens on their days (sub portal, last 180
 * days), averages whichever parts have at least FIELD_MIN_SAMPLES behind them:
 *  - On time: check-ins on days with a start time that weren't late (a
 *    missed check-in counts as late).
 *  - Offers accepted: of the job offers they answered or let run out.
 *  - Passed first time: of their days that passed review, how many with no
 *    fix asked.
 *  - Crew showed up: people who came vs the crew they said, per day.
 * Overall averages Confidence, Pricing and Field, whichever they have.
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

export type FieldPart = { score: number | null; good: number; total: number };

/** Field record: each part's score (null under FIELD_MIN_SAMPLES) and the counts behind it. */
export type FieldRecord = {
  onTime: FieldPart;
  offers: FieldPart;
  firstPass: FieldPart;
  /** good/total here are people who came / people planned, capped per day at the plan */
  crew: FieldPart;
};

/** Defaults; Settings, Subs can change both (subFieldScoreDays, subFieldScoreMinSamples) */
export const FIELD_MIN_SAMPLES = 3;
export const FIELD_DAYS = 180;

type Steps = [min: number, score: number][];
const ON_TIME_STEPS: Steps = [[95, 5], [85, 4], [70, 3], [50, 2]];
const OFFER_STEPS: Steps = [[80, 5], [65, 4], [50, 3], [35, 2]];
const FIRST_PASS_STEPS: Steps = [[90, 5], [75, 4], [60, 3], [40, 2]];
const CREW_STEPS: Steps = [[98, 5], [90, 4], [75, 3], [50, 2]];

function stepScore(pct: number, steps: Steps): number {
  return steps.find(([min]) => Math.round(pct) >= min)?.[1] ?? 1;
}

/** One part: needs minSamples (days or offers); crew counts days through `samples`. */
export function fieldPart(kind: keyof FieldRecord, good: number, total: number, samples = total, minSamples = FIELD_MIN_SAMPLES): FieldPart {
  if (samples < minSamples || total <= 0) return { score: null, good, total };
  const steps = { onTime: ON_TIME_STEPS, offers: OFFER_STEPS, firstPass: FIRST_PASS_STEPS, crew: CREW_STEPS }[kind];
  return { score: stepScore((good / total) * 100, steps), good, total };
}

export function fieldScore(r: FieldRecord): number | null {
  const parts = [r.onTime, r.offers, r.firstPass, r.crew].map((p) => p.score).filter((v): v is number => v != null);
  return parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : null;
}

export const EMPTY_FIELD_RECORD: FieldRecord = {
  onTime: { score: null, good: 0, total: 0 },
  offers: { score: null, good: 0, total: 0 },
  firstPass: { score: null, good: 0, total: 0 },
  crew: { score: null, good: 0, total: 0 },
};

export const fieldScoreHelp = (days = FIELD_DAYS, minSamples = FIELD_MIN_SAMPLES) =>
  `From their days in the sub portal, last ${days} days. Averages the parts with at least ${minSamples} days or offers behind them (both set on Settings, Subs). On time: checked in by start time plus the grace window (95%+ 5, 85% 4, 70% 3, 50% 2, less 1). Offers accepted (80% 5, 65% 4, 50% 3, 35% 2). Passed review first time, no fix asked (90% 5, 75% 4, 60% 3, 40% 2). Crew showed up vs the crew they said (98% 5, 90% 4, 75% 3, 50% 2).`;

export const OVERALL_SCORE_HELP = "Average of Confidence (your ratings), Pricing and Field, whichever they have.";

export function overallScore(parts: (number | null)[]): number | null {
  const have = parts.filter((v): v is number => v != null);
  return have.length ? have.reduce((a, b) => a + b, 0) / have.length : null;
}

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
  /** From their days in the sub portal */
  field: number | null;
  fieldRecord: FieldRecord;
  /** Average of confidence, pricing and field */
  overall: number | null;
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
