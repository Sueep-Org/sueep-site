import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dayKey } from "@/lib/erp/schedule";
import { resolveWorkerContact, sendSeriesInvite, workerSeriesUid } from "@/lib/erp/scheduleInvites";

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
      // Every crew row this series generated — read before the cascade
      // delete below removes them, so each worker can get a cancellation
      // for the same series-scoped invite they were originally sent.
      workerAssignments: { select: { employeeId: true, contractorId: true } },
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
      await sendSeriesInvite({
        uid: `day-assignment-series-${id}@sueep.com`,
        to: supervisor.email,
        role: "Supervising",
        title: series.project.jobTitle,
        firstDateKey: dayKey(series.startDate),
        lastDateKey: dayKey(series.endDate),
        repeatDays: series.repeatDays,
        startTime: series.startTime,
        endTime: series.endTime,
        location,
        cancelled: true,
      });
    }
  }

  // One cancellation per unique crew member the series had, not per row —
  // they were only ever sent one combined series invite to begin with, see
  // worker-assignments' POST route.
  const uniqueWorkers = new Map<string, { employeeId: string | null; contractorId: string | null }>();
  for (const w of series.workerAssignments) {
    uniqueWorkers.set(w.employeeId ?? `c-${w.contractorId}`, w);
  }
  await Promise.all(
    [...uniqueWorkers.values()].map(async (w) => {
      const contact = await resolveWorkerContact(w.employeeId, w.contractorId);
      if (!contact) return;
      await sendSeriesInvite({
        uid: workerSeriesUid(id, w.employeeId, w.contractorId),
        to: contact.email,
        attendeeName: contact.name,
        role: "Working",
        title: series.project.jobTitle,
        firstDateKey: dayKey(series.startDate),
        lastDateKey: dayKey(series.endDate),
        repeatDays: series.repeatDays,
        startTime: series.startTime,
        endTime: series.endTime,
        location,
        cancelled: true,
      });
    })
  );

  return NextResponse.json({ ok: true });
}
