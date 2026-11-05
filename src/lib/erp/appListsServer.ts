/** Server read of the Settings page lists. Cached; saving a setting clears it (settings.ts). */

import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { SETTINGS_CACHE_TAG } from "@/lib/pricingSettingsServer";
import { APP_LIST_IDS, DEFAULT_APP_LISTS, readList, type AppListId, type AppLists } from "./appLists";

export const listKey = (id: AppListId) => `list.${id}`;

async function read(): Promise<AppLists> {
  const rows = await prisma.appSetting.findMany({ where: { key: { in: APP_LIST_IDS.map(listKey) } } });
  const raw = new Map(rows.map((r) => [r.key, r.value]));
  const lists = { ...DEFAULT_APP_LISTS };
  for (const id of APP_LIST_IDS) {
    try {
      const saved = raw.has(listKey(id)) ? readList(id, JSON.parse(raw.get(listKey(id))!)) : null;
      if (saved) lists[id] = saved;
    } catch {
      // bad JSON: keep the default
    }
  }
  return lists;
}

export const loadAppLists = unstable_cache(read, ["app-lists"], { tags: [SETTINGS_CACHE_TAG], revalidate: 300 });
