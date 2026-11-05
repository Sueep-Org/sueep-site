/**
 * Reads and saves Settings page values (AppSetting), keeping a history of
 * every change in AppSettingChange. Server only. What each key means, its
 * default and its limits are in settingsRegistry.ts.
 */

import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { SETTINGS_CACHE_TAG } from "@/lib/pricingSettingsServer";
import type { ErpRole } from "@/lib/erpSession";
import { checkSetting, datedNumberHistory, parseSetting, settingDef, type SettingDef } from "./settingsRegistry";
import { applyDatedChange, isDateKey, valueOn, type Dated, type DatedMode } from "./datedSettings";
import { todayEasternKey } from "./dates";

/** Who can open the Settings page and change what's on it. */
export function canManageSettings(role: ErpRole): boolean {
  return role === "ADMIN" || role === "BUSINESS_MANAGER";
}

export type LoadedSetting = {
  def: SettingDef;
  /** What the ERP uses now: the saved value, or the default */
  value: number | string;
  saved: boolean;
  changedBy: string | null;
  changedAt: string | null;
  /** Dated settings only: every value with the day it started, oldest first */
  history: Dated<number> | null;
};

/** Every registered setting with its current value and last change. */
export async function loadSettings(defs: SettingDef[]): Promise<LoadedSetting[]> {
  const keys = defs.map((d) => d.key);
  const [rows, changes] = await Promise.all([
    prisma.appSetting.findMany({ where: { key: { in: keys } } }),
    prisma.appSettingChange.findMany({ where: { key: { in: keys } }, orderBy: { createdAt: "desc" }, distinct: ["key"] }),
  ]);
  const raw = new Map(rows.map((r) => [r.key, r.value]));
  const last = new Map(changes.map((c) => [c.key, c]));
  const today = todayEasternKey();
  return defs.map((def) => {
    const change = last.get(def.key);
    const meta = { changedBy: change?.byEmail ?? null, changedAt: change?.createdAt.toISOString() ?? null };
    if (def.kind === "number" && def.dated) {
      const history = datedNumberHistory(def, raw.get(def.key));
      return { def, value: valueOn(history, today), saved: raw.has(def.key), history, ...meta };
    }
    const parsed = parseSetting(def, raw.get(def.key));
    return { def, value: parsed ?? def.default, saved: parsed != null, history: null, ...meta };
  });
}

/** Logs a change made by any editor that writes AppSetting, so it shows on the History tab. */
export async function recordSettingChange(key: string, oldValue: string | null, newValue: string | null, byEmail: string): Promise<void> {
  if (oldValue === newValue) return;
  await prisma.appSettingChange.create({ data: { key, oldValue, newValue, byEmail } });
  revalidateTag(SETTINGS_CACHE_TAG);
}

/** Reads a "how does this apply" choice from a request body. */
export function readDatedMode(input: unknown): DatedMode | null {
  if (input === "all") return "all";
  if (input && typeof input === "object" && isDateKey((input as { from?: unknown }).from)) return { from: (input as { from: string }).from };
  return null;
}

/** Saves one setting (or null to go back to the default) and logs it. Dated
 * settings need a mode: from a day on, or "all" to recalculate everything. */
export async function saveSetting(key: string, input: unknown, byEmail: string, mode?: DatedMode | null): Promise<{ ok: true } | { error: string }> {
  const def = settingDef(key);
  if (!def) return { error: "Unknown setting" };
  const old = (await prisma.appSetting.findUnique({ where: { key } }))?.value ?? null;

  if (def.kind === "number" && def.dated && input !== null) {
    if (!mode) return { error: "Pick when the change starts" };
    const checked = checkSetting(def, input);
    if ("error" in checked) return checked;
    const value = JSON.stringify(applyDatedChange(datedNumberHistory(def, old), Number(checked.value), mode));
    await prisma.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
    await recordSettingChange(key, old, value, byEmail);
    return { ok: true };
  }

  if (input === null) {
    await prisma.appSetting.deleteMany({ where: { key } });
    await recordSettingChange(key, old, null, byEmail);
    return { ok: true };
  }

  const checked = checkSetting(def, input);
  if ("error" in checked) return checked;
  await prisma.appSetting.upsert({ where: { key }, update: { value: checked.value }, create: { key, value: checked.value } });
  await recordSettingChange(key, old, checked.value, byEmail);
  return { ok: true };
}
