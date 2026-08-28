import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dayKey } from "@/lib/erp/schedule";
import { resolveWorkerContact, sendDayInvite } from "@/lib/erp/scheduleInvites";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;

  const existing = await prisma.changeOrderWorkerDayAssignment.findUnique({
    where: { id },
    select: {
      date: true,
      employeeId: true,
      contractorId: true,
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
    },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.changeOrderWorkerDayAssignment.delete({ where: { id } }).catch(() => {});

  const contact = await resolveWorkerContact(existing.employeeId, existing.contractorId);
  if (contact) {
    const location =
      existing.changeOrder.project.building?.address || existing.changeOrder.project.workOrderRecord?.siteAddress || undefined;
    await sendDayInvite({
      uid: `co-worker-assignment-${id}@sueep.com`,
      to: contact.email,
      attendeeName: contact.name,
      role: "Working",
      title: `${existing.changeOrder.title} (${existing.changeOrder.project.jobTitle})`,
      dateKey: dayKey(existing.date),
      location,
      cancelled: true,
    });
  }

  return NextResponse.json({ ok: true });
}
