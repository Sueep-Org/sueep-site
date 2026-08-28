import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string; changeOrderId: string }> };

function parseDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export async function GET(_req: Request, ctx: Ctx) {
  const { id, changeOrderId } = await ctx.params;
  const changeOrder = await prisma.projectChangeOrder.findFirst({
    where: { id: changeOrderId, projectId: id },
    select: { id: true },
  });
  if (!changeOrder) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const assignments = await prisma.changeOrderContractorAssignment.findMany({
    where: { changeOrderId },
    orderBy: { createdAt: "desc" },
    include: { contractor: { select: { id: true, name: true } } },
  });
  return NextResponse.json(assignments);
}

export async function POST(req: Request, ctx: Ctx) {
  const { id, changeOrderId } = await ctx.params;
  const changeOrder = await prisma.projectChangeOrder.findFirst({
    where: { id: changeOrderId, projectId: id },
    select: { id: true },
  });
  if (!changeOrder) return NextResponse.json({ error: "Not found" }, { status: 404 });

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

  try {
    const assignment = await prisma.changeOrderContractorAssignment.create({
      data: {
        changeOrderId,
        contractorId,
        role: body.role != null ? String(body.role).trim() || null : null,
        assignedDate: parseDate(body.assignedDate),
        startDate: parseDate(body.startDate),
        endDate: parseDate(body.endDate),
        notes: body.notes != null ? String(body.notes).trim() || null : null,
        costCents: body.costCents != null && body.costCents !== "" ? Math.round(Number(body.costCents)) : null,
      },
      include: { contractor: { select: { id: true, name: true } } },
    });
    return NextResponse.json(assignment);
  } catch (e) {
    console.error("POST /api/erp/projects/[id]/change-orders/[changeOrderId]/contractors", e);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}
