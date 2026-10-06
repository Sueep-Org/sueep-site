import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canManageNotifications, getErpAuth } from "@/lib/erpAuth";
import { BACKUP_PMS_KEY, NOTIFICATIONS, isEmailType, parseEmailList } from "@/lib/notificationTypes";
import { getBackupPms, getNotificationSetting } from "@/lib/notificationSettings";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ type: string }> };

async function authorize() {
  const auth = await getErpAuth();
  if (!auth) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!canManageNotifications(auth.role)) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { auth };
}

/** Saves one email type's setting (or the backup PMs). Body: { enabled?, to?, cc? }; fields left out keep their current value. */
export async function PUT(req: Request, ctx: Ctx) {
  const { auth, error } = await authorize();
  if (error) return error;
  const { type } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { enabled?: unknown; to?: unknown; cc?: unknown } | null;
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  if (type === BACKUP_PMS_KEY) {
    const to = parseEmailList(body.to ?? (await getBackupPms()));
    if (!to) return NextResponse.json({ error: "Check the email addresses" }, { status: 400 });
    if (!to.length) return NextResponse.json({ error: "Keep at least one backup PM" }, { status: 400 });
    await prisma.notificationSetting.upsert({
      where: { type },
      update: { to, updatedBy: auth.email },
      create: { type, to, updatedBy: auth.email },
    });
    return NextResponse.json({ ok: true });
  }

  if (!isEmailType(type)) return NextResponse.json({ error: "Unknown email type" }, { status: 404 });
  const def = NOTIFICATIONS[type];
  const current = await getNotificationSetting(type);
  if (def.alwaysOn && body.enabled === false) {
    return NextResponse.json({ error: "This email can't be turned off" }, { status: 400 });
  }
  const enabled = body.enabled === undefined ? current.enabled : body.enabled === true;
  const to = body.to === undefined || !def.toMode ? current.to : parseEmailList(body.to);
  const cc = body.cc === undefined || !def.ccEditable ? current.cc : parseEmailList(body.cc);
  if (!to || !cc) return NextResponse.json({ error: "Check the email addresses" }, { status: 400 });
  if (def.toMode === "recipients" && enabled && !to.length && type !== "COI_REQUEST_RECEIVED") {
    return NextResponse.json({ error: "Add at least one recipient, or turn this email off" }, { status: 400 });
  }

  await prisma.notificationSetting.upsert({
    where: { type },
    update: { enabled, to, cc, updatedBy: auth.email },
    create: { type, enabled, to, cc, updatedBy: auth.email },
  });
  return NextResponse.json({ ok: true });
}

/** Back to the defaults. */
export async function DELETE(_req: Request, ctx: Ctx) {
  const { error } = await authorize();
  if (error) return error;
  const { type } = await ctx.params;
  if (type !== BACKUP_PMS_KEY && !isEmailType(type)) return NextResponse.json({ error: "Unknown email type" }, { status: 404 });
  await prisma.notificationSetting.deleteMany({ where: { type } });
  return NextResponse.json({ ok: true });
}
