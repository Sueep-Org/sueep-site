/**
 * Splitting a total of manual hours across a date range, shared by the
 * Payroll page's Add hours form (for its preview) and the API (which saves
 * one entry per day), so the two always agree.
 */

/** Working days (Monday to Friday) from `from` to `to`, inclusive, "YYYY-MM-DD". */
export function workingDaysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  const end = new Date(`${to}T00:00:00.000Z`);
  for (let d = new Date(`${from}T00:00:00.000Z`); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const weekday = d.getUTCDay();
    if (weekday !== 0 && weekday !== 6) days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

/**
 * The total split evenly across the range's working days, to the hundredth
 * of an hour. Any rounding left over goes on the last day, so the days
 * always add up to exactly the total (80 hours over two weeks is 8 a day).
 */
export function splitHoursOverWorkingDays(from: string, to: string, totalHours: number): { date: string; hours: number }[] {
  const days = workingDaysBetween(from, to);
  if (days.length === 0 || !(totalHours > 0)) return [];
  const totalHundredths = Math.round(totalHours * 100);
  const perDay = Math.floor(totalHundredths / days.length);
  return days.map((date, i) => ({
    date,
    hours: (i === days.length - 1 ? totalHundredths - perDay * (days.length - 1) : perDay) / 100,
  }));
}
