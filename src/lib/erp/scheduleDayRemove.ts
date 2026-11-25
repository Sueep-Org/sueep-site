/**
 * Takes one planned project day off the calendar: cancels the supervisor's,
 * the sub's and the crew's invites, voids a next day surcharge made for it,
 * deletes the day and its planned workers, and re-syncs sub pay. Any reason
 * but MISTAKE leaves a grayed-out ScheduleDayRemoval with the note.
 * Used by the Remove day dialog and by voiding a job (its upcoming days).
 */
import { prisma } from "@/lib/prisma";
import { dayKey } from "@/lib/erp/schedule";
import { notifyProjectCrew, sendDayInvite, sendSubLeadInvite } from "@/lib/erp/scheduleInvites";
import { syncScheduleSubPay } from "@/lib/erp/subPay";
import { voidNextDaySurcharges } from "@/lib/erp/nextDaySurcharge";
import { JOB_VOIDED_REMOVAL } from "@/lib/erp/scheduleRemovals";

/** Name shown on the calendar for a person: their Employee name by email, else the part before the @. */
export async function personName(email: string | null | undefined): Promise<string | null> {
  if (!email) return null;
  const emp = await prisma.employee.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { firstName: true, lastName: true },
  });
  return (emp ? `${emp.firstName} ${emp.lastName}`.trim() : "") || email.split("@")[0]!;
}

type RemovalRow = { id: string; note: string | null; coveredBy: string | null; removedByName: string | null };

export async function removeProjectDay(
  id: string,
  opts: { reason: string | null; note: string | null; removedByName: string | null; syncSubPay?: boolean },
): Promise<{ removal: RemovalRow | null } | null> {
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
  if (!existing) return null;

  let removal: RemovalRow | null = null;
  if (opts.reason && opts.reason !== "MISTAKE") {
    const coveredBy =
      (await personName(existing.supervisorUser?.email)) ??
      (await personName(existing.projectManager?.email)) ??
      existing.supervisorContractor?.name ??
      null;
    removal = await prisma.scheduleDayRemoval.create({
      data: {
        projectId: existing.projectId,
        date: existing.date,
        reason: opts.reason,
        note: opts.note,
        coveredBy,
        removedByName: opts.removedByName,
        dayComment: existing.comment,
        dayInternalNote: existing.internalNote,
      },
      select: { id: true, note: true, coveredBy: true, removedByName: true },
    });
  }

  const location = existing.project.building?.address || existing.project.workOrderRecord?.siteAddress || undefined;

  // Crew cancellations need the still-live rows (fetched before the
  // transaction below wipes them). Removing the planned supervisor event
  // also clears any planned workers for that same project/day, they were
  // only ever assigned in the context of this event.
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
  if (opts.syncSubPay !== false) await syncScheduleSubPay(existing.projectId);

  // Cancels the invite sent when this assignment was created, reusing the
  // same UID so calendar apps remove the right event. No invite went out for
  // a PM-only assignment.
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

  return { removal };
}

/**
 * A voided job's days after today come off the calendar the same way, so
 * nobody is invited to show up. Each leaves a gray "Job voided" day with the
 * void reason. Today and past days stay (drawn gray as voided). Returns how
 * many days were cancelled.
 */
export async function cancelUpcomingDaysOfVoidedJob(projectId: string, voidReason: string, removedByName: string | null, today: Date): Promise<number> {
  const upcoming = await prisma.projectDayAssignment.findMany({ where: { projectId, date: { gt: today } }, select: { id: true } });
  for (const d of upcoming) {
    await removeProjectDay(d.id, { reason: JOB_VOIDED_REMOVAL, note: voidReason, removedByName, syncSubPay: false });
  }
  if (upcoming.length) await syncScheduleSubPay(projectId);
  return upcoming.length;
}

/**
 * After a job may have been voided somewhere else (Billing status on the
 * project, the unit, or its last open SOV line): if it's Voided now, its days
 * after today are cancelled the same way. Never throws, a failed cancel
 * shouldn't undo the void.
 */
export async function cancelDaysIfJobVoided(projectId: string, byEmail: string | null | undefined): Promise<void> {
  try {
    const p = await prisma.project.findUnique({ where: { id: projectId }, select: { billingStatus: true, voidReason: true } });
    if (p?.billingStatus !== "VOIDED") return;
    const { todayEasternAsUtcMidnight } = await import("@/lib/erp/dates");
    await cancelUpcomingDaysOfVoidedJob(projectId, p.voidReason || "Voided", await personName(byEmail), todayEasternAsUtcMidnight());
  } catch (e) {
    console.error("Cancelling a voided job's days failed", { projectId }, e);
  }
}
