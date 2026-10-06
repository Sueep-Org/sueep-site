/** Reads and saves the Notifications page settings. Server only. */

import { prisma } from "@/lib/prisma";
import { BACKUP_PMS_KEY, NOTIFICATIONS, defaultBackupPms, type EmailType } from "./notificationTypes";

export type ResolvedSetting = { enabled: boolean; to: string[]; cc: string[]; customized: boolean };

export function defaultSetting(type: EmailType): ResolvedSetting {
  const d = NOTIFICATIONS[type];
  return { enabled: d.defaultEnabled, to: d.defaultTo(), cc: d.defaultCc, customized: false };
}

/** The saved setting, or the defaults when nobody has changed it (or the lookup fails). */
export async function getNotificationSetting(type: EmailType): Promise<ResolvedSetting> {
  try {
    const row = await prisma.notificationSetting.findUnique({ where: { type } });
    if (!row) return defaultSetting(type);
    return { enabled: row.enabled || NOTIFICATIONS[type].alwaysOn, to: row.to, cc: NOTIFICATIONS[type].ccEditable ? row.cc : [], customized: true };
  } catch (e) {
    console.error(`Could not read notification setting ${type}, using defaults`, e);
    return defaultSetting(type);
  }
}

/** Who to email when a PM can't be found for a project. */
export async function getBackupPms(): Promise<string[]> {
  try {
    const row = await prisma.notificationSetting.findUnique({ where: { type: BACKUP_PMS_KEY } });
    return row ? row.to : defaultBackupPms();
  } catch {
    return defaultBackupPms();
  }
}

/** Every type's setting plus the backup PMs, for the Notifications page. */
export async function loadAllSettings(): Promise<{ settings: Record<EmailType, ResolvedSetting>; backupPms: string[]; backupPmsCustomized: boolean }> {
  const rows = await prisma.notificationSetting.findMany();
  const byType = new Map(rows.map((r) => [r.type, r]));
  const settings = {} as Record<EmailType, ResolvedSetting>;
  for (const type of Object.keys(NOTIFICATIONS) as EmailType[]) {
    const row = byType.get(type);
    settings[type] = row
      ? { enabled: row.enabled || NOTIFICATIONS[type].alwaysOn, to: row.to, cc: NOTIFICATIONS[type].ccEditable ? row.cc : [], customized: true }
      : defaultSetting(type);
  }
  const backup = byType.get(BACKUP_PMS_KEY);
  return { settings, backupPms: backup ? backup.to : defaultBackupPms(), backupPmsCustomized: !!backup };
}
