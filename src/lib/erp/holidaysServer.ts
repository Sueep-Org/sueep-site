import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { SETTINGS_CACHE_TAG } from "@/lib/pricingSettingsServer";
import { COMPANY_HOLIDAYS_SETTING_KEY, DEFAULT_COMPANY_HOLIDAYS, parseCompanyHolidays, type CompanyHoliday } from "./holidays";
import { loadJanitorialShifts } from "./janitorialScheduleServer";

/** The saved company holidays, or the built-in list until one is saved. */
async function read(): Promise<CompanyHoliday[]> {
  const row = await prisma.appSetting.findUnique({ where: { key: COMPANY_HOLIDAYS_SETTING_KEY } });
  return (row ? parseCompanyHolidays(row.value) : null) ?? DEFAULT_COMPANY_HOLIDAYS;
}

/** Cached like the other settings; saving one clears SETTINGS_CACHE_TAG. */
export const loadCompanyHolidays = unstable_cache(read, ["company-holidays"], { tags: [SETTINGS_CACHE_TAG], revalidate: 300 });

/** Past holidays are history (payroll, schedules): they can't be added, renamed or removed. Returns the error, or null. */
export function pastHolidaysChanged(before: CompanyHoliday[], after: CompanyHoliday[], today: string): string | null {
  const past = (list: CompanyHoliday[]) => list.filter((h) => h.date < today).map((h) => `${h.date}|${h.name}`).sort().join(",");
  return past(before) === past(after) ? null : "Holidays before today can't be added, renamed or removed.";
}

/** Work already on a day that just became a holiday, so the Admin can move it. Nothing is moved. */
export type HolidayClash = { date: string; name: string; jobs: string[]; changeOrders: number; janitorialShifts: number };

export async function findHolidayClashes(added: CompanyHoliday[]): Promise<HolidayClash[]> {
  if (added.length === 0) return [];
  const sorted = [...added].sort((a, b) => a.date.localeCompare(b.date));
  const dates = sorted.map((h) => new Date(`${h.date}T00:00:00Z`));
  const [days, coDays, shifts] = await Promise.all([
    prisma.projectDayAssignment.findMany({ where: { date: { in: dates } }, select: { date: true, project: { select: { jobTitle: true } } } }),
    prisma.changeOrderDayAssignment.findMany({ where: { date: { in: dates } }, select: { date: true } }),
    loadJanitorialShifts(dates[0]!, dates[dates.length - 1]!),
  ]);
  const key = (d: Date) => d.toISOString().slice(0, 10);
  return sorted
    .map((h) => ({
      date: h.date,
      name: h.name,
      jobs: days.filter((d) => key(d.date) === h.date).map((d) => d.project.jobTitle),
      changeOrders: coDays.filter((d) => key(d.date) === h.date).length,
      janitorialShifts: shifts.filter((s) => s.date === h.date && s.status !== "CANCELLED").length,
    }))
    .filter((c) => c.jobs.length + c.changeOrders + c.janitorialShifts > 0);
}
