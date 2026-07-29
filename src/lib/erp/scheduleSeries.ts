import { addDays, startOfDay } from "./schedule";

/** A multi-day range (e.g. Mon-Fri of one job) and a true weekly repeat
 * (e.g. every Monday for 8 weeks) are the same construct: repeatDays plus
 * an end date. This caps how far out that end date can be, so a
 * fat-fingered date doesn't generate thousands of rows and one giant
 * calendar invite. */
export const MAX_SERIES_SPAN_DAYS = 180;

export class SeriesDateRangeError extends Error {}

/** Every concrete date between startDate and endDate (inclusive) whose UTC
 * weekday is in repeatDays (0 = Sunday .. 6 = Saturday). Always bounded by
 * an explicit endDate, so the full set can be materialized up front. */
export function computeSeriesDates(startDate: Date, endDate: Date, repeatDays: number[]): Date[] {
  const start = startOfDay(startDate);
  const end = startOfDay(endDate);
  if (end < start) throw new SeriesDateRangeError("endDate must be on or after startDate");

  const spanDays = Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  if (spanDays > MAX_SERIES_SPAN_DAYS) {
    throw new SeriesDateRangeError(`Date range cannot span more than ${MAX_SERIES_SPAN_DAYS} days`);
  }

  const wantedWeekdays = new Set(repeatDays);
  const dates: Date[] = [];
  for (let day = start; day <= end; day = addDays(day, 1)) {
    if (wantedWeekdays.has(day.getUTCDay())) dates.push(day);
  }
  return dates;
}
