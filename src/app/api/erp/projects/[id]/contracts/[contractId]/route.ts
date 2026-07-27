import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string; contractId: string }> };

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id, contractId } = await ctx.params;

  const contract = await prisma.projectContract.findFirst({
    where: { id: contractId, projectId: id },
    select: { id: true },
  });
  if (!contract) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.projectContract.delete({ where: { id: contractId } });

  return NextResponse.json({ ok: true });
}
