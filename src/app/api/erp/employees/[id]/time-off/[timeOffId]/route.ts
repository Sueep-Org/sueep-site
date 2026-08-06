import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string; timeOffId: string }> };

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id, timeOffId } = await ctx.params;
  try {
    const deleted = await prisma.employeeTimeOff.deleteMany({ where: { id: timeOffId, employeeId: id } });
    if (deleted.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
