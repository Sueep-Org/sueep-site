/** Reads and saves the Notifications page settings. Server only. */

import { prisma } from "@/lib/prisma";
import { BACKUP_PMS_KEY, DEFAULT_NOTIFY_KEY, NOTIFICATIONS, defaultBackupPms, type EmailType } from "./notificationTypes";

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

/**
 * The people this list started as before it could be edited: found by name, as
 * the forms used to do (Sergio, David Rodriguez, Jennifer Cortes-Loya). Only
 * used until someone saves the list on Email Settings.
 */
async function legacyDefaultNotifyEmails(): Promise<string[]> {
  const rows = await prisma.employee.findMany({
    where: {
      email: { not: null },
      status: "ACTIVE",
      OR: [
        { firstName: { equals: "Sergio", mode: "insensitive" } },
        { firstName: { equals: "David", mode: "insensitive" }, lastName: { equals: "Rodriguez", mode: "insensitive" } },
        { firstName: { equals: "Jennifer", mode: "insensitive" }, lastName: { equals: "Cortes-Loya", mode: "insensitive" } },
      ],
    },
    select: { email: true },
  });
  return [...new Set(rows.map((r) => r.email!.trim().toLowerCase()).filter(Boolean))];
}

/** Who is ticked by default under "Notify employees" on new projects and change orders (lowercased emails). */
export async function getDefaultNotifyEmails(): Promise<{ emails: string[]; customized: boolean }> {
  try {
    const row = await prisma.notificationSetting.findUnique({ where: { type: DEFAULT_NOTIFY_KEY } });
    if (row) return { emails: row.to.map((e) => e.trim().toLowerCase()), customized: true };
    return { emails: await legacyDefaultNotifyEmails(), customized: false };
  } catch {
    return { emails: [], customized: false };
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
