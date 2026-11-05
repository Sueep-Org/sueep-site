/** Server read of the Settings page prices. Cached; saving a setting clears it (settings.ts). */

import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { PRICING_KEYS, parseSetting, settingDef, type NumberSettingDef } from "@/lib/erp/settingsRegistry";
import { DEFAULT_PRICING_SETTINGS, type PricingSettings } from "@/lib/pricingSettings";
import { sanitizeTurnoverPricingPackage } from "@/lib/turnoverPricingPackages";
import { sanitizeCoPricingPackage } from "@/lib/coPricingPackage";

export const SETTINGS_CACHE_TAG = "app-settings";

const keys = Object.values(PRICING_KEYS);

async function read(): Promise<PricingSettings> {
  const rows = await prisma.appSetting.findMany({ where: { key: { in: keys } } });
  const raw = new Map(rows.map((r) => [r.key, r.value]));
  const num = (key: string) => {
    const def = settingDef(key) as NumberSettingDef;
    return parseSetting(def, raw.get(key)) ?? def.default;
  };
  const cents = (key: string) => Math.round(num(key) * 100);
  const json = (key: string): unknown => {
    try {
      return JSON.parse(raw.get(key) ?? "null");
    } catch {
      return null;
    }
  };
  const turnover = json(PRICING_KEYS.turnoverPackage);
  const co = json(PRICING_KEYS.coPackage);
  return {
    nextDayPct: num(PRICING_KEYS.nextDayPct),
    coPriceRates: { cleanerHourlyRateCents: cents(PRICING_KEYS.coPriceCleaner), foremanHourlyRateCents: cents(PRICING_KEYS.coPriceSupervisor) },
    coCostRates: { cleanerHourlyRateCents: cents(PRICING_KEYS.coCostCleaner), foremanHourlyRateCents: cents(PRICING_KEYS.coCostSupervisor) },
    coDayHours: num(PRICING_KEYS.coDayHours),
    janitorialSalesTaxPct: num(PRICING_KEYS.janitorialSalesTaxPct),
    turnoverPackage: turnover ? sanitizeTurnoverPricingPackage(turnover) : DEFAULT_PRICING_SETTINGS.turnoverPackage,
    coPackage: co ? sanitizeCoPricingPackage(co) : DEFAULT_PRICING_SETTINGS.coPackage,
  };
}

export const loadPricingSettings = unstable_cache(read, ["pricing-settings"], { tags: [SETTINGS_CACHE_TAG], revalidate: 300 });
