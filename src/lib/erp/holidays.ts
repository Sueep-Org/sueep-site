/**
 * Company holidays: no work is planned on these days. The calendars mark
 * them, and scheduling something on one asks first (it's allowed, just not
 * by accident). Add next year's list here when it's set.
 *
 * Plain data, no server imports, so client components can use it.
 */
export const COMPANY_HOLIDAYS: Record<string, string> = {
  // 2026
  "2026-01-19": "Martin Luther King Jr. Day",
  "2026-05-25": "Memorial Day",
  "2026-07-03": "Independence Day",
  "2026-09-07": "Labor Day",
  "2026-11-26": "Thanksgiving Day",
  "2026-12-24": "Christmas Eve",
  "2026-12-25": "Christmas Day",
  "2026-12-31": "New Year's Eve",
  // 2027
  "2027-01-01": "New Year's Day",
};

/** The holiday on a day ("YYYY-MM-DD", or a longer ISO string), or null. */
export function holidayOn(dayKey: string | null | undefined): string | null {
  if (!dayKey) return null;
  return COMPANY_HOLIDAYS[dayKey.slice(0, 10)] ?? null;
}

/** Holidays inside a range of days (inclusive), as "Thanksgiving Day (Nov 26)". */
export function holidaysBetween(startKey: string | null | undefined, endKey: string | null | undefined): string[] {
  if (!startKey) return [];
  const from = startKey.slice(0, 10);
  const to = (endKey && endKey >= startKey ? endKey : startKey).slice(0, 10);
  return Object.entries(COMPANY_HOLIDAYS)
    .filter(([k]) => k >= from && k <= to)
    .map(([k, name]) => `${name} (${shortDay(k)})`);
}

function shortDay(dayKey: string): string {
  return new Date(`${dayKey.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** Options for the ERP confirm dialog when scheduling on a holiday. */
export function holidayConfirm(dayKey: string): { title: string; message: string; confirmLabel: string; danger: false } | null {
  const name = holidayOn(dayKey);
  if (!name) return null;
  return {
    title: `${shortDay(dayKey)} is ${name}`,
    message: "It's a company holiday, so nobody should be working. Schedule work on it anyway?",
    confirmLabel: "Schedule anyway",
    danger: false,
  };
}
