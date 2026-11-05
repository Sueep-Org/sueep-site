import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth } from "@/lib/erpAuth";
import { canManageSettings, recordSettingChange } from "@/lib/erp/settings";
import { APP_LIST_IDS, readList, type AppListId } from "@/lib/erp/appLists";
import { listKey } from "@/lib/erp/appListsServer";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

async function start(ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!canManageSettings(auth.role)) return { error: NextResponse.json({ error: "Only Admin and Business Manager can change settings" }, { status: 403 }) };
  const { id } = await ctx.params;
  if (!(APP_LIST_IDS as readonly string[]).includes(id)) return { error: NextResponse.json({ error: "Unknown list" }, { status: 404 }) };
  const key = listKey(id as AppListId);
  const old = (await prisma.appSetting.findUnique({ where: { key } }))?.value ?? null;
  return { auth, id: id as AppListId, key, old };
}

/** Saves one Settings list. Body: { items: [{ value?, label, hidden? }] } */
export async function PUT(req: Request, ctx: Ctx) {
  const s = await start(ctx);
  if ("error" in s) return s.error;
  const body = (await req.json().catch(() => null)) as { items?: unknown } | null;
  const items = readList(s.id, body?.items);
  if (!items) return NextResponse.json({ error: "Add at least one item" }, { status: 400 });
  const value = JSON.stringify(items);
  await prisma.appSetting.upsert({ where: { key: s.key }, update: { value }, create: { key: s.key, value } });
  await recordSettingChange(s.key, s.old, value, s.auth.email);
  return NextResponse.json({ ok: true });
}

/** Back to the built-in list. */
export async function DELETE(_req: Request, ctx: Ctx) {
  const s = await start(ctx);
  if ("error" in s) return s.error;
  await prisma.appSetting.deleteMany({ where: { key: s.key } });
  await recordSettingChange(s.key, s.old, null, s.auth.email);
  return NextResponse.json({ ok: true });
}
