/**
 * Next day upcharge: work that starts today or tomorrow (Eastern) costs 25%
 * more. Added on its own when a property manager or GC requests online, and
 * by a checkbox when the office creates the job. A test for now, so one flat
 * percent everywhere. Safe to import on the client.
 */
import { todayEasternKey } from "@/lib/erp/dates";

export const NEXT_DAY_UPCHARGE_PERCENT = 25;
export const NEXT_DAY_UPCHARGE_LABEL = `Next day upcharge (+${NEXT_DAY_UPCHARGE_PERCENT}%)`;

/** True when a start day (YYYY-MM-DD) is today or tomorrow, Eastern. */
export function isNextDayStart(startKey: string | null | undefined, now: Date = new Date()): boolean {
  if (!startKey) return false;
  const tomorrow = new Date(`${todayEasternKey(now)}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return startKey.slice(0, 10) <= tomorrow.toISOString().slice(0, 10);
}

/** The upcharge on a price, in cents. */
export function nextDayUpchargeCents(cents: number): number {
  return Math.round((cents * NEXT_DAY_UPCHARGE_PERCENT) / 100);
}

/** A price with the upcharge added when it applies. */
export function withNextDayUpcharge(cents: number, applies: boolean): number {
  return applies ? cents + nextDayUpchargeCents(cents) : cents;
}
