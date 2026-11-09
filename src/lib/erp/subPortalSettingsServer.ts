/** Server read of the Settings page Subs tab. Cached; saving a setting clears it (settings.ts). */

import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { SETTINGS_CACHE_TAG } from "@/lib/pricingSettingsServer";
import { SUB_PORTAL_KEYS, parseSetting, settingDef, type NumberSettingDef } from "./settingsRegistry";

export type SubPortalSettings = Record<keyof typeof SUB_PORTAL_KEYS, number>;

async function read(): Promise<SubPortalSettings> {
  const rows = await prisma.appSetting.findMany({ where: { key: { in: Object.values(SUB_PORTAL_KEYS) } } });
  const raw = new Map(rows.map((r) => [r.key, r.value]));
  return Object.fromEntries(
    Object.entries(SUB_PORTAL_KEYS).map(([name, key]) => {
      const def = settingDef(key) as NumberSettingDef;
      return [name, parseSetting(def, raw.get(key)) ?? def.default];
    }),
  ) as SubPortalSettings;
}

export const loadSubPortalSettings = unstable_cache(read, ["sub-portal-settings"], { tags: [SETTINGS_CACHE_TAG], revalidate: 300 });
