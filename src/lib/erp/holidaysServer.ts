import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { SETTINGS_CACHE_TAG } from "@/lib/pricingSettingsServer";
import { COMPANY_HOLIDAYS_SETTING_KEY, DEFAULT_COMPANY_HOLIDAYS, parseCompanyHolidays, type CompanyHoliday } from "./holidays";

/** The saved company holidays, or the built-in list until one is saved. */
async function read(): Promise<CompanyHoliday[]> {
  const row = await prisma.appSetting.findUnique({ where: { key: COMPANY_HOLIDAYS_SETTING_KEY } });
  return (row ? parseCompanyHolidays(row.value) : null) ?? DEFAULT_COMPANY_HOLIDAYS;
}

/** Cached like the other settings; saving one clears SETTINGS_CACHE_TAG. */
export const loadCompanyHolidays = unstable_cache(read, ["company-holidays"], { tags: [SETTINGS_CACHE_TAG], revalidate: 300 });
