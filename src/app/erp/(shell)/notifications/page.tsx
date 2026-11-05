import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { canManageNotifications, getErpAuth } from "@/lib/erpAuth";
import { NOTIFICATIONS, defaultBackupPms, type EmailType } from "@/lib/notificationTypes";
import { defaultSetting, loadAllSettings } from "@/lib/notificationSettings";
import { NotificationsHeader } from "./NotificationsHeader";
import { SettingsView, type SettingRow } from "./SettingsView";
import { SaveDefaultsBanner } from "./SaveDefaultsBanner";

export const metadata: Metadata = {
  title: "Email Settings",
};

export const dynamic = "force-dynamic";

const WEEK_MS = 7 * 86_400_000;

const sameList = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join(",") === [...b].sort().join(",");

export default async function NotificationsPage() {
  const auth = await getErpAuth();
  if (!auth || !canManageNotifications(auth.role)) redirect("/erp");

  const weekAgo = new Date(Date.now() - WEEK_MS);
  const [{ settings, backupPms, backupPmsCustomized }, lastSent, failed] = await Promise.all([
    loadAllSettings(),
    prisma.emailLog.groupBy({ by: ["type"], where: { status: "SENT" }, _max: { createdAt: true } }),
    prisma.emailLog.groupBy({ by: ["type"], where: { status: "FAILED", createdAt: { gte: weekAgo } }, _count: { _all: true } }),
  ]);
  const lastSentBy = new Map(lastSent.map((r) => [r.type, r._max.createdAt?.toISOString() ?? null]));
  const failedBy = new Map(failed.map((r) => [r.type, r._count._all]));

  const rows: SettingRow[] = (Object.keys(NOTIFICATIONS) as EmailType[]).map((type) => {
    const d = NOTIFICATIONS[type];
    const fallback = defaultSetting(type);
    const saved = settings[type];
    // "Changed" means different from the built-in list, not just saved.
    const differs = saved.enabled !== fallback.enabled || !sameList(saved.to, fallback.to) || !sameList(saved.cc, fallback.cc);
    return {
      type,
      label: d.label,
      group: d.group,
      when: d.when,
      automatic: d.automatic,
      toMode: d.toMode,
      ccEditable: d.ccEditable,
      alwaysOn: d.alwaysOn,
      setting: { ...saved, customized: saved.customized && differs },
      saved: saved.customized,
      defaults: { enabled: fallback.enabled, to: fallback.to, cc: fallback.cc },
      lastSentAt: lastSentBy.get(type) ?? null,
      failedThisWeek: failedBy.get(type) ?? 0,
    };
  });

  const unsaved = rows.filter((r) => !r.saved).length + (backupPmsCustomized ? 0 : 1);
  const backupDiffers = backupPmsCustomized && !sameList(backupPms, defaultBackupPms());

  return (
    <div className="space-y-6">
      <NotificationsHeader active="settings" failedCount={failed.reduce((n, r) => n + r._count._all, 0)} />
      {unsaved > 0 && <SaveDefaultsBanner count={unsaved} canSave={process.env.VERCEL_ENV === "production"} />}
      <SettingsView rows={rows} backupPms={backupPms} backupPmsCustomized={backupDiffers} defaultBackupPms={defaultBackupPms()} />
    </div>
  );
}
