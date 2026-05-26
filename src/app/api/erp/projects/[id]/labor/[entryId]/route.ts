import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string; entryId: string }> };

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id, entryId } = await ctx.params;
  try {
    await prisma.laborEntry.delete({ where: { id: entryId, projectId: id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
