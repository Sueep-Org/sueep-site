import { prisma } from "@/lib/prisma";
import { todayEasternAsUtcMidnight } from "@/lib/erp/dates";
import { deriveProjectLifecycle, hasActiveChangeOrder } from "@/lib/erp/projectLifecycle";
import { sendEmail, buildScheduleNudgeEmail } from "@/lib/email";

export type ScheduleNudgeProject = { id: string; jobTitle: string };

function todayWindow() {
  const start = todayEasternAsUtcMidnight();
  const end = new Date(start);
  end.setUTCHours(23, 59, 59, 999);
  return { start, end };
}

/** ACTIVE (WIP) projects with no ProjectDayAssignment, ProjectWorkerDayAssignment,
 * or LaborEntry dated today, and no "not today" dismissal for today — the same
 * "is this project scheduled today" signal the dashboard's "Where we are" card
 * uses, just inverted and joined against the ACTIVE-lifecycle set. */
export async function getUnscheduledActiveProjectsToday(): Promise<ScheduleNudgeProject[]> {
  const { start, end } = todayWindow();

  const [projects, dayAssignments, workerAssignments, laborToday, dismissals] = await Promise.all([
    prisma.project.findMany({
      select: { id: true, jobTitle: true, status: true, projectDate: true, changeOrders: { select: { status: true } } },
    }),
    prisma.projectDayAssignment.findMany({ where: { date: { gte: start, lte: end } }, select: { projectId: true } }),
    prisma.projectWorkerDayAssignment.findMany({ where: { date: { gte: start, lte: end } }, select: { projectId: true } }),
    prisma.laborEntry.findMany({ where: { workDate: { gte: start, lte: end } }, select: { projectId: true } }),
    prisma.projectScheduleNudgeDismissal.findMany({ where: { date: start }, select: { projectId: true } }),
  ]);

  const scheduledIds = new Set([...dayAssignments, ...workerAssignments, ...laborToday].map((r) => r.projectId));
  const dismissedIds = new Set(dismissals.map((d) => d.projectId));

  return projects
    .filter((p) => deriveProjectLifecycle(p.status, p.projectDate?.toISOString() ?? null, hasActiveChangeOrder(p.changeOrders)) === "ACTIVE")
    .filter((p) => !scheduledIds.has(p.id) && !dismissedIds.has(p.id))
    .map((p) => ({ id: p.id, jobTitle: p.jobTitle }))
    .sort((a, b) => a.jobTitle.localeCompare(b.jobTitle));
}

export async function dismissProjectForToday(
  projectId: string,
  dismissedByUserId: string | null,
): Promise<{ ok: true } | { ok: false; error: "not_found" }> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) return { ok: false, error: "not_found" };

  const { start: date } = todayWindow();
  await prisma.projectScheduleNudgeDismissal.upsert({
    where: { projectId_date: { projectId, date } },
    create: { projectId, date, dismissedByUserId },
    update: { dismissedByUserId },
  });
  return { ok: true };
}

/** Emails every PROJECT_MANAGER-role ErpUser the list of still-unscheduled
 * ACTIVE projects for today — skipped entirely (no recipients queried, no
 * email sent) once nothing is left unscheduled, so this never sends an
 * empty "all clear" email. */
export async function sendScheduleNudgeEmails(
  cadence: "morning" | "midday",
): Promise<{ sent: boolean; recipientCount: number; projectCount: number }> {
  const projects = await getUnscheduledActiveProjectsToday();
  if (projects.length === 0) return { sent: false, recipientCount: 0, projectCount: 0 };

  const recipients = await prisma.erpUser.findMany({
    where: { role: "PROJECT_MANAGER" },
    select: { id: true, email: true },
  });
  if (recipients.length === 0) return { sent: false, recipientCount: 0, projectCount: projects.length };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "";
  const scheduleUrl = appUrl ? `${appUrl}/erp/schedule` : "/erp/schedule";
  const html = buildScheduleNudgeEmail({ cadence, projects, scheduleUrl });
  const subject =
    cadence === "morning"
      ? `Morning check: ${projects.length} project${projects.length === 1 ? "" : "s"} not yet scheduled today`
      : `Midday check: ${projects.length} project${projects.length === 1 ? "" : "s"} still not scheduled today`;

  await Promise.allSettled(recipients.map((r) => sendEmail({ to: r.email, subject, html })));

  return { sent: true, recipientCount: recipients.length, projectCount: projects.length };
}
