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
  const assignment = await prisma.projectLaborAssignment.findUnique({
    where: { id },
    include: {
      employee: { select: { id: true, firstName: true, lastName: true, status: true } },
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

  const existing = await prisma.projectLaborAssignment.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (body.employeeId !== undefined) {
    const employeeId = String(body.employeeId || "").trim();
    if (!employeeId) return NextResponse.json({ error: "employeeId is required" }, { status: 400 });
    data.employeeId = employeeId;
  }
  if (body.projectId !== undefined) {
    const projectId = String(body.projectId || "").trim();
    if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    data.projectId = projectId;
  }
  if (body.role !== undefined) data.role = String(body.role || "").trim() || null;
  if (body.assignedDate !== undefined) data.assignedDate = parseDate(body.assignedDate);
  if (body.startDate !== undefined) data.startDate = parseDate(body.startDate);
  if (body.endDate !== undefined) data.endDate = parseDate(body.endDate);
  if (body.notes !== undefined) data.notes = String(body.notes || "").trim() || null;

  try {
    const assignment = await prisma.projectLaborAssignment.update({ where: { id }, data: data as object });
    return NextResponse.json(assignment);
  } catch (e: unknown) {
    if (typeof e === "object" && e !== null && "code" in e && e.code === "P2002") {
      return NextResponse.json({ error: "This laborer is already assigned to this project" }, { status: 409 });
    }
    console.error("PATCH /api/erp/project-labor-assignments/[id]", e);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    await prisma.projectLaborAssignment.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/erp/project-labor-assignments/[id]", e);
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
