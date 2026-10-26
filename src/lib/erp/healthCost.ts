/**
 * What the company health plan (Independence Blue Cross) costs Sueep.
 *
 * Each HealthCoverage row is one person's full monthly premium from the IBX
 * bill. Sueep pays a share of it (AppSetting "healthCompanySharePct", 25% by
 * default); the person pays the rest through ADP. Only Sueep's share is a
 * cost here. A month's premium is spread evenly over its days, the same way
 * Finance spreads salaries and insurance, so a pay period or a month in
 * progress gets its share of the days it covers.
 */

export const HEALTH_SHARE_SETTING_KEY = "healthCompanySharePct";
export const DEFAULT_HEALTH_SHARE_PCT = 25;

export type CoverageSpan = {
  employeeId: string | null;
  monthlyPremiumCents: number;
  /** "YYYY-MM-DD", first covered day */
  startKey: string;
  /** "YYYY-MM-DD", last covered day, null while still covered */
  endKey: string | null;
};

function daysInMonth(dayKey: string): number {
  const [y, m] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function isCoveredOn(c: CoverageSpan, dayKey: string): boolean {
  return c.startKey <= dayKey && (c.endKey == null || dayKey <= c.endKey);
}

/** Sueep's share, in cents (unrounded), of every coverage over these days. */
export function healthCompanyCostForDays(coverages: CoverageSpan[], dayKeys: string[], sharePct: number): number {
  let total = 0;
  for (const day of dayKeys) {
    const days = daysInMonth(day);
    for (const c of coverages) {
      if (isCoveredOn(c, day)) total += c.monthlyPremiumCents / days;
    }
  }
  return (total * sharePct) / 100;
}

export function parseHealthSharePct(raw: string | null | undefined): number {
  const v = Number(raw);
  return raw != null && Number.isFinite(v) && v >= 0 && v <= 100 ? v : DEFAULT_HEALTH_SHARE_PCT;
}
