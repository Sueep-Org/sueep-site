/**
 * Price check on open post-construction quotes (DEALS_BILLING_PLAN Phase 6):
 * $ per sq ft against the usual range for the quote's type of work. Shown on
 * Estimation's Queue tab (dashboardBids.ts).
 */
import { percentile } from "./stats";
import {
  WORK_SCOPES,
  WORK_SCOPE_LABELS,
  dealUrl,
  outcomeOf,
  withErpWonAmounts,
  type Bundle,
  type RawDeal,
  type WorkScope,
} from "./postConDeals";
import { loadDeals } from "./dealEdits";

const DAY_MS = 86_400_000;

/** Fewer won jobs than this and the benchmark falls back to all bids of that type. */
const MIN_BENCHMARK_JOBS = 5;
/** Only quotes someone touched this recently are checked; older ones are on Stale quotes. */
export const PRICE_CHECK_ACTIVE_DAYS = 30;
/** This many times the middle price (or under 1 over it) is more likely a typo than a pricing call. Shared with Win/Loss. */
export const PRICE_TYPO_FACTOR = 3;

/** A $ per sq ft that far from the middle is usually a wrong Area SQFT or amount in HubSpot. */
export function isLikelyPriceTypo(perSqft: number, middle: number): boolean {
  return perSqft >= middle * PRICE_TYPO_FACTOR || perSqft <= middle / PRICE_TYPO_FACTOR;
}

export type PriceBenchmark = {
  scope: WorkScope;
  label: string;
  /** Usual range: the middle half of the jobs it's based on (25th to 75th percentile), and the middle */
  low: number;
  mid: number;
  high: number;
  basis: "won" | "all bids";
  samples: number;
};

export type PriceCheckRow = {
  id: string;
  name: string;
  scopeLabel: string;
  stage: string;
  owner: string | null;
  cents: number;
  sqft: number;
  perSqft: number;
  benchmark: PriceBenchmark;
  /** Quote vs the middle price, e.g. 0.42 = 42% above, -0.35 = 35% below */
  diff: number;
  url: string | null;
};

/**
 * Open bids active in the last PRICE_CHECK_ACTIVE_DAYS with an amount and Area
 * SQFT, compared with the usual range for that type of work: the middle half
 * of won jobs (ERP contract value when the job is in the ERP), or of all bids
 * of that type when there aren't MIN_BENCHMARK_JOBS won jobs.
 * - outside: above or below that range.
 * - checkNumbers: PRICE_TYPO_FACTOR times the middle or more (or a third or less),
 *   which is usually a wrong Area SQFT or amount in HubSpot.
 * Unknown type of work isn't checked.
 */
export async function quotePriceCheck(
  preloaded?: Bundle,
  now = new Date(),
): Promise<{ outside: PriceCheckRow[]; checkNumbers: PriceCheckRow[]; checked: number; benchmarks: PriceBenchmark[] }> {
  const bundle = preloaded ?? (await loadDeals());
  const { deals } = await withErpWonAmounts(bundle);
  const per = (d: RawDeal) => (d.sqft && d.cents ? d.cents / 100 / d.sqft : null);

  const benchmarks: PriceBenchmark[] = [];
  for (const scope of WORK_SCOPES) {
    if (scope === "UNKNOWN") continue;
    const ofType = deals.filter((d) => d.scope === scope && per(d) != null);
    const won = ofType.filter((d) => outcomeOf(bundle, d.stageId) === "won").map((d) => per(d)!);
    const basis = won.length >= MIN_BENCHMARK_JOBS ? "won" : "all bids";
    const values = (basis === "won" ? won : ofType.map((d) => per(d)!)).sort((a, b) => a - b);
    if (values.length < MIN_BENCHMARK_JOBS) continue;
    benchmarks.push({ scope, label: WORK_SCOPE_LABELS[scope], low: percentile(values, 0.25), mid: percentile(values, 0.5), high: percentile(values, 0.75), basis, samples: values.length });
  }

  const since = now.getTime() - PRICE_CHECK_ACTIVE_DAYS * DAY_MS;
  let checked = 0;
  const outside: PriceCheckRow[] = [], checkNumbers: PriceCheckRow[] = [];
  for (const d of deals) {
    if (outcomeOf(bundle, d.stageId) !== "open") continue;
    const active = Date.parse(d.lastActivity ?? d.created);
    if (!Number.isFinite(active) || active < since) continue;
    const p = per(d);
    const b = benchmarks.find((x) => x.scope === d.scope);
    if (p == null || !b) continue;
    checked++;
    const row: PriceCheckRow = {
      id: d.id,
      name: d.name,
      scopeLabel: WORK_SCOPE_LABELS[d.scope],
      stage: (bundle.stageLabels[d.stageId] ?? d.stageId).trim(),
      owner: d.ownerId ? (bundle.owners[d.ownerId] ?? null) : null,
      cents: d.cents,
      sqft: d.sqft!,
      perSqft: p,
      benchmark: b,
      diff: p / b.mid - 1,
      url: dealUrl(bundle.hubId, d.id),
    };
    if (isLikelyPriceTypo(p, b.mid)) checkNumbers.push(row);
    else if (p > b.high || p < b.low) outside.push(row);
  }
  const byDistance = (a: PriceCheckRow, b: PriceCheckRow) => Math.abs(b.diff) - Math.abs(a.diff);
  return { outside: outside.sort(byDistance), checkNumbers: checkNumbers.sort(byDistance), checked, benchmarks };
}
