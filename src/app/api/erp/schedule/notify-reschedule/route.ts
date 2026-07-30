import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notifyProjectRescheduled } from "@/lib/erp/notifyReschedule";

/**
 * Fired by the calendar's drag-and-drop / event-card "move" flow after a
 * planned (ProjectDayAssignment) reschedule succeeds — the move itself
 * happens via the existing day-assignments/worker-assignments routes; this
 * is purely the notification side, mirroring what PATCH /api/erp/projects/
 * [id] does for a plain project-date reschedule.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const projectId = String(body.projectId || "").trim();
  const oldDateKey = body.oldDateKey ? String(body.oldDateKey) : null;
  const newDateKey = String(body.newDateKey || "").trim();
  const supervisorUserId = body.supervisorUserId ? String(body.supervisorUserId) : null;
  const dayAssignmentPmUserId = body.projectManagerUserId ? String(body.projectManagerUserId) : null;

  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  if (!newDateKey) return NextResponse.json({ error: "newDateKey is required" }, { status: 400 });

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { jobTitle: true, supervisor: true } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  try {
    await notifyProjectRescheduled({
      projectId,
      jobTitle: project.jobTitle,
      oldDateKey,
      newDateKey,
      supervisorUserId,
      dayAssignmentPmUserId,
      projectManagerName: project.supervisor,
    });
  } catch (e) {
    console.error("Failed to notify day-assignment reschedule", e);
  }

  return NextResponse.json({ ok: true });
}
