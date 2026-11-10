/**
 * Company holidays: no work is planned on these days. The calendars mark
 * them, and scheduling something on one asks first (it's allowed, just not
 * by accident).
 *
 * The list lives in AppSetting "companyHolidays" (loaded by holidaysServer.ts
 * and handed to client components by HolidaysProvider / useHolidays). Until
 * one is saved, DEFAULT_COMPANY_HOLIDAYS is used.
 *
 * Plain data and pure helpers, no server imports, so client components can use it.
 */
export type CompanyHoliday = { date: string; name: string };

export const COMPANY_HOLIDAYS_SETTING_KEY = "companyHolidays";

export const DEFAULT_COMPANY_HOLIDAYS: CompanyHoliday[] = [
  { date: "2026-01-19", name: "Martin Luther King Jr. Day" },
  { date: "2026-05-25", name: "Memorial Day" },
  { date: "2026-07-03", name: "Independence Day" },
  { date: "2026-09-07", name: "Labor Day" },
  { date: "2026-11-26", name: "Thanksgiving Day" },
  { date: "2026-12-24", name: "Christmas Eve" },
  { date: "2026-12-25", name: "Christmas Day" },
  { date: "2026-12-31", name: "New Year's Eve" },
  { date: "2027-01-01", name: "New Year's Day" },
];

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** "YYYY-MM-DD" that exists on the calendar (Feb 30 doesn't roll over to March). */
export function isRealDay(date: string): boolean {
  if (!DAY_RE.test(date)) return false;
  const d = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
}

/**
 * A saved list, cleaned: real dates, a name, one holiday per day, sorted.
 * Null when it isn't a list at all (then the default is used).
 */
export function parseCompanyHolidays(raw: unknown): CompanyHoliday[] | null {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(value)) return null;
  const byDate = new Map<string, CompanyHoliday>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const date = String((item as { date?: unknown }).date ?? "").slice(0, 10);
    const name = String((item as { name?: unknown }).name ?? "").trim().slice(0, 80);
    if (!isRealDay(date) || !name) continue;
    byDate.set(date, { date, name });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function shortDay(dayKey: string): string {
  return new Date(`${dayKey.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export type HolidayHelpers = {
  list: CompanyHoliday[];
  /** The holiday on a day ("YYYY-MM-DD", or a longer ISO string), or null. */
  holidayOn: (dayKey: string | null | undefined) => string | null;
  /** Holidays inside a range of days (inclusive), as "Thanksgiving Day (Nov 26)". */
  holidaysBetween: (startKey: string | null | undefined, endKey: string | null | undefined) => string[];
  /** Options for the ERP confirm dialog when scheduling on a holiday, or null on a normal day. */
  holidayConfirm: (dayKey: string) => { title: string; message: string; confirmLabel: string; danger: false } | null;
};

/** Lookup helpers over one list of holidays. */
export function makeHolidayHelpers(list: CompanyHoliday[]): HolidayHelpers {
  const byDate = new Map(list.map((h) => [h.date, h.name]));
  const holidayOn = (dayKey: string | null | undefined) => (dayKey ? (byDate.get(dayKey.slice(0, 10)) ?? null) : null);
  return {
    list,
    holidayOn,
    holidaysBetween(startKey, endKey) {
      if (!startKey) return [];
      const from = startKey.slice(0, 10);
      const to = (endKey && endKey >= startKey ? endKey : startKey).slice(0, 10);
      return list.filter((h) => h.date >= from && h.date <= to).map((h) => `${h.name} (${shortDay(h.date)})`);
    },
    holidayConfirm(dayKey) {
      const name = holidayOn(dayKey);
      if (!name) return null;
      return {
        title: `${shortDay(dayKey)} is ${name}`,
        message: "It's a company holiday, so nobody should be working. Schedule work on it anyway?",
        confirmLabel: "Schedule anyway",
        danger: false,
      };
    },
  };
}
