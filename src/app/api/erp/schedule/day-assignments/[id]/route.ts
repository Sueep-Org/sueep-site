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

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;

  const existing = await prisma.projectDayAssignment.findUnique({
    where: { id },
    include: {
      project: { select: { jobTitle: true } },
      supervisorUser: { select: { email: true } },
    },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.projectDayAssignment.delete({ where: { id } });

  // Send a cancellation for the invite sent when this assignment was
  // created, reusing the same UID so calendar apps remove the right event.
  try {
    const ics = buildDayAssignmentInvite({
      uid: `day-assignment-${id}@sueep.com`,
      dateKey: dayKey(existing.date),
      summary: `Supervising: ${existing.project.jobTitle}`,
      organizerEmail: extractEmailAddress(process.env.RESEND_FROM),
      organizerName: "Sueep Schedule",
      attendeeEmail: existing.supervisorUser.email,
      cancelled: true,
    });
    await sendEmail({
      to: existing.supervisorUser.email,
      subject: `Cancelled: ${existing.project.jobTitle} on ${dayKey(existing.date)}`,
      html: `<p>Your assignment to <strong>${existing.project.jobTitle}</strong> on ${dayKey(existing.date)} has been removed.</p>`,
      attachments: [{ filename: "invite.ics", content: Buffer.from(ics) }],
    });
  } catch (e) {
    console.error("Failed to send day-assignment cancellation invite", e);
  }

  return NextResponse.json({ ok: true });
}
