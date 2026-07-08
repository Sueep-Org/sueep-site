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
  const supervisorUserId = String(body.supervisorUserId || "").trim();
  const dateRaw = String(body.date || "").trim();
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  if (!supervisorUserId) return NextResponse.json({ error: "supervisorUserId is required" }, { status: 400 });
  if (!dateRaw) return NextResponse.json({ error: "date is required" }, { status: 400 });

  const date = new Date(`${dateRaw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return NextResponse.json({ error: "Invalid date" }, { status: 400 });

  const [project, supervisor] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { id: true } }),
    prisma.erpUser.findUnique({ where: { id: supervisorUserId }, select: { id: true } }),
  ]);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (!supervisor) return NextResponse.json({ error: "Supervisor not found" }, { status: 404 });

  const assignment = await prisma.projectDayAssignment.upsert({
    where: { projectId_date: { projectId, date } },
    create: { projectId, date, supervisorUserId },
    update: { supervisorUserId },
  });

  return NextResponse.json(assignment, { status: 201 });
}
