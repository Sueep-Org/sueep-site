import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseDateKey } from "@/lib/erp/janitorialSchedule";
import { badRequest, requireManagementAuth } from "@/lib/erp/managementCalendarApi";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Marks one occurrence done or not done. Body: { date: "YYYY-MM-DD" (the occurrence's first day), done: boolean } */
export async function POST(req: Request, ctx: Ctx) {
  const auth = await requireManagementAuth();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;

  const body = await req.json().catch(() => null);
  const date = body?.date;
  if (!parseDateKey(date)) return badRequest("date is required (YYYY-MM-DD)");
  const done = body?.done === true;

  const event = await prisma.managementEvent.findUnique({ where: { id }, select: { doneDates: true } });
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const next = new Set(event.doneDates);
  if (done) next.add(date);
  else next.delete(date);
  await prisma.managementEvent.update({ where: { id }, data: { doneDates: Array.from(next).sort() } });
  return NextResponse.json({ ok: true });
}
