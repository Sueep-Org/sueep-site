/** Blended crew hourly rate, validated against actual LaborEntry.hourlyRateCents
 *  logged on turnover jobs (avg $19.38/hr, median $20/hr). */
const BLENDED_HOURLY_RATE = 19.5;

/** Turnovers are priced so labor should land around half of contract value;
 *  actual margins have been averaging ~27-30%, so this is a target, not a
 *  reflection of what's currently happening. */
const TARGET_LABOR_SHARE_OF_PRICE = 0.5;

export function turnoverHoursBudget(contractValueCents: number, crewSize: number): number {
  const laborBudgetDollars = (contractValueCents / 100) * TARGET_LABOR_SHARE_OF_PRICE;
  return laborBudgetDollars / (crewSize * BLENDED_HOURLY_RATE);
}

/** Total budgeted person-hours for the job, independent of crew size.
 * turnoverHoursBudget(price, 1) gives the same number since duration and
 * crew size trade off 1:1 against a fixed work-hours budget. This is what
 * actual logged hours (summed across every LaborEntry, regardless of how
 * many different workers logged them) should be compared against. */
export function turnoverTotalHoursBudget(contractValueCents: number): number {
  return turnoverHoursBudget(contractValueCents, 1);
}

export type TurnoverMarginSeverity = "on-track" | "watch" | "bad";

/** Margin implied by hours logged so far, using the blended rate rather than
 * each worker's real hourlyRateCents, deliberately, so this can be shown to
 * supervisors without exposing individual pay rates (see showFinancials
 * gating in ProjectLaborSection). */
export function turnoverImpliedMarginPct(contractValueCents: number, actualHours: number): number {
  const impliedLaborCostDollars = actualHours * BLENDED_HOURLY_RATE;
  const priceDollars = contractValueCents / 100;
  if (priceDollars <= 0) return 0;
  return (1 - impliedLaborCostDollars / priceDollars) * 100;
}

export function turnoverMarginSeverity(marginPct: number): TurnoverMarginSeverity {
  if (marginPct >= TARGET_LABOR_SHARE_OF_PRICE * 100) return "on-track";
  if (marginPct >= 0) return "watch";
  return "bad";
}

const SEVERITY_RANK: Record<TurnoverMarginSeverity, number> = { "on-track": 0, watch: 1, bad: 2 };

/** True the first time a severity crosses into a worse tier (on-track to
 * watch, watch to bad, or on-track straight to bad). False if it was already
 * at that tier or worse, so a PM alert only fires on the entry that actually
 * caused the crossing, not on every entry logged after that point. */
export function turnoverMarginWorsened(
  before: TurnoverMarginSeverity,
  after: TurnoverMarginSeverity
): boolean {
  return SEVERITY_RANK[after] > SEVERITY_RANK[before];
}

/** Plain-text budget line(s) for the calendar invite email/description. Shows
 * a single number when the day's crew is already scheduled (ProjectWorkerDayAssignment),
 * otherwise a small table by crew size since headcount isn't locked in yet. */
export function formatTurnoverHoursBudgetText(contractValueCents: number, scheduledCrewSize: number): string {
  if (scheduledCrewSize > 0) {
    const hrs = turnoverHoursBudget(contractValueCents, scheduledCrewSize);
    return `Budget: ~${hrs.toFixed(1)} hrs with your ${scheduledCrewSize}-person crew (target: 50% margin on this job)`;
  }
  const rows = [1, 2, 3].map(
    (n) => `${n} worker${n > 1 ? "s" : ""} -> ~${turnoverHoursBudget(contractValueCents, n).toFixed(1)} hrs`
  );
  return `Budget by crew size (target: 50% margin on this job):\n${rows.join("\n")}`;
}
