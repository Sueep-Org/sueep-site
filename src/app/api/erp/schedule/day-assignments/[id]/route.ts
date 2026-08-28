import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dayKey } from "@/lib/erp/schedule";
import { notifyProjectCrew, sendDayInvite } from "@/lib/erp/scheduleInvites";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;

  const existing = await prisma.projectDayAssignment.findUnique({
    where: { id },
    include: {
      project: {
        select: {
          jobTitle: true,
          building: { select: { address: true } },
          workOrderRecord: { select: { siteAddress: true } },
        },
      },
      supervisorUser: { select: { email: true } },
    },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const location = existing.project.building?.address || existing.project.workOrderRecord?.siteAddress || undefined;

  // Crew cancellations need the still-live rows (fetched before the
  // transaction below wipes them) — removing the planned supervisor event
  // also clears any planned workers for that same project/day, they were
  // only ever assigned in the context of this event, not the project as a
  // whole.
  await notifyProjectCrew({
    projectId: existing.projectId,
    dates: [existing.date],
    projectTitle: existing.project.jobTitle,
    location,
    startTime: existing.startTime,
    endTime: existing.endTime,
    daySovDescriptions: [],
    dayScopeLabels: [],
    cancelled: true,
  });

  await prisma.$transaction([
    prisma.projectDayAssignment.delete({ where: { id } }),
    prisma.projectWorkerDayAssignment.deleteMany({ where: { projectId: existing.projectId, date: existing.date } }),
  ]);

  // Send a cancellation for the invite sent when this assignment was
  // created, reusing the same UID so calendar apps remove the right event.
  // No invite (so no cancellation) went out for a PM-only assignment, see
  // the POST route's projectManagerUserId handling.
  if (existing.supervisorUser) {
    await sendDayInvite({
      uid: `day-assignment-${id}@sueep.com`,
      to: existing.supervisorUser.email,
      role: "Supervising",
      title: existing.project.jobTitle,
      dateKey: dayKey(existing.date),
      startTime: existing.startTime,
      endTime: existing.endTime,
      location,
      cancelled: true,
    });
  }

  return NextResponse.json({ ok: true });
}
