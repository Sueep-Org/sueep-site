/**
 * Daily lien alert email. A job is included the first morning it reaches
 * the day to decide on a lien, and again the first morning a required
 * notice comes due. Each stage is announced once per job (lienAlertedStage),
 * and a job someone marked Not pursuing or Lien filed is left out. Goes to
 * every Admin and Project Manager.
 */

import { prisma } from "@/lib/prisma";
import { PM_LEVEL_ROLES } from "@/lib/erpRoles";
import { buildLienAlertEmail, sendEmail } from "@/lib/email";
import { LIEN_STAGE_RANK, formatLienDay, lienDecisionCloses, lienPillLabel, type LienStage } from "./lienDeadline";
import { loadLienWatch, type LienWatchRow } from "./lienWatch";

/** The stages worth an email. Past due alone isn't: it's on the Billing page. */
const ALERT_STAGES: LienStage[] = ["DECIDE_NOW", "NOTICE_DUE"];

/** Jobs that reached an alert stage they haven't been emailed about yet. */
export function lienAlertsDue(rows: LienWatchRow[]): LienWatchRow[] {
  return rows.filter((r) => {
    if (!r.deadline || !r.readiness || lienDecisionCloses(r.decision?.value)) return false;
    const stage = r.readiness.stage;
    if (!ALERT_STAGES.includes(stage)) return false;
    const already = r.alertedStage && r.alertedStage in LIEN_STAGE_RANK ? LIEN_STAGE_RANK[r.alertedStage as LienStage] : Infinity;
    return LIEN_STAGE_RANK[stage] < already;
  });
}

function money(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export async function sendLienAlerts(): Promise<{ sent: number; jobs: number }> {
  const due = lienAlertsDue(await loadLienWatch());
  if (!due.length) return { sent: 0, jobs: 0 };

  const recipients = await prisma.erpUser.findMany({ where: { role: { in: [...PM_LEVEL_ROLES] } }, select: { email: true } });
  if (!recipients.length) return { sent: 0, jobs: due.length };

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL?.trim() || "").replace(/\/$/, "");
  const html = buildLienAlertEmail({
    billingUrl: `${appUrl}/erp/billing`,
    items: due.map((r) => {
      const d = r.deadline!;
      const detail = [`${money(r.unpaidCents)} unpaid.`, `File by ${formatLienDay(d.deadlineKey)}.`];
      if (d.noticeLabel && d.noticeByKey && !r.noticeSentKey) detail.push(`${d.noticeLabel} due by ${formatLienDay(d.noticeByKey)}.`);
      if (r.readiness!.daysOverdue != null) detail.push(`Oldest invoice ${r.readiness!.daysOverdue}d past due.`);
      return {
        jobTitle: r.jobTitle,
        headline: lienPillLabel(d, r.readiness!),
        detail: detail.join(" "),
        url: `${appUrl}/erp/projects/${r.projectId}?tab=Liens`,
      };
    }),
  });
  const subject = due.length === 1 ? `Lien step coming up: ${due[0].jobTitle}` : `Lien steps coming up on ${due.length} jobs`;
  const results = await Promise.allSettled(recipients.map((r) => sendEmail({ type: "LIEN_ALERTS", link: "/erp/billing", to: r.email, subject, html })));
  const delivered = results.filter((r) => r.status === "fulfilled" && r.value === "SENT").length;

  // Remember the stage whether or not the email is switched on, so turning
  // it on later doesn't send a backlog of stale alerts.
  for (const r of due) {
    await prisma.project.update({ where: { id: r.projectId }, data: { lienAlertedStage: r.readiness!.stage } });
  }
  return { sent: delivered, jobs: due.length };
}
