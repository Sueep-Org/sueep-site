import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dollarsToCents } from "@/lib/erp/money";

type Ctx = { params: Promise<{ laborerId: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const { laborerId } = await ctx.params;
  const existing = await prisma.projectChangeOrderLaborer.findUnique({ where: { id: laborerId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (body.workDate !== undefined) data.workDate = new Date(`${String(body.workDate)}T00:00:00-05:00`);
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
    data.name = name;
  }
  if (body.role !== undefined) data.role = body.role ? String(body.role).trim() || null : null;
  if (body.hours !== undefined) {
    const h = Number(body.hours);
    if (!Number.isFinite(h) || h <= 0) return NextResponse.json({ error: "Invalid hours" }, { status: 400 });
    data.hours = h;
  }
  if (body.hourlyRate !== undefined) {
    const rate = typeof body.hourlyRate === "string"
      ? Number(String(body.hourlyRate).replace(/[$,]/g, ""))
      : Number(body.hourlyRate);
    if (!Number.isFinite(rate) || rate < 0) return NextResponse.json({ error: "Invalid rate" }, { status: 400 });
    data.hourlyRateCents = dollarsToCents(rate);
  }
  if (body.taskDescription !== undefined) {
    data.taskDescription = body.taskDescription ? String(body.taskDescription).trim() || null : null;
  }
  if (body.qualityRating !== undefined) {
    data.qualityRating = body.qualityRating ? String(body.qualityRating).trim() || null : null;
  }
  if (body.qualityNotes !== undefined) {
    data.qualityNotes = body.qualityNotes ? String(body.qualityNotes).trim() || null : null;
  }
  if (body.completed !== undefined) {
    data.completed = Boolean(body.completed);
  }

  try {
    const entry = await prisma.projectChangeOrderLaborer.update({ where: { id: laborerId }, data: data as object });
    return NextResponse.json(entry);
  } catch {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

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
