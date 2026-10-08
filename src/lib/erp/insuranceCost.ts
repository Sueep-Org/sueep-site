/**
 * What our insurance costs per day, for the Finance dashboard's overhead.
 * Pure, so it's easy to check by hand.
 *
 * A term's premium is spread evenly over every day from its effective date
 * up to (not including) its expiration date, the same way salaries are
 * spread. Cancelled early, it stops on the cancel date at the same daily
 * rate (the rest is refunded). An audit bill or refund counts in full on
 * its own date.
 */

/** One policy term's cost. Days are "YYYY-MM-DD". */
export type CostTerm = {
  /** Null when the policy has no effective date: assumed one year before expiration */
  effectiveKey: string | null;
  expiresKey: string;
  premiumCents: number | null;
  /** Bill (positive) or refund (negative) after the term's audit */
  auditAdjustmentCents: number | null;
  auditDateKey: string | null;
  cancelledOnKey: string | null;
};

const DAY_MS = 86_400_000;

function dayMs(key: string): number {
  return Date.parse(`${key}T00:00:00.000Z`);
}

/** First day of the term. */
export function termStartKey(t: Pick<CostTerm, "effectiveKey" | "expiresKey">): string {
  if (t.effectiveKey) return t.effectiveKey;
  const d = new Date(dayMs(t.expiresKey));
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

/** Premium for one day of the term (0 outside it, after cancellation, or with no premium). */
export function premiumOnDay(t: CostTerm, dayKey: string): number {
  if (!t.premiumCents) return 0;
  const start = termStartKey(t);
  const termDays = Math.round((dayMs(t.expiresKey) - dayMs(start)) / DAY_MS);
  if (termDays <= 0) return 0;
  const stop = t.cancelledOnKey && t.cancelledOnKey < t.expiresKey ? t.cancelledOnKey : t.expiresKey;
  if (dayKey < start || dayKey >= stop) return 0;
  return t.premiumCents / termDays;
}

/** Premium for a list of days plus any audit dated on one of them, rounded to cents. */
export function insuranceCostForDays(terms: CostTerm[], dayKeys: string[]): number {
  if (!dayKeys.length) return 0;
  const first = dayKeys[0];
  const last = dayKeys[dayKeys.length - 1];
  const days = new Set(dayKeys);
  let total = 0;
  for (const t of terms) {
    // Skip terms that don't touch these days at all.
    const stop = t.cancelledOnKey && t.cancelledOnKey < t.expiresKey ? t.cancelledOnKey : t.expiresKey;
    if (t.premiumCents && termStartKey(t) <= last && stop > first) {
      for (const d of dayKeys) total += premiumOnDay(t, d);
    }
    if (t.auditAdjustmentCents && t.auditDateKey && days.has(t.auditDateKey)) total += t.auditAdjustmentCents;
  }
  return Math.round(total);
}
