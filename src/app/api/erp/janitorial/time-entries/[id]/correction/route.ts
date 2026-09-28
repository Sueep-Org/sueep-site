import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageJanitorial } from "@/lib/erpAuth";

type Ctx = { params: Promise<{ id: string }> };

/** Undoes an admin correction. The entry goes back to the janitor's own clock
 * times, or is removed if it only existed for the correction (the shift then
 * falls back to its schedule again). */
export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canManageJanitorial(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;

  const entry = await prisma.janitorialTimeEntry.findUnique({ where: { id } });
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!entry.clockInAt) {
    await prisma.janitorialTimeEntry.delete({ where: { id } });
  } else {
    await prisma.janitorialTimeEntry.update({
      where: { id },
      data: { manualNoShow: false, manualStartTime: null, manualEndTime: null, manualBy: null, manualAt: null },
    });
  }
  return NextResponse.json({ ok: true });
}
