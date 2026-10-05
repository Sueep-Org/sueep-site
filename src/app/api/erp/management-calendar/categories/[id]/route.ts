import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseRemindDays } from "@/lib/erp/managementCalendar";
import { badRequest, parseColor, requireManagementAuth } from "@/lib/erp/managementCalendarApi";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Renames, recolors, or changes reminders. Automatic categories can be changed too. */
export async function PATCH(req: Request, ctx: Ctx) {
  const auth = await requireManagementAuth();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return badRequest("Invalid body");
  const data: { name?: string; color?: string; remindDays?: number[] } = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return badRequest("Name is required");
    if (name.length > 60) return badRequest("Name is too long");
    data.name = name;
  }
  if (body.color !== undefined) {
    const color = parseColor(body.color);
    if (!color) return badRequest("Invalid color");
    data.color = color;
  }
  if (body.remindDays !== undefined) {
    const remindDays = parseRemindDays(body.remindDays);
    if (!remindDays) return badRequest("Reminders must be whole days, like 30, 7");
    data.remindDays = remindDays;
  }

  const updated = await prisma.managementCategory.updateMany({ where: { id }, data });
  if (!updated.count) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

/** Deletes a staff-added category that has no events left. */
export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await requireManagementAuth();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;

  const category = await prisma.managementCategory.findUnique({ where: { id }, select: { builtinKey: true, _count: { select: { events: true } } } });
  if (!category) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (category.builtinKey) return badRequest("Automatic categories can't be deleted. Hide them with the filter instead.");
  if (category._count.events) {
    return badRequest(`Move or delete its ${category._count.events} event${category._count.events === 1 ? "" : "s"} first`);
  }
  await prisma.managementCategory.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
