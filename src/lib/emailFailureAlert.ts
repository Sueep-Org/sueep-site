/**
 * Morning heads-up to Admins listing emails that failed in the last day.
 * Nothing is sent when nothing failed. Its own failures are left out so a
 * broken email setup doesn't keep reporting itself.
 */

import { prisma } from "@/lib/prisma";
import { buildEmailFailuresEmail, sendEmail } from "@/lib/email";
import { NOTIFICATIONS, isEmailType } from "@/lib/notificationTypes";
import { getNotificationSetting } from "@/lib/notificationSettings";

/** Listed in full up to this many; the email links to the log for the rest. */
const MAX_LISTED = 25;

export async function sendEmailFailureAlert(now: Date = new Date()) {
  const since = new Date(now.getTime() - 86_400_000);
  const failures = await prisma.emailLog.findMany({
    where: { status: "FAILED", createdAt: { gte: since }, type: { not: "EMAIL_FAILURES" } },
    orderBy: { createdAt: "desc" },
    select: { id: true, type: true, to: true, subject: true, error: true },
  });
  if (!failures.length) return { sent: false, failures: 0 };

  const admins = await prisma.erpUser.findMany({ where: { role: "ADMIN" }, select: { email: true } });
  const also = (await getNotificationSetting("EMAIL_FAILURES")).to;
  const recipients = Array.from(new Set([...admins.map((a) => a.email.toLowerCase()), ...also]));
  if (!recipients.length) return { sent: false, failures: failures.length };

  const base = (process.env.NEXT_PUBLIC_APP_URL?.trim() || "").replace(/\/$/, "");
  const html = buildEmailFailuresEmail({
    logUrl: `${base}/erp/notifications/log?status=FAILED`,
    failures: failures.slice(0, MAX_LISTED).map((f) => ({
      label: isEmailType(f.type) ? NOTIFICATIONS[f.type].label : f.type,
      to: f.to.join(", "),
      subject: f.subject,
      error: f.error ?? "Unknown error",
      url: `${base}/erp/notifications/log/${f.id}`,
    })),
  });
  const n = failures.length;
  await sendEmail({
    type: "EMAIL_FAILURES",
    link: "/erp/notifications/log?status=FAILED",
    to: recipients,
    subject: `${n} email${n === 1 ? "" : "s"} failed to send yesterday`,
    html,
  });
  return { sent: true, failures: n };
}
