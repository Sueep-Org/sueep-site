import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const items = await prisma.projectChecklistItem.findMany({
    where: { projectId: id },
    orderBy: [{ date: "desc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(items);
}

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;

  const project = await prisma.project.findUnique({ where: { id }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const title = String(body.title || "").trim();
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });

  const rawDate = String(body.date || "").trim();
  if (!rawDate) return NextResponse.json({ error: "date is required" }, { status: 400 });
  const date = new Date(rawDate);
  if (isNaN(date.getTime())) return NextResponse.json({ error: "Invalid date" }, { status: 400 });

  const item = await prisma.projectChecklistItem.create({
    data: {
      projectId: id,
      date,
      title,
      notes: body.notes ? String(body.notes).trim() : null,
      completed: false,
    },
  });

  return NextResponse.json(item, { status: 201 });
}
