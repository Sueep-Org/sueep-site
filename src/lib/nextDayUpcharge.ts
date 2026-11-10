/**
 * Next day upcharge: work that starts today or tomorrow (Eastern) costs a
 * percent more, set on the Settings page (Pricing). Added on its own when a
 * property manager or GC requests online, and by a checkbox when the office
 * creates the job. Safe to import on the client.
 */
import { todayEasternKey } from "@/lib/erp/dates";

/** Used until someone saves a different percent on the Settings page. */
export const DEFAULT_NEXT_DAY_UPCHARGE_PERCENT = 20;

export function nextDayUpchargeLabel(pct: number): string {
  return `Next day upcharge (+${pct}%)`;
}

/** True when a start day (YYYY-MM-DD) is today or tomorrow, Eastern. */
export function isNextDayStart(startKey: string | null | undefined, now: Date = new Date()): boolean {
  if (!startKey) return false;
  const tomorrow = new Date(`${todayEasternKey(now)}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return startKey.slice(0, 10) <= tomorrow.toISOString().slice(0, 10);
}

/** How many days of a start-end range (YYYY-MM-DD) fall on today or tomorrow, Eastern. Only those days get the upcharge. */
export function nextDayCountInRange(startKey: string | null | undefined, endKey: string | null | undefined, now: Date = new Date()): number {
  if (!startKey || !isNextDayStart(startKey, now)) return 0;
  const tomorrow = new Date(`${todayEasternKey(now)}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const tomorrowKey = tomorrow.toISOString().slice(0, 10);
  const end = endKey && endKey >= startKey ? endKey.slice(0, 10) : startKey.slice(0, 10);
  const last = end < tomorrowKey ? end : tomorrowKey;
  const ms = new Date(`${last}T00:00:00Z`).getTime() - new Date(`${startKey.slice(0, 10)}T00:00:00Z`).getTime();
  return Math.round(ms / 86_400_000) + 1;
}

/**
 * The upcharge already inside a price that includes it, in cents: a $1,200
 * price at 20% holds $200 of upcharge (base $1,000 + $200). Uses today's
 * percent, so it's approximate if the percent changed since the job was priced.
 */
export function upchargeInPriceCents(priceCents: number, pct: number): number {
  if (priceCents <= 0 || pct <= 0) return 0;
  return Math.round((priceCents * pct) / (100 + pct));
}

/** The upcharge on a price, in cents. */
export function nextDayUpchargeCents(cents: number, pct: number): number {
  return Math.round((cents * pct) / 100);
}

/** A price with the upcharge added when it applies. */
export function withNextDayUpcharge(cents: number, applies: boolean, pct: number): number {
  return applies ? cents + nextDayUpchargeCents(cents, pct) : cents;
}
