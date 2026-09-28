import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageJanitorial } from "@/lib/erpAuth";
import { parsePatternInput } from "@/lib/erp/janitorialPatternInput";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canManageJanitorial(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parsePatternInput(body, true);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const pattern = await prisma.janitorialShiftPattern.update({ where: { id }, data: parsed.data });
    return NextResponse.json(pattern);
  } catch (e) {
    console.error("PATCH /api/erp/janitorial/patterns/[id]", e);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

/** Deletes the pattern and its one-day changes. To stop a shift going
 * forward while keeping its history, set effectiveUntil via PATCH instead. */
export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canManageJanitorial(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;

  try {
    await prisma.janitorialShiftPattern.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
