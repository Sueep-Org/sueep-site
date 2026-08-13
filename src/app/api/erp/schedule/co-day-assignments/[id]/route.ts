import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dayKey } from "@/lib/erp/schedule";
import { notifyChangeOrderCrew, sendDayInvite } from "@/lib/erp/scheduleInvites";

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
  const title = `${existing.changeOrder.title} (${existing.changeOrder.project.jobTitle})`;

  // Crew cancellations need the still-live rows (fetched before the
  // transaction below wipes them), same rule the project route follows.
  await notifyChangeOrderCrew({
    changeOrderId: existing.changeOrderId,
    dates: [existing.date],
    title,
    location,
    startTime: existing.startTime,
    endTime: existing.endTime,
    cancelled: true,
  });

  // Removing the planned supervisor event also clears any planned workers
  // for that same change-order/day, same rule the project route follows.
  await prisma.$transaction([
    prisma.changeOrderDayAssignment.delete({ where: { id } }),
    prisma.changeOrderWorkerDayAssignment.deleteMany({ where: { changeOrderId: existing.changeOrderId, date: existing.date } }),
  ]);

  // Send a cancellation for the invite sent when this assignment was
  // created, reusing the same UID so calendar apps remove the right event.
  if (existing.supervisorUser) {
    await sendDayInvite({
      uid: `co-day-assignment-${id}@sueep.com`,
      to: existing.supervisorUser.email,
      role: "Supervising",
      title,
      dateKey: dayKey(existing.date),
      startTime: existing.startTime,
      endTime: existing.endTime,
      location,
      cancelled: true,
    });
  }

  return NextResponse.json({ ok: true });
}
