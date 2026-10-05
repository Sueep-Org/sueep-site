import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { canManageNotifications, getErpAuth } from "@/lib/erpAuth";
import { NOTIFICATIONS, defaultBackupPms, type EmailType } from "@/lib/notificationTypes";
import { defaultSetting, loadAllSettings } from "@/lib/notificationSettings";
import { NotificationsHeader } from "./NotificationsHeader";
import { SettingsView, type SettingRow } from "./SettingsView";

export const metadata: Metadata = {
  title: "Notifications",
};

export const dynamic = "force-dynamic";

const WEEK_MS = 7 * 86_400_000;

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
    return {
      type,
      label: d.label,
      group: d.group,
      when: d.when,
      automatic: d.automatic,
      toMode: d.toMode,
      ccEditable: d.ccEditable,
      setting: settings[type],
      defaults: { enabled: fallback.enabled, to: fallback.to, cc: fallback.cc },
      lastSentAt: lastSentBy.get(type) ?? null,
      failedThisWeek: failedBy.get(type) ?? 0,
    };
  });

  return (
    <div className="space-y-6">
      <NotificationsHeader active="settings" failedCount={failed.reduce((n, r) => n + r._count._all, 0)} />
      <SettingsView rows={rows} backupPms={backupPms} backupPmsCustomized={backupPmsCustomized} defaultBackupPms={defaultBackupPms()} />
    </div>
  );
}
