import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string; itemId: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const { id, itemId } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const existing = await prisma.projectChecklistItem.findFirst({
    where: { id: itemId, projectId: id },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (body.completed !== undefined) data.completed = Boolean(body.completed);
  if (body.title !== undefined) data.title = String(body.title).trim();
  if (body.notes !== undefined) data.notes = body.notes ? String(body.notes).trim() : null;

  const updated = await prisma.projectChecklistItem.update({ where: { id: itemId }, data: data as object });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id, itemId } = await ctx.params;

  const existing = await prisma.projectChecklistItem.findFirst({
    where: { id: itemId, projectId: id },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.projectChecklistItem.delete({ where: { id: itemId } });
  return NextResponse.json({ ok: true });
}
