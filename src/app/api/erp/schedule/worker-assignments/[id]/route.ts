import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isTurnoverScopeValue } from "@/lib/erp/turnoverScope";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    await prisma.projectWorkerDayAssignment.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

/** Reassigns which SOV item / turnover scope an already-added worker covers
 * for their day — e.g. the day's scope was split after the crew was
 * already added, or a worker needs to be moved from one scope to another.
 * Only touches assignedSovItemId/assignedScopeItem, nothing else about the
 * row. Sending `null` clears it (falls back to "covers everything"). */
export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const existing = await prisma.projectWorkerDayAssignment.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: { assignedSovItemId?: string | null; assignedScopeItem?: string | null } = {};

  if ("assignedSovItemId" in body) {
    const raw = String(body.assignedSovItemId || "").trim() || null;
    if (raw) {
      const found = await prisma.projectSOVItem.count({ where: { id: raw, sov: { projectId: existing.projectId } } });
      if (!found) return NextResponse.json({ error: "SOV item not found" }, { status: 404 });
    }
    data.assignedSovItemId = raw;
  }

  if ("assignedScopeItem" in body) {
    const raw = String(body.assignedScopeItem || "").trim() || null;
    if (raw && !isTurnoverScopeValue(raw)) {
      return NextResponse.json({ error: "Invalid assignedScopeItem" }, { status: 400 });
    }
    data.assignedScopeItem = raw;
  }

  const updated = await prisma.projectWorkerDayAssignment.update({ where: { id }, data });
  return NextResponse.json(updated);
}
