import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { buildDayAssignmentInvite } from "@/lib/calendarInvite";
import { dayKey } from "@/lib/erp/schedule";

function extractEmailAddress(raw: string | undefined): string {
  if (!raw) return "noreply@sueep.com";
  const match = raw.match(/<([^>]+)>/);
  return match ? match[1]! : raw.trim();
}

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
    prisma.project.findUnique({ where: { id: projectId }, select: { id: true, jobTitle: true } }),
    prisma.erpUser.findUnique({ where: { id: supervisorUserId }, select: { id: true, email: true } }),
  ]);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (!supervisor) return NextResponse.json({ error: "Supervisor not found" }, { status: 404 });

  // Assigning a supervisor here also makes them the project's supervisor on
  // the project details page (Project.supervisorUserId) — same field the
  // Gantt's inline reassignment dropdown writes to. Last assignment wins,
  // consistent with that dropdown's behavior.
  const [assignment] = await prisma.$transaction([
    prisma.projectDayAssignment.upsert({
      where: { projectId_date: { projectId, date } },
      create: { projectId, date, supervisorUserId },
      update: { supervisorUserId },
    }),
    prisma.project.update({ where: { id: projectId }, data: { supervisorUserId } }),
  ]);

  // Send a calendar invite (.ics) for the assignment. Reuses the same UID on
  // every send for this assignment, so re-running this (e.g. reassigning the
  // same project/day) updates the existing calendar event instead of adding
  // a duplicate. Email delivery failures shouldn't block the assignment.
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "";
    const ics = buildDayAssignmentInvite({
      uid: `day-assignment-${assignment.id}@sueep.com`,
      dateKey: dayKey(assignment.date),
      summary: `Supervising: ${project.jobTitle}`,
      description: appUrl ? `Project: ${project.jobTitle}\n${appUrl}/erp/projects/${projectId}` : `Project: ${project.jobTitle}`,
      url: appUrl ? `${appUrl}/erp/projects/${projectId}` : undefined,
      organizerEmail: extractEmailAddress(process.env.RESEND_FROM),
      organizerName: "Sueep Schedule",
      attendeeEmail: supervisor.email,
    });
    await sendEmail({
      to: supervisor.email,
      subject: `You're assigned: ${project.jobTitle} on ${dayKey(assignment.date)}`,
      html: `<p>You've been assigned to <strong>${project.jobTitle}</strong> on ${dayKey(assignment.date)}. Add the attached invite to your calendar.</p>`,
      attachments: [{ filename: "invite.ics", content: Buffer.from(ics) }],
    });
  } catch (e) {
    console.error("Failed to send day-assignment calendar invite", e);
  }

  return NextResponse.json(assignment, { status: 201 });
}
