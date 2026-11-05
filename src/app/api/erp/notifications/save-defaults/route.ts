import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canManageNotifications, getErpAuth } from "@/lib/erpAuth";
import { BACKUP_PMS_KEY, NOTIFICATIONS, defaultBackupPms, type EmailType } from "@/lib/notificationTypes";
import { defaultSetting } from "@/lib/notificationSettings";

export const runtime = "nodejs";

/** Saves the built-in recipients for every email nobody has saved yet, so the
 * Email Settings page is the only place that decides who gets what. Rows
 * already saved are left alone, and nobody's emails change. */
export async function POST() {
  const auth = await getErpAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageNotifications(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  // Some built-in lists read this server's env, so only the live site saves them.
  if (process.env.VERCEL_ENV !== "production") return NextResponse.json({ error: "Save these on the live site" }, { status: 409 });

  const rows = [
    ...(Object.keys(NOTIFICATIONS) as EmailType[]).map((type) => {
      const d = defaultSetting(type);
      return { type, enabled: d.enabled, to: d.to, cc: d.cc, updatedBy: auth.email };
    }),
    { type: BACKUP_PMS_KEY, enabled: true, to: defaultBackupPms(), cc: [], updatedBy: auth.email },
  ];
  const { count } = await prisma.notificationSetting.createMany({ data: rows, skipDuplicates: true });
  return NextResponse.json({ ok: true, saved: count });
}
