/**
 * A subcontractor's insurance status from the policies on their profile:
 * VALID, EXPIRING (within 30 days), EXPIRED, or MISSING.
 *
 * Until Sueep sets minimum requirements for subs, general liability and
 * workers' comp (or a workers' comp exemption) are treated as required.
 * Auto and umbrella only count once a date has been entered.
 */

import { expiryStatus } from "./insurance";
import { todayEasternKey, utcDateKey } from "./dates";

export type SubCoverageInput = {
  hasInsurance: boolean | null;
  workersCompExpiresAt: Date | null;
  workersCompExempt: boolean;
  glExpiresAt: Date | null;
  autoExpiresAt: Date | null;
  umbrellaExpiresAt: Date | null;
};

export type CoverageItemStatus = "CURRENT" | "EXPIRING" | "EXPIRED" | "MISSING" | "EXEMPT";
export type CoverageItem = { key: string; label: string; expiresAt: string | null; status: CoverageItemStatus; daysLeft: number | null };
export type SubCoverageStatus = "VALID" | "EXPIRING" | "EXPIRED" | "MISSING";

const SHORT_DATE: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" };

function item(key: string, label: string, date: Date | null, required: boolean, todayKey: string): CoverageItem | null {
  if (!date) return required ? { key, label, expiresAt: null, status: "MISSING", daysLeft: null } : null;
  const s = expiryStatus(date, todayKey);
  return { key, label, expiresAt: utcDateKey(date), status: s.status === "CURRENT" ? "CURRENT" : s.status, daysLeft: s.daysLeft };
}

export function subCoverage(c: SubCoverageInput, todayKey: string = todayEasternKey()): { status: SubCoverageStatus; items: CoverageItem[]; summary: string } {
  const items = [
    item("gl", "General liability", c.glExpiresAt, true, todayKey),
    c.workersCompExempt
      ? ({ key: "wc", label: "Workers' comp", expiresAt: null, status: "EXEMPT", daysLeft: null } as CoverageItem)
      : item("wc", "Workers' comp", c.workersCompExpiresAt, true, todayKey),
    item("auto", "Auto", c.autoExpiresAt, false, todayKey),
    item("umbrella", "Umbrella", c.umbrellaExpiresAt, false, todayKey),
  ].filter((i): i is CoverageItem => i != null);

  const of = (s: CoverageItemStatus) => items.filter((i) => i.status === s);
  const names = (list: CoverageItem[]) => list.map((i) => i.label.toLowerCase()).join(", ");

  if (c.hasInsurance === false) return { status: "MISSING", items, summary: "No insurance" };
  const expired = of("EXPIRED");
  if (expired.length) return { status: "EXPIRED", items, summary: `Expired: ${names(expired)}` };
  const missing = of("MISSING");
  if (missing.length) return { status: "MISSING", items, summary: `Missing: ${names(missing)}` };
  const expiring = of("EXPIRING");
  if (expiring.length) {
    const soonest = Math.min(...expiring.map((i) => i.daysLeft ?? 0));
    const list = names(expiring);
    return { status: "EXPIRING", items, summary: `${list.charAt(0).toUpperCase()}${list.slice(1)} expiring in ${soonest} day${soonest === 1 ? "" : "s"}` };
  }
  const dates = items.map((i) => i.expiresAt).filter((d): d is string => !!d).sort();
  const until = dates[0] ? new Date(`${dates[0]}T00:00:00Z`).toLocaleDateString("en-US", SHORT_DATE) : null;
  return { status: "VALID", items, summary: until ? `Valid until ${until}` : "Valid" };
}

export const SUB_STATUS_STYLE: Record<SubCoverageStatus, { label: string; cls: string }> = {
  VALID: { label: "Valid", cls: "bg-emerald-50 text-emerald-700" },
  EXPIRING: { label: "Expiring", cls: "bg-amber-50 text-amber-700" },
  EXPIRED: { label: "Expired", cls: "bg-red-50 text-red-700" },
  MISSING: { label: "Missing", cls: "bg-gray-100 text-gray-600" },
};
