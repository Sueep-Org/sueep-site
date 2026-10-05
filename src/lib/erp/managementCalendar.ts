/**
 * Shared pieces of the Schedule page's Management calendar: item shape,
 * category colors, and how repeating events expand into dates. Safe to
 * import on the client. Dates are "YYYY-MM-DD" day labels throughout.
 */

export type ManagementCategoryDto = {
  id: string;
  builtinKey: string | null;
  name: string;
  color: string;
  remindDays: number[];
  sortOrder: number;
  eventCount: number;
};

export type ManagementItem = {
  /** Unique per occurrence */
  key: string;
  categoryId: string;
  title: string;
  /** First and last day, inclusive. Same day for a one-day item. */
  start: string;
  end: string;
  /** Second line, e.g. carrier and policy number */
  detail: string | null;
  /** Shown only in the item's dialog */
  notes: string | null;
  /** Where to fix the date (automatic items), or the event's own link */
  href: string | null;
  /** Set for manual events */
  event?: {
    id: string;
    repeat: RepeatValue;
    /** The event's own first day and last day, for the edit form */
    startDate: string;
    endDate: string | null;
    link: string | null;
  };
  /** Manual event occurrence marked done, or a pay period already closed */
  done: boolean;
};

export const REPEAT_OPTIONS = [
  { value: "NONE", label: "Doesn't repeat" },
  { value: "MONTHLY", label: "Every month" },
  { value: "YEARLY", label: "Every year" },
] as const;
export type RepeatValue = (typeof REPEAT_OPTIONS)[number]["value"];

export function isRepeatValue(v: unknown): v is RepeatValue {
  return REPEAT_OPTIONS.some((o) => o.value === v);
}

export const BUILTIN_KEYS = [
  "SUEEP_INSURANCE",
  "SUB_INSURANCE",
  "PROJECT_COIS",
  "COI_REQUESTS",
  "TIME_OFF",
  "BACKGROUND_CHECKS",
  "EMPLOYEE_DOCUMENTS",
  "JANITORIAL_CONTRACTS",
  "PAYROLL",
] as const;
export type BuiltinKey = (typeof BUILTIN_KEYS)[number];

/** What fills each automatic category, for the categories dialog. */
export const BUILTIN_SOURCE: Record<BuiltinKey, string> = {
  SUEEP_INSURANCE: "Expiration dates of active policies on the Insurance page",
  SUB_INSURANCE: "Contractors' general liability, workers' comp, auto and umbrella expirations",
  PROJECT_COIS: "Expiration of the current COI per holder on open projects",
  COI_REQUESTS: "Needed-by date on open COI requests",
  TIME_OFF: "Employee and contractor time off",
  BACKGROUND_CHECKS: "Background check expirations for active employees and contractors",
  EMPLOYEE_DOCUMENTS: "Expiration dates on active employees' documents",
  JANITORIAL_CONTRACTS: "End dates on janitorial contracts",
  PAYROLL: "Last day of each pay period (checked once payroll is closed)",
};

/** Full class strings so Tailwind keeps them. */
export const CATEGORY_COLORS: Record<string, { chip: string; dot: string }> = {
  rose: { chip: "bg-rose-200 text-rose-900 hover:bg-rose-300", dot: "bg-rose-400" },
  orange: { chip: "bg-orange-200 text-orange-900 hover:bg-orange-300", dot: "bg-orange-400" },
  amber: { chip: "bg-amber-200 text-amber-900 hover:bg-amber-300", dot: "bg-amber-400" },
  yellow: { chip: "bg-yellow-200 text-yellow-900 hover:bg-yellow-300", dot: "bg-yellow-400" },
  lime: { chip: "bg-lime-200 text-lime-900 hover:bg-lime-300", dot: "bg-lime-500" },
  emerald: { chip: "bg-emerald-200 text-emerald-900 hover:bg-emerald-300", dot: "bg-emerald-400" },
  teal: { chip: "bg-teal-200 text-teal-900 hover:bg-teal-300", dot: "bg-teal-400" },
  cyan: { chip: "bg-cyan-200 text-cyan-900 hover:bg-cyan-300", dot: "bg-cyan-400" },
  sky: { chip: "bg-sky-200 text-sky-900 hover:bg-sky-300", dot: "bg-sky-400" },
  blue: { chip: "bg-blue-200 text-blue-900 hover:bg-blue-300", dot: "bg-blue-400" },
  indigo: { chip: "bg-indigo-200 text-indigo-900 hover:bg-indigo-300", dot: "bg-indigo-400" },
  violet: { chip: "bg-violet-200 text-violet-900 hover:bg-violet-300", dot: "bg-violet-400" },
  fuchsia: { chip: "bg-fuchsia-200 text-fuchsia-900 hover:bg-fuchsia-300", dot: "bg-fuchsia-400" },
  pink: { chip: "bg-pink-200 text-pink-900 hover:bg-pink-300", dot: "bg-pink-400" },
  slate: { chip: "bg-slate-200 text-slate-900 hover:bg-slate-300", dot: "bg-slate-500" },
  stone: { chip: "bg-stone-200 text-stone-900 hover:bg-stone-300", dot: "bg-stone-500" },
  gray: { chip: "bg-gray-200 text-gray-800 hover:bg-gray-300", dot: "bg-gray-400" },
};

export function categoryColor(color: string) {
  return CATEGORY_COLORS[color] ?? CATEGORY_COLORS.gray;
}

/** "30, 7" from {30,7}, and back. Keeps whole days 0 to 365, largest first. */
export function formatRemindDays(days: number[]): string {
  return days.join(", ");
}
export function parseRemindDays(value: unknown): number[] | null {
  const list = Array.isArray(value) ? value : String(value ?? "").split(",");
  const out = new Set<number>();
  for (const raw of list) {
    const s = String(raw).trim();
    if (!s) continue;
    const n = Number(s);
    if (!Number.isInteger(n) || n < 0 || n > 365) return null;
    out.add(n);
  }
  return Array.from(out).sort((a, b) => b - a);
}

const DAY_MS = 86_400_000;

export function keyToDate(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}
export function dateToKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
export function addDaysKey(key: string, n: number): string {
  return dateToKey(new Date(keyToDate(key).getTime() + n * DAY_MS));
}
export function daysBetween(fromKey: string, toKey: string): number {
  return Math.round((keyToDate(toKey).getTime() - keyToDate(fromKey).getTime()) / DAY_MS);
}

/** Same month and day in another year/month, pulled back to the month's last day when it doesn't exist (Feb 29, the 31st). */
function sameDayIn(year: number, monthIndex: number, day: number): string {
  const last = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return dateToKey(new Date(Date.UTC(year, monthIndex, Math.min(day, last))));
}

/**
 * The occurrences of an event that touch [rangeStart, rangeEnd]. A repeating
 * event keeps its length (a 3-day event repeats as 3 days) and never starts
 * before its first day.
 */
export function eventOccurrences(
  startKey: string,
  endKey: string | null,
  repeat: RepeatValue,
  rangeStart: string,
  rangeEnd: string
): { start: string; end: string }[] {
  const length = endKey && endKey > startKey ? daysBetween(startKey, endKey) : 0;
  const touches = (s: string) => s <= rangeEnd && addDaysKey(s, length) >= rangeStart;
  if (repeat === "NONE") return touches(startKey) ? [{ start: startKey, end: addDaysKey(startKey, length) }] : [];

  const first = keyToDate(startKey);
  const day = first.getUTCDate();
  // Start a step early so an occurrence that began before the range but runs into it is caught.
  const from = keyToDate(addDaysKey(rangeStart, -length));
  const to = keyToDate(rangeEnd);
  const starts: string[] = [];
  if (repeat === "YEARLY") {
    for (let y = from.getUTCFullYear(); y <= to.getUTCFullYear(); y++) starts.push(sameDayIn(y, first.getUTCMonth(), day));
  } else {
    let y = from.getUTCFullYear();
    let m = from.getUTCMonth();
    while (y < to.getUTCFullYear() || (y === to.getUTCFullYear() && m <= to.getUTCMonth())) {
      starts.push(sameDayIn(y, m, day));
      m++;
      if (m === 12) {
        m = 0;
        y++;
      }
    }
  }
  return starts.filter((s) => s >= startKey && touches(s)).map((s) => ({ start: s, end: addDaysKey(s, length) }));
}

const SHORT: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", timeZone: "UTC" };
const SHORT_YEAR: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" };

/** "Oct 5, 2026" or "Oct 5 to Oct 9, 2026" */
export function formatItemDates(start: string, end: string): string {
  if (start === end) return keyToDate(start).toLocaleDateString("en-US", SHORT_YEAR);
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${keyToDate(start).toLocaleDateString("en-US", sameYear ? SHORT : SHORT_YEAR)} to ${keyToDate(end).toLocaleDateString("en-US", SHORT_YEAR)}`;
}
