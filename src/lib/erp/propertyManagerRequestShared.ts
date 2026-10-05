/**
 * Turnover requests from property manager links: the parts both the form
 * (live estimate) and the server (checking what was sent) need. Safe to
 * import on the client.
 */

import { computeTurnoverPricing } from "@/lib/turnoverPricing";
import type { TurnoverPricingPackage } from "@/lib/turnoverPricingPackages";

/** Bedroom/bathroom choices on the form. 0 bedrooms is a studio. */
export const REQUEST_LAYOUTS = [
  { value: "0/1", label: "Studio", bedrooms: 0, bathrooms: 1 },
  { value: "1/1", label: "1 bed / 1 bath", bedrooms: 1, bathrooms: 1 },
  { value: "2/1", label: "2 bed / 1 bath", bedrooms: 2, bathrooms: 1 },
  { value: "2/2", label: "2 bed / 2 bath", bedrooms: 2, bathrooms: 2 },
  { value: "3/1", label: "3 bed / 1 bath", bedrooms: 3, bathrooms: 1 },
  { value: "3/2", label: "3 bed / 2 bath", bedrooms: 3, bathrooms: 2 },
  { value: "3/3", label: "3 bed / 3 bath", bedrooms: 3, bathrooms: 3 },
] as const;

export type RequestLayoutValue = (typeof REQUEST_LAYOUTS)[number]["value"];

/** The closest form choice for a unit's real bedrooms/bathrooms, e.g. a 4/3 shows as 3/3. */
export function requestLayoutFor(bedrooms: number | null, bathrooms: number | null): RequestLayoutValue | null {
  if (bedrooms == null) return null;
  if (bedrooms <= 0) return "0/1";
  const beds = Math.min(3, bedrooms);
  const baths = Math.max(1, Math.min(beds, bathrooms ?? 1));
  return (REQUEST_LAYOUTS.find((l) => l.bedrooms === beds && l.bathrooms === baths)?.value ?? null) as RequestLayoutValue | null;
}

export function requestLayoutLabel(bedrooms: number, bathrooms: number, isCommonArea = false): string {
  if (isCommonArea) return "Common area";
  return REQUEST_LAYOUTS.find((l) => l.bedrooms === bedrooms && l.bathrooms === bathrooms)?.label ?? `${bedrooms} bed / ${bathrooms} bath`;
}

export const REQUEST_WORK = [
  { key: "fullClean", label: "Full clean" },
  { key: "fullPaint", label: "Full paint" },
  { key: "touchUpPaint", label: "Paint touch-up" },
  { key: "carpetCleaning", label: "Carpet cleaning" },
] as const;

export type RequestWork = { fullClean: boolean; fullPaint: boolean; touchUpPaint: boolean; carpetCleaning: boolean };

/** Work names for a request, with "Other" shown as what they typed. */
export function requestWorkLabels(work: RequestWork & { otherWork: boolean; otherDescription: string | null }): string[] {
  const labels: string[] = REQUEST_WORK.filter((w) => work[w.key] && !(w.key === "touchUpPaint" && work.fullPaint)).map((w) => w.label);
  if (work.otherWork) labels.push(work.otherDescription?.trim() || "Other");
  return labels;
}

/** Same math staff pricing uses. Touch-up is one item and is dropped when the unit gets a full paint. */
export function estimateRequestCents(
  pricingPackage: TurnoverPricingPackage,
  bedrooms: number,
  bathrooms: number,
  work: RequestWork,
  isCommonArea = false,
): number {
  return computeTurnoverPricing({
    requestType: "TURNOVER",
    pricingPackage,
    bedrooms,
    bathrooms,
    isCommonArea,
    fullClean: work.fullClean,
    fullPaint: work.fullPaint,
    touchUpPaint: work.touchUpPaint && !work.fullPaint ? 1 : 0,
    carpetCleaning: work.carpetCleaning,
    materialsAdditional: false,
    ceilingPaint: false,
    compounding: 0,
  }).priceCents;
}

/** The instant it's 8 AM Eastern on a YYYY-MM-DD day (handles EST/EDT). */
function easternEightAm(dayKey: string): Date {
  for (const offset of ["-04:00", "-05:00"]) {
    const d = new Date(`${dayKey}T08:00:00${offset}`);
    const hour = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" }).format(d);
    if (Number(hour) === 8) return d;
  }
  return new Date(`${dayKey}T12:00:00Z`);
}

/**
 * Last moment a property manager can cancel or move a confirmed turnover
 * themselves: 8 AM Eastern the day before it starts. Turnover dates are
 * whole days, so this stands in for "24 hours before".
 */
export function changeDeadline(startKey: string): Date {
  const dayBefore = new Date(`${startKey}T00:00:00Z`);
  dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
  return easternEightAm(dayBefore.toISOString().slice(0, 10));
}

export function changeDeadlineLabel(deadline: Date): string {
  return deadline.toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
