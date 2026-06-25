import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;

  const sov = await prisma.projectSOV.findUnique({
    where: { projectId: id },
    include: { items: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] } },
  });

  // Verify project exists with an eligible segment
  const project = await prisma.project.findFirst({
    where: { id, segment: { in: ["COMMERCIAL_PAINTING", "COMMERCIAL_CLEANING", "OTHER"] } },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!sov) return NextResponse.json({ items: [] });

  return NextResponse.json({
    items: sov.items.map((item) => ({
      id: item.id,
      description: item.description,
      completed: item.completed,
      billingStatus: item.billingStatus,
    })),
  });
}
