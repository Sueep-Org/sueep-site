import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { buildScheduleSeriesInvite } from "@/lib/calendarInvite";
import { dayKey } from "@/lib/erp/schedule";

function extractEmailAddress(raw: string | undefined): string {
  if (!raw) return "noreply@sueep.com";
  const match = raw.match(/<([^>]+)>/);
  return match ? match[1]! : raw.trim();
}

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;

  const series = await prisma.projectScheduleSeries.findUnique({
    where: { id },
    include: {
      project: {
        select: {
          jobTitle: true,
          building: { select: { address: true } },
          workOrderRecord: { select: { siteAddress: true } },
        },
      },
    },
  });
  if (!series) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const location = series.project.building?.address || series.project.workOrderRecord?.siteAddress || undefined;

  // Cascades to every ProjectDayAssignment/ProjectWorkerDayAssignment row
  // this series generated (onDelete: Cascade on their seriesId FK). Rows
  // added manually to one of these days without going through the repeat
  // flow have no seriesId and are left alone.
  await prisma.projectScheduleSeries.delete({ where: { id } });

  if (series.supervisorUserId) {
    try {
      const supervisor = await prisma.erpUser.findUnique({
        where: { id: series.supervisorUserId },
        select: { email: true },
      });
      if (supervisor) {
        const ics = buildScheduleSeriesInvite({
          uid: `day-assignment-series-${id}@sueep.com`,
          firstDateKey: dayKey(series.startDate),
          lastDateKey: dayKey(series.endDate),
          repeatDays: series.repeatDays,
          startTime: series.startTime,
          endTime: series.endTime,
          summary: `Supervising: ${series.project.jobTitle}`,
          location,
          organizerEmail: extractEmailAddress(process.env.RESEND_FROM),
          organizerName: "Sueep Schedule",
          attendeeEmail: supervisor.email,
          cancelled: true,
        });
        await sendEmail({
          to: supervisor.email,
          subject: `Cancelled: ${series.project.jobTitle}, ${dayKey(series.startDate)} through ${dayKey(series.endDate)}`,
          html: `<p>Your repeating assignment to <strong>${series.project.jobTitle}</strong> has been removed.</p>`,
          attachments: [{ filename: "invite.ics", content: Buffer.from(ics) }],
        });
      }
    } catch (e) {
      console.error("Failed to send schedule-series cancellation invite", e);
    }
  }

  return NextResponse.json({ ok: true });
}
