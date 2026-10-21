import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dayKey } from "@/lib/erp/schedule";
import { notifyProjectCrew, sendDayInvite, sendSubLeadInvite } from "@/lib/erp/scheduleInvites";
import { isScheduleRemovalReason } from "@/lib/erp/scheduleRemovals";
import { getErpAuth } from "@/lib/erpAuth";

type Ctx = { params: Promise<{ id: string }> };

// Name shown on the calendar for a person, same rule as the schedule page
// (their Employee name by email, else the part before the @).
async function personName(email: string | null | undefined): Promise<string | null> {
  if (!email) return null;
  const emp = await prisma.employee.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { firstName: true, lastName: true },
  });
  return (emp ? `${emp.firstName} ${emp.lastName}`.trim() : "") || email.split("@")[0]!;
}

export async function DELETE(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;

  // Optional { reason, note }. Any reason except MISTAKE leaves a grayed-out
  // ScheduleDayRemoval on the calendar; no body (older callers) or MISTAKE
  // just deletes like before.
  const body = (await req.json().catch(() => null)) as { reason?: unknown; note?: unknown } | null;
  const reason = isScheduleRemovalReason(body?.reason) ? body.reason : null;
  const note = typeof body?.note === "string" && body.note.trim() ? body.note.trim().slice(0, 500) : null;

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
      projectManager: { select: { email: true } },
      supervisorContractor: { select: { name: true } },
    },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let removal: { id: string } | null = null;
  if (reason && reason !== "MISTAKE") {
    const auth = await getErpAuth();
    const coveredBy =
      (await personName(existing.supervisorUser?.email)) ??
      (await personName(existing.projectManager?.email)) ??
      existing.supervisorContractor?.name ??
      null;
    removal = await prisma.scheduleDayRemoval.create({
      data: {
        projectId: existing.projectId,
        date: existing.date,
        reason,
        note,
        coveredBy,
        removedByName: await personName(auth?.email),
      },
    });
  }

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
  // A sub who was running the day gets a cancellation too (sendSubLeadInvite only cancels one that was sent).
  if (existing.supervisorContractorId) {
    await sendSubLeadInvite({
      kind: "day",
      assignmentId: id,
      contractorId: existing.supervisorContractorId,
      title: existing.project.jobTitle,
      dateKey: dayKey(existing.date),
      startTime: existing.startTime,
      endTime: existing.endTime,
      location,
      cancelled: true,
    });
  }

  return NextResponse.json({ ok: true, removal });
}
