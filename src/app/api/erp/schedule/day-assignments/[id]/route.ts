import { NextResponse } from "next/server";
import { scheduleEditForbidden } from "@/lib/erp/scheduleAccess";
import { prisma } from "@/lib/prisma";
import { dayKey } from "@/lib/erp/schedule";
import { notifyProjectCrew, sendDayInvite, sendSubLeadInvite } from "@/lib/erp/scheduleInvites";
import { isScheduleRemovalReason } from "@/lib/erp/scheduleRemovals";
import { loadAppLists } from "@/lib/erp/appListsServer";
import { getErpAuth } from "@/lib/erpAuth";
import { syncScheduleSubPay } from "@/lib/erp/subPay";
import { voidNextDaySurcharges } from "@/lib/erp/nextDaySurcharge";
import { normalizeBillingStatus } from "@/lib/erp/billingStatus";
import { listLabel } from "@/lib/erp/appLists";
import { syncProjectBillingFromRequest } from "@/lib/sovSync";

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
  const forbidden = await scheduleEditForbidden();
  if (forbidden) return forbidden;
  const { id } = await ctx.params;

  // Optional { reason, note, voidJob }. Any reason except MISTAKE leaves a grayed-out
  // ScheduleDayRemoval on the calendar; no body (older callers) or MISTAKE
  // just deletes like before. voidJob also voids the whole job when this was
  // its last day on the calendar (see voidJobAfterLastDay below).
  const body = (await req.json().catch(() => null)) as { reason?: unknown; note?: unknown; voidJob?: unknown } | null;
  const removalReasons = (await loadAppLists()).removalReasons;
  const reason = isScheduleRemovalReason(body?.reason, removalReasons) ? body.reason : null;
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

  // A next day surcharge made for this day shouldn't stay on Billing.
  await voidNextDaySurcharges(id).catch((e) => console.error("Voiding next day surcharge failed", { id }, e));
  await prisma.$transaction([
    prisma.projectDayAssignment.delete({ where: { id } }),
    prisma.projectWorkerDayAssignment.deleteMany({ where: { projectId: existing.projectId, date: existing.date } }),
  ]);
  // A sub with no days left on the job loses the pay set on the calendar.
  await syncScheduleSubPay(existing.projectId);

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

  const voided =
    body?.voidJob === true && reason && reason !== "MISTAKE"
      ? await voidJobAfterLastDay(existing.projectId, note ?? listLabel(removalReasons, reason))
      : null;

  return NextResponse.json({ ok: true, removal, voided });
}

/**
 * Voids the job (billing status Voided) when it has no days left on the
 * calendar, asked for from the Remove day dialog. A turnover unit voids its
 * turnover request too, which carries it to the project, same as voiding it
 * on the turnover request. A job already billed or paid is left alone.
 */
async function voidJobAfterLastDay(projectId: string, voidReason: string): Promise<{ ok: boolean; message: string }> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { billingStatus: true, turnoverRequestId: true, _count: { select: { dayAssignments: true } } },
  });
  if (!project) return { ok: false, message: "Job not found" };
  if (project._count.dayAssignments > 0) return { ok: false, message: "Job still has other days on the calendar, not voided" };
  const status = normalizeBillingStatus(project.billingStatus);
  if (status === "VOIDED") return { ok: true, message: "Job was already voided" };
  if (status !== "NOT_BILLED") return { ok: false, message: "Job is already billed or paid, not voided. Change it on the project if needed." };

  if (project.turnoverRequestId) {
    await prisma.turnoverRequest.update({ where: { id: project.turnoverRequestId }, data: { billingStatus: "VOIDED", voidReason } });
    await syncProjectBillingFromRequest(project.turnoverRequestId, "VOIDED", null, voidReason);
  } else {
    await prisma.project.update({ where: { id: projectId }, data: { billingStatus: "VOIDED", voidReason } });
  }
  return { ok: true, message: "Job voided" };
}
