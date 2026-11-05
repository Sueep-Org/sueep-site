/** Server read of the Settings page payroll and commission rules. Cached; saving a setting clears it (settings.ts). */

import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { SETTINGS_CACHE_TAG } from "@/lib/pricingSettingsServer";
import { PAYROLL_KEYS, datedNumberHistory, parseSetting, settingDef, type NumberSettingDef } from "./settingsRegistry";
import { parseDated, type Dated } from "./datedSettings";
import { DEFAULT_COMMISSION_TIERS, readTiers, type PayrollRules } from "./payrollRules";

const keys = Object.values(PAYROLL_KEYS);

async function read(): Promise<PayrollRules> {
  const rows = await prisma.appSetting.findMany({ where: { key: { in: keys } } });
  const raw = new Map(rows.map((r) => [r.key, r.value]));
  const def = (key: string) => settingDef(key) as NumberSettingDef;
  const dated = (key: string, scale = 1): Dated<number> => datedNumberHistory(def(key), raw.get(key)).map((e) => ({ ...e, value: e.value * scale }));
  const plain = (key: string) => parseSetting(def(key), raw.get(key)) ?? def(key).default;
  return {
    otAfterHours: dated(PAYROLL_KEYS.otAfterHours),
    otPremium: dated(PAYROLL_KEYS.otPremiumPct, 1 / 100),
    yearHours: dated(PAYROLL_KEYS.yearHours),
    breakAfterHours: dated(PAYROLL_KEYS.breakAfterHours),
    breakMinutes: dated(PAYROLL_KEYS.breakMinutes),
    commissionTiers: parseDated(raw.get(PAYROLL_KEYS.commissionTiers), readTiers, DEFAULT_COMMISSION_TIERS),
    acceleratorCents: dated(PAYROLL_KEYS.acceleratorDollars, 100),
    recurringYear1Rate: dated(PAYROLL_KEYS.recurringYear1Pct, 1 / 100),
    recurringYear2Rate: dated(PAYROLL_KEYS.recurringYear2Pct, 1 / 100),
    lateEarlyMinutes: plain(PAYROLL_KEYS.lateEarlyMinutes),
    farFromBuildingMeters: plain(PAYROLL_KEYS.farFromBuildingMeters),
    inactiveAfterMonths: plain(PAYROLL_KEYS.inactiveAfterMonths),
    safetyViolationLimit: plain(PAYROLL_KEYS.safetyViolationLimit),
  };
}

export const loadPayrollRules = unstable_cache(read, ["payroll-rules"], { tags: [SETTINGS_CACHE_TAG], revalidate: 300 });
