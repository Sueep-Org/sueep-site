import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

function parseDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const assignment = await prisma.contractorAssignment.findUnique({
    where: { id },
    include: {
      contractor: { select: { id: true, name: true } },
      building: { select: { id: true, name: true } },
      project: { select: { id: true, jobTitle: true } },
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

  const existing = await prisma.contractorAssignment.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (body.contractorId !== undefined) {
    const contractorId = String(body.contractorId || "").trim();
    if (!contractorId) return NextResponse.json({ error: "contractorId is required" }, { status: 400 });
    data.contractorId = contractorId;
  }
  if (body.buildingId !== undefined) data.buildingId = body.buildingId ? String(body.buildingId).trim() : null;
  if (body.projectId !== undefined) data.projectId = body.projectId ? String(body.projectId).trim() : null;
  if (body.role !== undefined) data.role = String(body.role || "").trim() || null;
  if (body.assignedDate !== undefined) data.assignedDate = parseDate(body.assignedDate);
  if (body.startDate !== undefined) data.startDate = parseDate(body.startDate);
  if (body.endDate !== undefined) data.endDate = parseDate(body.endDate);
  if (body.notes !== undefined) data.notes = String(body.notes || "").trim() || null;

  try {
    const assignment = await prisma.contractorAssignment.update({ where: { id }, data: data as object });
    return NextResponse.json(assignment);
  } catch (e) {
    console.error("PATCH /api/erp/contractor-assignments/[id]", e);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    await prisma.contractorAssignment.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/erp/contractor-assignments/[id]", e);
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
