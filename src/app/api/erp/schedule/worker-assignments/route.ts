import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const projectId = String(body.projectId || "").trim();
  const employeeId = String(body.employeeId || "").trim();
  const dateRaw = String(body.date || "").trim();
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  if (!employeeId) return NextResponse.json({ error: "employeeId is required" }, { status: 400 });
  if (!dateRaw) return NextResponse.json({ error: "date is required" }, { status: 400 });

  const date = new Date(`${dateRaw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return NextResponse.json({ error: "Invalid date" }, { status: 400 });

  const [project, employee] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { id: true } }),
    prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true } }),
  ]);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

  // No notification is sent here (unlike the supervisor day-assignment
  // route, which emails a calendar invite) — may be added later.
  const assignment = await prisma.projectWorkerDayAssignment.upsert({
    where: { projectId_employeeId_date: { projectId, employeeId, date } },
    create: { projectId, employeeId, date },
    update: {},
  });

  return NextResponse.json(assignment, { status: 201 });
}
