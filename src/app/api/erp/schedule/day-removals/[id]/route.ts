import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

// Clears a grayed-out removed day off the calendar for good.
export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  await prisma.scheduleDayRemoval.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
}
