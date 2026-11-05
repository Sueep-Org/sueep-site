import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth } from "@/lib/erpAuth";
import { canManageSettings, recordSettingChange } from "@/lib/erp/settings";
import { PRICING_KEYS } from "@/lib/erp/settingsRegistry";
import { sanitizeTurnoverPricingPackage } from "@/lib/turnoverPricingPackages";
import { sanitizeCoPricingPackage } from "@/lib/coPricingPackage";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ kind: string }> };

/** The two standard price lists on Settings, Pricing. */
const KINDS = {
  turnover: { key: PRICING_KEYS.turnoverPackage, clean: sanitizeTurnoverPricingPackage },
  co: { key: PRICING_KEYS.coPackage, clean: sanitizeCoPricingPackage },
} as const;

async function handle(ctx: Ctx, input: unknown) {
  const auth = await getErpAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageSettings(auth.role)) return NextResponse.json({ error: "Only Admin and Business Manager can change settings" }, { status: 403 });
  const { kind } = await ctx.params;
  const def = KINDS[kind as keyof typeof KINDS];
  if (!def) return NextResponse.json({ error: "Unknown list" }, { status: 404 });

  const old = (await prisma.appSetting.findUnique({ where: { key: def.key } }))?.value ?? null;
  if (input === null) {
    await prisma.appSetting.deleteMany({ where: { key: def.key } });
    await recordSettingChange(def.key, old, null, auth.email);
    return NextResponse.json({ ok: true });
  }
  const value = JSON.stringify(def.clean(input));
  await prisma.appSetting.upsert({ where: { key: def.key }, update: { value }, create: { key: def.key, value } });
  await recordSettingChange(def.key, old, value, auth.email);
  return NextResponse.json({ ok: true });
}

/** Saves a standard list. Body: { value } */
export async function PUT(req: Request, ctx: Ctx) {
  const body = (await req.json().catch(() => null)) as { value?: unknown } | null;
  if (!body?.value || typeof body.value !== "object") return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  return handle(ctx, body.value);
}

/** Back to the built-in list. */
export async function DELETE(_req: Request, ctx: Ctx) {
  return handle(ctx, null);
}
