/** Server read of the Settings page Alerts tab. Cached; saving a setting clears it (settings.ts). */

import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { SETTINGS_CACHE_TAG } from "@/lib/pricingSettingsServer";
import { ALERT_KEYS, parseSetting, settingDef, type NumberSettingDef } from "./settingsRegistry";

export type AlertSettings = Record<keyof typeof ALERT_KEYS, number>;

async function read(): Promise<AlertSettings> {
  const rows = await prisma.appSetting.findMany({ where: { key: { in: Object.values(ALERT_KEYS) } } });
  const raw = new Map(rows.map((r) => [r.key, r.value]));
  return Object.fromEntries(
    Object.entries(ALERT_KEYS).map(([name, key]) => {
      const def = settingDef(key) as NumberSettingDef;
      return [name, parseSetting(def, raw.get(key)) ?? def.default];
    }),
  ) as AlertSettings;
}

export const loadAlertSettings = unstable_cache(read, ["alert-settings"], { tags: [SETTINGS_CACHE_TAG], revalidate: 300 });
