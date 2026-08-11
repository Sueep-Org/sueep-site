import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { buildDayAssignmentInvite } from "@/lib/calendarInvite";
import { dayKey } from "@/lib/erp/schedule";

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

// Change orders in these statuses never happened (or won't) — same list the
// schedule page itself uses to keep them off the calendar entirely.
const CO_STATUS_EXCLUDED = ["REJECTED", "VOID"];

function extractEmailAddress(raw: string | undefined): string {
  if (!raw) return "noreply@sueep.com";
  const match = raw.match(/<([^>]+)>/);
  return match ? match[1]! : raw.trim();
}

// Plans (or updates) a supervisor/PM/time/comment for a change order on one
// specific day — same idea as /api/erp/schedule/day-assignments but scoped
// to a ProjectChangeOrder instead of the parent Project. No series/repeat
// and no SOV/scope pickers, unlike the project route — COs are assigned one
// day at a time for now.
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const changeOrderId = String(body.changeOrderId || "").trim();
  const supervisorUserId = String(body.supervisorUserId || "").trim() || null;
  // Rare case: only the PM covers a day, no supervisor. Not synced onto
  // ProjectChangeOrder (unlike supervisorUserId), calendar/day-assignment
  // concept only, no calendar-invite email goes out for it.
  const projectManagerUserId = String(body.projectManagerUserId || "").trim() || null;
  const dateRaw = String(body.date || "").trim();
  const comment = typeof body.comment === "string" && body.comment.trim() ? body.comment.trim() : null;
  if (!changeOrderId) return NextResponse.json({ error: "changeOrderId is required" }, { status: 400 });
  if (!dateRaw) return NextResponse.json({ error: "date is required" }, { status: 400 });
  const date = new Date(`${dateRaw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return NextResponse.json({ error: "Invalid date" }, { status: 400 });

  let startTime: string | null = null;
  let endTime: string | null = null;
  if (body.startTime || body.endTime) {
    startTime = String(body.startTime || "").trim();
    endTime = String(body.endTime || "").trim();
    if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) {
      return NextResponse.json({ error: "startTime and endTime must both be HH:MM" }, { status: 400 });
    }
    if (endTime <= startTime) {
      return NextResponse.json({ error: "endTime must be after startTime" }, { status: 400 });
    }
  }

  const [changeOrder, supervisor, projectManager] = await Promise.all([
    prisma.projectChangeOrder.findUnique({
      where: { id: changeOrderId },
      select: {
        id: true,
        title: true,
        status: true,
        projectId: true,
        project: {
          select: {
            jobTitle: true,
            building: { select: { address: true } },
            workOrderRecord: { select: { siteAddress: true } },
          },
        },
      },
    }),
    supervisorUserId ? prisma.erpUser.findUnique({ where: { id: supervisorUserId }, select: { id: true, email: true } }) : null,
    projectManagerUserId ? prisma.erpUser.findUnique({ where: { id: projectManagerUserId }, select: { id: true, email: true } }) : null,
  ]);
  if (!changeOrder) return NextResponse.json({ error: "Change order not found" }, { status: 404 });
  if (CO_STATUS_EXCLUDED.includes(changeOrder.status)) {
    return NextResponse.json({ error: "This change order can't be scheduled" }, { status: 400 });
  }
  if (supervisorUserId && !supervisor) return NextResponse.json({ error: "Supervisor not found" }, { status: 404 });
  if (projectManagerUserId && !projectManager) return NextResponse.json({ error: "PM not found" }, { status: 404 });

  const location =
    changeOrder.project.building?.address || changeOrder.project.workOrderRecord?.siteAddress || undefined;

  const writeAssignment = prisma.changeOrderDayAssignment.upsert({
    where: { changeOrderId_date: { changeOrderId, date } },
    create: { changeOrderId, date, supervisorUserId, projectManagerUserId, startTime, endTime, comment },
    update: { supervisorUserId, projectManagerUserId, startTime, endTime, comment },
  });
  // Assigning a supervisor here also makes them the CO's current supervisor
  // (ProjectChangeOrder.supervisorUserId), same "last assignment wins" rule
  // the project day-assignment route uses for Project.supervisorUserId —
  // this is what the calendar's "needs a supervisor" check reads.
  const assignment = supervisorUserId
    ? (
        await prisma.$transaction([
          writeAssignment,
          prisma.projectChangeOrder.update({ where: { id: changeOrderId }, data: { supervisorUserId } }),
        ])
      )[0]
    : await writeAssignment;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "";

  // Send a calendar invite (.ics) for the assignment, same UID-reuse
  // behavior as the project route so a reassign updates rather than
  // duplicates the calendar event. Email failures shouldn't block the
  // assignment. No invite for a PM-only day, see projectManagerUserId above.
  if (supervisorUserId && supervisor) {
    try {
      const descriptionLines = [
        `Change order: ${changeOrder.title}`,
        `Project: ${changeOrder.project.jobTitle}`,
        ...(appUrl ? ["", `${appUrl}/erp/projects/${changeOrder.projectId}/change-orders/${changeOrderId}`] : []),
      ];
      const ics = buildDayAssignmentInvite({
        uid: `co-day-assignment-${assignment.id}@sueep.com`,
        dateKey: dayKey(assignment.date),
        startTime: assignment.startTime,
        endTime: assignment.endTime,
        summary: `Supervising: ${changeOrder.title} (${changeOrder.project.jobTitle})`,
        description: descriptionLines.join("\n"),
        location,
        url: appUrl ? `${appUrl}/erp/projects/${changeOrder.projectId}/change-orders/${changeOrderId}` : undefined,
        organizerEmail: extractEmailAddress(process.env.RESEND_FROM),
        organizerName: "Sueep Schedule",
        attendeeEmail: supervisor.email,
      });
      await sendEmail({
        to: supervisor.email,
        subject: `You're assigned: ${changeOrder.title} on ${dayKey(assignment.date)}`,
        html: `<p>You've been assigned to <strong>${changeOrder.title}</strong> (${changeOrder.project.jobTitle}) on ${dayKey(assignment.date)}. Add the attached invite to your calendar.</p>`,
        attachments: [{ filename: "invite.ics", content: Buffer.from(ics) }],
      });
    } catch (e) {
      console.error("Failed to send CO day-assignment calendar invite", e);
    }
  }

  return NextResponse.json(assignment, { status: 201 });
}
