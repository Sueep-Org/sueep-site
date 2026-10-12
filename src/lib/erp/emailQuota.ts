/**
 * Where we stand on the email provider's daily quota (Resend free plan:
 * 100 a day). Resend counts every To, CC and BCC address as one email, and
 * its day is a UTC calendar day, so it resets at midnight UTC (8pm Eastern
 * in summer, 7pm in winter). Counted from the Email Log, which every send
 * from this app goes through.
 */

import { prisma } from "@/lib/prisma";

export const DAILY_EMAIL_LIMIT = 100;
/** Hand-written project emails stop here, leaving room for the automatic
 * ones later in the day (the turnover digest to property managers, etc.). */
export const PROJECT_MESSAGE_CUTOFF = 90;

export type EmailQuota = { used: number; limit: number; cutoff: number; resetsAt: string };

export async function loadEmailQuota(now: Date = new Date()): Promise<EmailQuota> {
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const rows = await prisma.emailLog.findMany({
    where: { status: "SENT", createdAt: { gte: dayStart } },
    select: { to: true, cc: true, bcc: true },
  });
  return {
    used: rows.reduce((n, r) => n + r.to.length + r.cc.length + r.bcc.length, 0),
    limit: DAILY_EMAIL_LIMIT,
    cutoff: PROJECT_MESSAGE_CUTOFF,
    resetsAt: new Date(dayStart.getTime() + 86_400_000).toISOString(),
  };
}
