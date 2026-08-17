import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dayKey } from "@/lib/erp/schedule";
import { resolveWorkerContact, sendDayInvite } from "@/lib/erp/scheduleInvites";

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
      // Every day/crew row this series generated — read before the cascade
      // delete below removes them, so each occurrence can get its own
      // cancellation (each was sent its own individual invite — see the
      // day-assignments/worker-assignments POST routes — not one combined
      // recurring invite for the whole range).
      dayAssignments: { select: { id: true, date: true } },
      workerAssignments: { select: { id: true, date: true, employeeId: true, contractorId: true } },
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
    const supervisor = await prisma.erpUser.findUnique({
      where: { id: series.supervisorUserId },
      select: { email: true },
    });
    if (supervisor) {
      await Promise.all(
        series.dayAssignments.map((a) =>
          sendDayInvite({
            uid: `day-assignment-${a.id}@sueep.com`,
            to: supervisor.email,
            role: "Supervising",
            title: series.project.jobTitle,
            dateKey: dayKey(a.date),
            startTime: series.startTime,
            endTime: series.endTime,
            location,
            cancelled: true,
          })
        )
      );
    }
  }

  // One cancellation per crew row (not per unique worker) — each occurrence
  // was sent its own invite, so each gets its own cancellation.
  await Promise.all(
    series.workerAssignments.map(async (w) => {
      const contact = await resolveWorkerContact(w.employeeId, w.contractorId);
      if (!contact) return;
      await sendDayInvite({
        uid: `worker-assignment-${w.id}@sueep.com`,
        to: contact.email,
        attendeeName: contact.name,
        role: "Working",
        title: series.project.jobTitle,
        dateKey: dayKey(w.date),
        startTime: series.startTime,
        endTime: series.endTime,
        location,
        cancelled: true,
      });
    })
  );

  return NextResponse.json({ ok: true });
}
