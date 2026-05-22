import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ laborerId: string }> };

export async function DELETE(_req: Request, ctx: Ctx) {
  const { laborerId } = await ctx.params;
  try {
    await prisma.projectChangeOrderLaborer.delete({ where: { id: laborerId } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE change-order-laborers/[laborerId]", e);
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
