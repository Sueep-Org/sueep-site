import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncSovPercentDone } from "@/lib/sovSync";

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
  if (body.costCents !== undefined) data.costCents = body.costCents != null && body.costCents !== "" ? Math.round(Number(body.costCents)) : null;
  if (body.taskDescription !== undefined) data.taskDescription = body.taskDescription ? String(body.taskDescription).trim() || null : null;

  let sovItemIds: string[] | undefined;
  if (body.sovItemIds !== undefined) {
    sovItemIds = Array.isArray(body.sovItemIds)
      ? [...new Set(body.sovItemIds.map((v) => String(v).trim()).filter(Boolean))]
      : [];
    const projectId = (data.projectId as string | null | undefined) ?? existing.projectId;
    if (sovItemIds.length > 0) {
      if (!projectId) return NextResponse.json({ error: "Assignment has no project to link SOV items to" }, { status: 400 });
      const found = await prisma.projectSOVItem.findMany({ where: { id: { in: sovItemIds }, sov: { projectId } }, select: { id: true } });
      if (found.length !== sovItemIds.length) return NextResponse.json({ error: "SOV item not found" }, { status: 404 });
    }
    data.sovItems = { set: sovItemIds.map((sovId) => ({ id: sovId })) };
  }

  try {
    const assignment = await prisma.contractorAssignment.update({ where: { id }, data: data as object, include: { sovItems: { select: { id: true } } } });
    if (sovItemIds !== undefined && existing.projectId) {
      const sovCompletedIds = new Set(
        Array.isArray(body.sovCompletedIds) ? body.sovCompletedIds.map((v) => String(v).trim()) : []
      );
      const idsToComplete = sovItemIds.filter((sovId) => sovCompletedIds.has(sovId));
      if (idsToComplete.length > 0) {
        await prisma.projectSOVItem.updateMany({ where: { id: { in: idsToComplete } }, data: { completed: true } });
      }
      await syncSovPercentDone(existing.projectId);
    }
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
