import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canSeeFinancials, getErpAuth } from "@/lib/erpAuth";
import { applyNextDaySurcharge, voidNextDaySurcharges } from "@/lib/erp/nextDaySurcharge";

type Ctx = { params: Promise<{ id: string }> };

/**
 * The office marks a day "Next day" (a rush job phoned in) or takes it off.
 * On: same as a project manager's next day request, the surcharge is added
 * for the SOV lines and change orders on the day. Off: the surcharge change
 * orders are voided; change orders that already got the 20% keep their price.
 * Body: { on: boolean }
 */
export async function PATCH(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canSeeFinancials(auth.role)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { on?: unknown } | null;
  if (typeof body?.on !== "boolean") return NextResponse.json({ error: "Send on: true or false" }, { status: 400 });
  const day = await prisma.projectDayAssignment.findUnique({ where: { id }, select: { id: true } });
  if (!day) return NextResponse.json({ error: "That day isn't on the schedule anymore." }, { status: 404 });

  await prisma.projectDayAssignment.update({ where: { id }, data: { nextDayUpcharge: body.on } });
  if (body.on) {
    const result = await applyNextDaySurcharge(id);
    return NextResponse.json({ ok: true, nextDayUpcharge: true, ...result });
  }
  const voided = await voidNextDaySurcharges(id, "The day was taken off Next day.");
  return NextResponse.json({ ok: true, nextDayUpcharge: false, created: [], voided, upcharged: [] });
}
