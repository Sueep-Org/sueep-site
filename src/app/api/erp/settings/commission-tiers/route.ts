import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth } from "@/lib/erpAuth";
import { canManageSettings, readDatedMode, recordSettingChange } from "@/lib/erp/settings";
import { PAYROLL_KEYS } from "@/lib/erp/settingsRegistry";
import { applyDatedChange, parseDated } from "@/lib/erp/datedSettings";
import { DEFAULT_COMMISSION_TIERS, readTiers } from "@/lib/erp/payrollRules";

export const runtime = "nodejs";

const KEY = PAYROLL_KEYS.commissionTiers;

async function authorize() {
  const auth = await getErpAuth();
  if (!auth) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!canManageSettings(auth.role)) return { error: NextResponse.json({ error: "Only Admin and Business Manager can change settings" }, { status: 403 }) };
  return { auth };
}

/** Saves the one-time deal commission tiers. Body: { value: tiers (rates as fractions), mode: { from } | "all" } */
export async function PUT(req: Request) {
  const { auth, error } = await authorize();
  if (error) return error;
  const body = (await req.json().catch(() => null)) as { value?: unknown; mode?: unknown } | null;
  const tiers = readTiers(body?.value);
  if (!tiers) return NextResponse.json({ error: "Check the tiers: margins -100 to 100%, rates 0 to 100%" }, { status: 400 });
  const mode = readDatedMode(body?.mode);
  if (!mode) return NextResponse.json({ error: "Pick when the change starts" }, { status: 400 });

  const old = (await prisma.appSetting.findUnique({ where: { key: KEY } }))?.value ?? null;
  const value = JSON.stringify(applyDatedChange(parseDated(old, readTiers, DEFAULT_COMMISSION_TIERS), tiers, mode));
  await prisma.appSetting.upsert({ where: { key: KEY }, update: { value }, create: { key: KEY, value } });
  await recordSettingChange(KEY, old, value, auth.email);
  return NextResponse.json({ ok: true });
}

/** Back to the built-in tiers for every date. */
export async function DELETE() {
  const { auth, error } = await authorize();
  if (error) return error;
  const old = (await prisma.appSetting.findUnique({ where: { key: KEY } }))?.value ?? null;
  await prisma.appSetting.deleteMany({ where: { key: KEY } });
  await recordSettingChange(KEY, old, null, auth.email);
  return NextResponse.json({ ok: true });
}
