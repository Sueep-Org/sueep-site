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

  const existing = await prisma.changeOrderDayAssignment.findUnique({
    where: { id },
    include: {
      changeOrder: {
        select: {
          title: true,
          project: {
            select: {
              jobTitle: true,
              building: { select: { address: true } },
              workOrderRecord: { select: { siteAddress: true } },
            },
          },
        },
      },
      supervisorUser: { select: { email: true } },
    },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const location =
    existing.changeOrder.project.building?.address || existing.changeOrder.project.workOrderRecord?.siteAddress || undefined;

  // Removing the planned supervisor event also clears any planned workers
  // for that same change-order/day, same rule the project route follows.
  await prisma.$transaction([
    prisma.changeOrderDayAssignment.delete({ where: { id } }),
    prisma.changeOrderWorkerDayAssignment.deleteMany({ where: { changeOrderId: existing.changeOrderId, date: existing.date } }),
  ]);

  // Send a cancellation for the invite sent when this assignment was
  // created, reusing the same UID so calendar apps remove the right event.
  if (existing.supervisorUser) {
    try {
      const ics = buildDayAssignmentInvite({
        uid: `co-day-assignment-${id}@sueep.com`,
        dateKey: dayKey(existing.date),
        startTime: existing.startTime,
        endTime: existing.endTime,
        summary: `Supervising: ${existing.changeOrder.title} (${existing.changeOrder.project.jobTitle})`,
        location,
        organizerEmail: extractEmailAddress(process.env.RESEND_FROM),
        organizerName: "Sueep Schedule",
        attendeeEmail: existing.supervisorUser.email,
        cancelled: true,
      });
      await sendEmail({
        to: existing.supervisorUser.email,
        subject: `Cancelled: ${existing.changeOrder.title} on ${dayKey(existing.date)}`,
        html: `<p>Your assignment to <strong>${existing.changeOrder.title}</strong> (${existing.changeOrder.project.jobTitle}) on ${dayKey(existing.date)} has been removed.</p>`,
        attachments: [{ filename: "invite.ics", content: Buffer.from(ics) }],
      });
    } catch (e) {
      console.error("Failed to send CO day-assignment cancellation invite", e);
    }
  }

  return NextResponse.json({ ok: true });
}
