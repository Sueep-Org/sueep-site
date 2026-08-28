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
  const project = await prisma.project.findUnique({ where: { id }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const assignments = await prisma.contractorAssignment.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "desc" },
    include: { contractor: { select: { id: true, name: true } }, sovItems: { select: { id: true } } },
  });
  return NextResponse.json(assignments);
}

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const project = await prisma.project.findUnique({ where: { id }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const contractorId = String(body.contractorId || "").trim();
  if (!contractorId) return NextResponse.json({ error: "contractorId is required" }, { status: 400 });

  const contractor = await prisma.contractor.findUnique({ where: { id: contractorId }, select: { id: true } });
  if (!contractor) return NextResponse.json({ error: "Contractor not found" }, { status: 404 });

  const sovItemIds = Array.isArray(body.sovItemIds)
    ? [...new Set(body.sovItemIds.map((v) => String(v).trim()).filter(Boolean))]
    : [];
  if (sovItemIds.length > 0) {
    const found = await prisma.projectSOVItem.findMany({ where: { id: { in: sovItemIds }, sov: { projectId: id } }, select: { id: true } });
    if (found.length !== sovItemIds.length) return NextResponse.json({ error: "SOV item not found" }, { status: 404 });
  }
  const sovCompletedIds = new Set(
    Array.isArray(body.sovCompletedIds) ? body.sovCompletedIds.map((v) => String(v).trim()) : []
  );

  try {
    const assignment = await prisma.contractorAssignment.create({
      data: {
        projectId: id,
        contractorId,
        role: body.role != null ? String(body.role).trim() || null : null,
        assignedDate: parseDate(body.assignedDate),
        startDate: parseDate(body.startDate),
        endDate: parseDate(body.endDate),
        notes: body.notes != null ? String(body.notes).trim() || null : null,
        costCents: body.costCents != null && body.costCents !== "" ? Math.round(Number(body.costCents)) : null,
        taskDescription: body.taskDescription != null ? String(body.taskDescription).trim() || null : null,
        sovItems: sovItemIds.length > 0 ? { connect: sovItemIds.map((sovId) => ({ id: sovId })) } : undefined,
      },
      include: { contractor: { select: { id: true, name: true } }, sovItems: { select: { id: true } } },
    });
    const idsToComplete = sovItemIds.filter((sovId) => sovCompletedIds.has(sovId));
    if (idsToComplete.length > 0) {
      await prisma.projectSOVItem.updateMany({ where: { id: { in: idsToComplete } }, data: { completed: true } });
      await syncSovPercentDone(id);
    }
    return NextResponse.json(assignment);
  } catch (e) {
    console.error("POST /api/erp/projects/[id]/contractors", e);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}
