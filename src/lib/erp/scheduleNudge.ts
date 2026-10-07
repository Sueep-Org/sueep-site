import { prisma } from "@/lib/prisma";
import { todayEasternAsUtcMidnight } from "@/lib/erp/dates";
import { deriveProjectLifecycle, hasActiveChangeOrder } from "@/lib/erp/projectLifecycle";
import { getDescLine } from "@/lib/erp/descLine";
import { findEmployeeEmailByName } from "@/lib/erp/createLaborEntry";
import { sendEmail, buildScheduleNudgeEmail } from "@/lib/email";
import { getBackupPms } from "@/lib/notificationSettings";

export type ScheduleNudgeProject = { id: string; jobTitle: string; pmName: string | null };

function todayWindow() {
  const start = todayEasternAsUtcMidnight();
  const end = new Date(start);
  end.setUTCHours(23, 59, 59, 999);
  return { start, end };
}

/** ACTIVE (WIP) projects with no ProjectDayAssignment covering a supervisor
 * or PM, no LaborEntry, and no covering change-order date range for today.
 * A bare ProjectWorkerDayAssignment (workers planned but no supervisor/PM
 * day-assignment) does NOT count as scheduled here — same rule the
 * calendar's own "needs a supervisor" chip uses; treating it as sufficient
 * used to let an unsupervised day silently suppress the nudge. */
export async function getUnscheduledActiveProjectsToday(): Promise<ScheduleNudgeProject[]> {
  const { start, end } = todayWindow();

  const [projects, dayAssignments, laborToday, soloWorkersToday] = await Promise.all([
    prisma.project.findMany({
      select: {
        id: true,
        jobTitle: true,
        status: true,
        projectDate: true,
        supervisor: true,
        description: true,
        changeOrders: { select: { status: true, startDate: true, endDate: true } },
      },
    }),
    prisma.projectDayAssignment.findMany({
      where: { date: { gte: start, lte: end } },
      select: {
        projectId: true,
        supervisorUserId: true,
        projectManagerUserId: true,
        supervisorContractor: { select: { runsWithoutSupervisor: true } },
      },
    }),
    prisma.laborEntry.findMany({ where: { workDate: { gte: start, lte: end } }, select: { projectId: true } }),
    // A sub who runs jobs without a supervisor (Contractor.runsWithoutSupervisor)
    // planned on the job today is in charge on site, so it counts as scheduled.
    prisma.projectWorkerDayAssignment.findMany({
      where: { date: { gte: start, lte: end }, contractor: { runsWithoutSupervisor: true } },
      select: { projectId: true },
    }),
  ]);

  const scheduledIds = new Set([
    // A day assignment covered by a supervisor OR a PM-only day (see the
    // schema's ProjectDayAssignment.projectManagerUserId comment — a real,
    // intentional case) counts as scheduled; a bare worker-only day does
    // not, unless that worker is a sub who runs jobs without a supervisor.
    ...dayAssignments
      .filter((d) => d.supervisorUserId || d.projectManagerUserId || d.supervisorContractor?.runsWithoutSupervisor)
      .map((d) => d.projectId),
    ...laborToday.map((r) => r.projectId),
    ...soloWorkersToday.map((r) => r.projectId),
  ]);

  // A qualifying (non-VOID/REJECTED) change order whose own date range
  // covers today counts as "scheduled" too — a CO's work can be underway
  // on a day the base project isn't otherwise touched.
  const coScheduledToday = (p: (typeof projects)[number]) =>
    p.changeOrders.some((co) => {
      if (co.status === "VOID" || co.status === "REJECTED") return false;
      if (!co.startDate) return false;
      const coStart = co.startDate.getTime();
      const coEnd = (co.endDate ?? co.startDate).getTime();
      return coStart <= end.getTime() && coEnd >= start.getTime();
    });

  return projects
    .filter((p) => deriveProjectLifecycle(p.status, p.projectDate?.toISOString() ?? null, hasActiveChangeOrder(p.changeOrders)) === "ACTIVE")
    .filter((p) => !scheduledIds.has(p.id) && !coScheduledToday(p))
    .map((p) => ({
      id: p.id,
      jobTitle: p.jobTitle,
      // Project.supervisor holds the PM's name (the "PM" column on the
      // projects table), or older projects have a "SUEEP PM:" description line.
      pmName: p.supervisor?.trim() || getDescLine(p.description, "SUEEP PM") || null,
    }))
    .sort((a, b) => a.jobTitle.localeCompare(b.jobTitle));
}

/** Emails each PM the still-unscheduled ACTIVE projects they manage today.
 * Projects whose PM can't be matched to an employee email go to the backup
 * PMs. Nobody is emailed when nothing is left unscheduled. */
export async function sendScheduleNudgeEmails(
  cadence: "morning" | "midday",
): Promise<{ sent: boolean; recipientCount: number; projectCount: number }> {
  const projects = await getUnscheduledActiveProjectsToday();
  if (projects.length === 0) return { sent: false, recipientCount: 0, projectCount: 0 };

  const emailByName = new Map<string, string | null>();
  const byRecipient = new Map<string, ScheduleNudgeProject[]>();
  const backupPms = await getBackupPms();
  for (const p of projects) {
    let email: string | null = null;
    if (p.pmName) {
      const key = p.pmName.toLowerCase();
      if (!emailByName.has(key)) emailByName.set(key, await findEmployeeEmailByName(p.pmName));
      email = emailByName.get(key) ?? null;
    }
    for (const to of email ? [email] : backupPms) {
      const k = to.toLowerCase();
      byRecipient.set(k, [...(byRecipient.get(k) ?? []), p]);
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "";
  const scheduleUrl = appUrl ? `${appUrl}/erp/schedule` : "/erp/schedule";
  const type = cadence === "morning" ? "SCHEDULE_NUDGE_MORNING" : "SCHEDULE_NUDGE_MIDDAY";

  await Promise.allSettled(
    Array.from(byRecipient, ([to, own]) => {
      const n = own.length;
      const subject =
        cadence === "morning"
          ? `Morning check: ${n} of your project${n === 1 ? "" : "s"} not yet scheduled today`
          : `Midday check: ${n} of your project${n === 1 ? "" : "s"} still not scheduled today`;
      const html = buildScheduleNudgeEmail({ cadence, projects: own, scheduleUrl });
      return sendEmail({ type, link: "/erp/schedule", to, subject, html });
    }),
  );

  return { sent: true, recipientCount: byRecipient.size, projectCount: projects.length };
}
