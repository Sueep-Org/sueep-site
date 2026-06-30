import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dollarsToCents } from "@/lib/erp/money";
import { syncSovPercentDone } from "@/lib/sovSync";

type Ctx = { params: Promise<{ id: string; entryId: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const { id, entryId } = await ctx.params;
  const existing = await prisma.laborEntry.findUnique({ where: { id: entryId, projectId: id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};

  if (body.workDate !== undefined) {
    data.workDate = new Date(`${String(body.workDate)}T00:00:00-05:00`);
  }
  if (body.workerName !== undefined) {
    const name = String(body.workerName).trim();
    if (!name) return NextResponse.json({ error: "workerName is required" }, { status: 400 });
    data.workerName = name;
  }
  if (body.role !== undefined) data.role = body.role ? String(body.role).trim() || null : null;
  if (body.hours !== undefined) {
    const h = Number(body.hours);
    if (!Number.isFinite(h) || h <= 0) return NextResponse.json({ error: "Invalid hours" }, { status: 400 });
    data.hours = h;
  }
  if (body.clockIn !== undefined) {
    data.clockIn = typeof body.clockIn === "string" && /^\d{2}:\d{2}$/.test(body.clockIn) ? body.clockIn : null;
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
  if (body.sovItemId !== undefined) {
    const sovItemId = body.sovItemId ? String(body.sovItemId).trim() : null;
    if (sovItemId) {
      const sovItem = await prisma.projectSOVItem.findFirst({ where: { id: sovItemId, sov: { projectId: id } }, select: { id: true } });
      if (!sovItem) return NextResponse.json({ error: "SOV item not found" }, { status: 404 });
    }
    data.sovItemId = sovItemId;
  }

  try {
    const entry = await prisma.laborEntry.update({ where: { id: entryId }, data: data as object });
    if (body.sovItemId !== undefined && data.sovItemId) {
      if (body.sovCompleted !== undefined) {
        await prisma.projectSOVItem.update({ where: { id: String(data.sovItemId) }, data: { completed: Boolean(body.sovCompleted) } });
      }
      await syncSovPercentDone(id);
    }
    return NextResponse.json(entry);
  } catch {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id, entryId } = await ctx.params;
  try {
    await prisma.laborEntry.delete({ where: { id: entryId, projectId: id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
