/**
 * Sueep is a single-timezone (US Eastern) business. Date-only fields
 * (projectDate, requestedDate, workDate, etc.) are entered via `<input
 * type="date">` and parsed with `new Date("YYYY-MM-DD")`, which stores them
 * as literal UTC midnight — there's no real time-of-day or timezone attached,
 * it's just a calendar-day label. Reading that back with LOCAL Date methods
 * (setHours/getDate/...) is a bug: the result depends on whatever timezone
 * the server process happens to be running in, and for any zone behind UTC
 * (Eastern always is) a UTC-midnight label reads back as the previous day.
 * Always extract calendar components with the UTC getters instead.
 *
 * The other kind of "today" — comparing the current moment against a
 * date-only field to decide what's upcoming vs. active vs. today — does need
 * a real timezone conversion, since "today" rolls over at Eastern midnight,
 * not UTC midnight (UTC's date changes mid-evening, Eastern time). Use
 * todayEasternKey() for that.
 */

/** "YYYY-MM-DD" for right now, in US Eastern time (handles EST/EDT automatically). */
export function todayEasternKey(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** "YYYY-MM-DD" for a date-only field stored as UTC midnight — no timezone conversion, just reads the label back. */
export function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
