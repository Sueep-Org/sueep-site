import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

/** Deletes a legacy ProjectSovScheduleRequest chip from the calendar (the
 * portal's "Schedule SOV Work" flow now creates a real ProjectDayAssignment
 * instead, deletable via the normal day-assignments route, so this only
 * matters for rows that already existed before that change). */
export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    await prisma.projectSovScheduleRequest.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
