import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { utcDateKey } from "@/lib/erp/dates";
import { badRequest, parseEventBody, requireManagementAuth } from "@/lib/erp/managementCalendarApi";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Saves the whole event from the edit form. */
export async function PATCH(req: Request, ctx: Ctx) {
  const auth = await requireManagementAuth();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;

  const existing = await prisma.managementEvent.findUnique({ where: { id }, select: { startDate: true, repeat: true, doneDates: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return badRequest("Invalid body");
  const fields = parseEventBody(body);
  if (typeof fields === "string") return badRequest(fields);
  if (!(await prisma.managementCategory.findUnique({ where: { id: fields.categoryId }, select: { id: true } }))) {
    return badRequest("That category no longer exists");
  }

  // Moving the dates or the repeat changes which occurrences exist, so old
  // done marks would point at the wrong days. A one-time event keeps "done"
  // when it moves, since there's only ever one occurrence.
  let doneDates = existing.doneDates;
  const moved = utcDateKey(existing.startDate) !== utcDateKey(fields.startDate) || existing.repeat !== fields.repeat;
  if (moved) doneDates = fields.repeat === "NONE" && existing.repeat === "NONE" && doneDates.length ? [utcDateKey(fields.startDate)] : [];

  await prisma.managementEvent.update({ where: { id }, data: { ...fields, doneDates } });
  return NextResponse.json({ ok: true });
}

/** Deletes the event, every repeat included. */
export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await requireManagementAuth();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const deleted = await prisma.managementEvent.deleteMany({ where: { id } });
  if (!deleted.count) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
