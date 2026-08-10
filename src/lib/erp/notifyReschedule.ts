import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { getDescLine } from "@/lib/erp/descLine";
import { findEmployeeEmailByName } from "@/lib/erp/createLaborEntry";

// David Rodriguez, Project Manager (david@sueep.com) — stopgap recipient when
// a rescheduled project has no day-assignment-level PM and its freeform
// Project.supervisor name doesn't resolve to a real employee. Project has no
// reliable, always-populated "project manager" relation to fall back on
// otherwise (supervisorUserId is the *supervisor*, not a PM).
const FALLBACK_PM_EMAIL = "david@sueep.com";

function dateKeyLabel(dateKey: string): string {
  return new Date(`${dateKey}T00:00:00.000Z`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Emails the project's supervisor and PM whenever a project's schedule
 * changes — same idea as the "you're assigned" invite sent on day-assignment
 * creation, but for the reschedule case, and covering both recipients.
 *
 * PM resolution has no single source of truth: a day-assignment can name a
 * PM explicitly (dayAssignmentPmUserId), but a plain project-level date move
 * (e.g. dragging the "needs supervisor" chip) has no day assignment to read
 * from. In that case, this falls back to matching Project.supervisor (a
 * freeform "Project Manager" name, not a foreign key) — or, for older
 * projects that predate that field, a "SUEEP PM:" line in the description —
 * against an Employee record via the same findEmployeeEmailByName lookup
 * every other PM-resolution chain uses (createLaborEntry.ts), and finally
 * to FALLBACK_PM_EMAIL if that doesn't resolve either — a reschedule should
 * always reach *someone* who can act on it.
 */
export async function notifyProjectRescheduled(params: {
  projectId: string;
  jobTitle: string;
  oldDateKey: string | null;
  newDateKey: string;
  supervisorUserId: string | null;
  /** Set only when this reschedule is a specific day-assignment moving. */
  dayAssignmentPmUserId?: string | null;
  /** Project.supervisor — the freeform "Project Manager" name field. */
  projectManagerName?: string | null;
  /** Project.description — read for a legacy "SUEEP PM:" line when
   * projectManagerName isn't set. */
  projectDescription?: string | null;
}): Promise<void> {
  const {
    projectId,
    jobTitle,
    oldDateKey,
    newDateKey,
    supervisorUserId,
    dayAssignmentPmUserId,
    projectManagerName,
    projectDescription,
  } = params;

  const recipients = new Map<string, string>();

  if (supervisorUserId) {
    const supervisor = await prisma.erpUser.findUnique({ where: { id: supervisorUserId }, select: { email: true } });
    if (supervisor?.email) recipients.set(supervisor.email.toLowerCase(), supervisor.email);
  }

  if (dayAssignmentPmUserId) {
    const pm = await prisma.erpUser.findUnique({ where: { id: dayAssignmentPmUserId }, select: { email: true } });
    if (pm?.email) recipients.set(pm.email.toLowerCase(), pm.email);
  } else {
    const pmName = projectManagerName?.trim() || getDescLine(projectDescription ?? null, "SUEEP PM");
    const resolvedPmEmail = pmName ? await findEmployeeEmailByName(pmName) : null;
    const fallbackEmail = resolvedPmEmail ?? FALLBACK_PM_EMAIL;
    recipients.set(fallbackEmail.toLowerCase(), fallbackEmail);
  }

  if (recipients.size === 0) return;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "";
  const projectUrl = appUrl ? `${appUrl}/erp/projects/${projectId}` : undefined;
  const oldLabel = oldDateKey ? dateKeyLabel(oldDateKey) : "unscheduled";
  const newLabel = dateKeyLabel(newDateKey);

  await Promise.all(
    [...recipients.values()].map((email) =>
      sendEmail({
        to: email,
        subject: `Rescheduled: ${jobTitle} — now ${newLabel}`,
        html: [
          `<p><strong>${jobTitle}</strong> was moved from ${oldLabel} to <strong>${newLabel}</strong>.</p>`,
          projectUrl ? `<p><a href="${projectUrl}">View project</a></p>` : "",
        ].join(""),
      }).catch((e) => console.error("Failed to send reschedule notification", e)),
    ),
  );
}
