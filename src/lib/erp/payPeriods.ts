/**
 * Biweekly pay periods, counted in 14-day steps from the payroll anchor
 * Monday (AppSetting "payrollAnchor"). Dates are UTC-midnight day labels,
 * same convention as the rest of the ERP (see dates.ts).
 */

export const DEFAULT_PAYROLL_ANCHOR = "2024-01-01";
export const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

export function anchorDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

export function biweeklyIndex(date: Date, anchor: Date): number {
  return Math.floor((date.getTime() - anchor.getTime()) / TWO_WEEKS_MS);
}

export function biweeklyRange(index: number, anchor: Date): { start: Date; end: Date } {
  const start = new Date(anchor.getTime() + index * TWO_WEEKS_MS);
  const end = new Date(start.getTime() + TWO_WEEKS_MS - 1);
  return { start, end };
}

/** The pay period a "YYYY-MM-DD" day falls in. */
export function payPeriodForDay(day: string, anchorIso: string): { start: Date; end: Date } {
  const anchor = anchorDate(anchorIso);
  return biweeklyRange(biweeklyIndex(new Date(`${day}T00:00:00Z`), anchor), anchor);
}

/**
 * A "YYYY-MM-DD" paid date as the timestamp to store on commissionPaidAt /
 * CommissionPayout.paidAt. Noon UTC keeps it inside that UTC day, which is
 * how payroll buckets payouts into periods. Null when not a valid day.
 */
export function paidDayToTimestamp(value: unknown): Date | null {
  const s = String(value ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}
