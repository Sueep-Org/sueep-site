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
  const project = await prisma.project.findUnique({ where: { id }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const assignments = await prisma.projectLaborAssignment.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "desc" },
    include: { employee: { select: { id: true, firstName: true, lastName: true, status: true } } },
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

  const employeeId = String(body.employeeId || "").trim();
  if (!employeeId) return NextResponse.json({ error: "employeeId is required" }, { status: 400 });

  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true } });
  if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

  try {
    const assignment = await prisma.projectLaborAssignment.create({
      data: {
        projectId: id,
        employeeId,
        role: body.role != null ? String(body.role).trim() || null : null,
        assignedDate: parseDate(body.assignedDate),
        startDate: parseDate(body.startDate),
        endDate: parseDate(body.endDate),
        notes: body.notes != null ? String(body.notes).trim() || null : null,
      },
      include: { employee: { select: { id: true, firstName: true, lastName: true, status: true } } },
    });
    return NextResponse.json(assignment);
  } catch (e: unknown) {
    if (typeof e === "object" && e !== null && "code" in e && e.code === "P2002") {
      return NextResponse.json({ error: "This laborer is already assigned to this project" }, { status: 409 });
    }
    console.error("POST /api/erp/projects/[id]/labor-assignments", e);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}
