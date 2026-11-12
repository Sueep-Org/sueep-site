import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth } from "@/lib/erpAuth";
import { recordSettingChange } from "@/lib/erp/settings";
import { todayEasternKey } from "@/lib/erp/dates";
import { COMPANY_HOLIDAYS_SETTING_KEY, DEFAULT_COMPANY_HOLIDAYS, parseCompanyHolidays } from "@/lib/erp/holidays";
import { findHolidayClashes, pastHolidaysChanged } from "@/lib/erp/holidaysServer";

export const runtime = "nodejs";

async function start() {
  const auth = await getErpAuth();
  if (!auth) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (auth.role !== "ADMIN") return { error: NextResponse.json({ error: "Only Admins can change company holidays" }, { status: 403 }) };
  const old = (await prisma.appSetting.findUnique({ where: { key: COMPANY_HOLIDAYS_SETTING_KEY } }))?.value ?? null;
  const current = (old ? parseCompanyHolidays(old) : null) ?? DEFAULT_COMPANY_HOLIDAYS;
  return { auth, old, current };
}

/** Saves the whole list. Body: { holidays: [{ date: "YYYY-MM-DD", name }] } */
export async function PUT(req: Request) {
  const s = await start();
  if ("error" in s) return s.error;
  const body = (await req.json().catch(() => null)) as { holidays?: unknown } | null;
  const list = parseCompanyHolidays(body?.holidays ?? null);
  if (!list) return NextResponse.json({ error: "Send a list of holidays" }, { status: 400 });
  const raw = Array.isArray(body?.holidays) ? body.holidays.length : 0;
  if (list.length !== raw) return NextResponse.json({ error: "Each holiday needs a real date and a name, one per day." }, { status: 400 });
  const today = todayEasternKey();
  const pastError = pastHolidaysChanged(s.current, list, today);
  if (pastError) return NextResponse.json({ error: pastError }, { status: 400 });

  const value = JSON.stringify(list);
  await prisma.appSetting.upsert({ where: { key: COMPANY_HOLIDAYS_SETTING_KEY }, update: { value }, create: { key: COMPANY_HOLIDAYS_SETTING_KEY, value } });
  await recordSettingChange(COMPANY_HOLIDAYS_SETTING_KEY, s.old, value, s.auth.email);

  const before = new Set(s.current.map((h) => h.date));
  const added = list.filter((h) => !before.has(h.date) && h.date >= today);
  return NextResponse.json({ ok: true, holidays: list, clashes: await findHolidayClashes(added) });
}

/** Back to the built-in list (only allowed when it keeps the past the same). */
export async function DELETE() {
  const s = await start();
  if ("error" in s) return s.error;
  const pastError = pastHolidaysChanged(s.current, DEFAULT_COMPANY_HOLIDAYS, todayEasternKey());
  if (pastError) return NextResponse.json({ error: "Can't go back to the built-in list: it would change holidays before today." }, { status: 400 });
  await prisma.appSetting.deleteMany({ where: { key: COMPANY_HOLIDAYS_SETTING_KEY } });
  await recordSettingChange(COMPANY_HOLIDAYS_SETTING_KEY, s.old, null, s.auth.email);
  return NextResponse.json({ ok: true, holidays: DEFAULT_COMPANY_HOLIDAYS });
}
