import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

function parseDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function parseStringArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  }
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const assignment = await prisma.laborAssignment.findUnique({
    where: { id },
    include: {
      turnoverRequest: { include: { building: true } },
      laborer: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  if (!assignment) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(assignment);
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const existing = await prisma.laborAssignment.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (body.turnoverRequestId !== undefined) {
    const turnoverRequestId = String(body.turnoverRequestId || "").trim();
    if (!turnoverRequestId) {
      return NextResponse.json({ error: "turnoverRequestId is required" }, { status: 400 });
    }
    data.turnoverRequestId = turnoverRequestId;
  }
  if (body.laborerId !== undefined) {
    const laborerId = String(body.laborerId || "").trim();
    if (!laborerId) {
      return NextResponse.json({ error: "laborerId is required" }, { status: 400 });
    }
    data.laborerId = laborerId;
  }
  if (body.role !== undefined) data.role = String(body.role || "").trim() || null;
  if (body.assignedDate !== undefined) data.assignedDate = parseDate(body.assignedDate);
  if (body.startDate !== undefined) data.startDate = parseDate(body.startDate);
  if (body.endDate !== undefined) data.endDate = parseDate(body.endDate);
  if (body.notes !== undefined) data.notes = String(body.notes || "").trim() || null;
  if (body.materialsUsed !== undefined) {
    const materialsUsed = parseStringArray(body.materialsUsed);
    data.materialsUsed = materialsUsed.length > 0 ? materialsUsed : null;
  }

  try {
    const assignment = await prisma.laborAssignment.update({ where: { id }, data: data as object });
    return NextResponse.json(assignment);
  } catch (e) {
    console.error("PATCH /api/erp/labor-assignments/[id]", e);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    await prisma.laborAssignment.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/erp/labor-assignments/[id]", e);
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
