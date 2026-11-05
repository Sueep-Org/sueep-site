import { NextResponse } from "next/server";
import { getErpAuth } from "@/lib/erpAuth";
import { canManageSettings, readDatedMode, saveSetting } from "@/lib/erp/settings";
import type { DatedMode } from "@/lib/erp/datedSettings";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ key: string }> };

async function handle(ctx: Ctx, input: unknown, mode: DatedMode | null = null) {
  const auth = await getErpAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageSettings(auth.role)) return NextResponse.json({ error: "Only Admin and Business Manager can change settings" }, { status: 403 });
  const { key } = await ctx.params;
  const result = await saveSetting(key, input, auth.email, mode);
  if ("error" in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json({ ok: true });
}

/** Saves one Settings page value. Body: { value, mode? }; mode is { from: "YYYY-MM-DD" } or "all" for dated settings. */
export async function PUT(req: Request, ctx: Ctx) {
  const body = (await req.json().catch(() => null)) as { value?: unknown; mode?: unknown } | null;
  if (!body || body.value === undefined || body.value === null) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  return handle(ctx, body.value, readDatedMode(body.mode));
}

/** Back to the default. */
export async function DELETE(_req: Request, ctx: Ctx) {
  return handle(ctx, null);
}
