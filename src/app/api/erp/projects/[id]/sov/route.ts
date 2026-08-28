import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const project = await prisma.project.findUnique({ where: { id }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const sov = await prisma.projectSOV.findUnique({
    where: { projectId: id },
    include: { items: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] } },
  });

  return NextResponse.json(sov ?? { id: null, items: [] });
}
