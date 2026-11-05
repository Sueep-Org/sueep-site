/**
 * Billing cutoffs (DEALS_BILLING_PLAN Phase 6): the day of the month a GC
 * wants pay apps or invoices by. Comes from the client company's cutoff day,
 * or the job's own when it differs (Project.billingCutoffDay).
 *
 * - Calendar: each active job's cutoff on the Management calendar.
 * - Reminder: REMIND_DAYS before, the job's PM gets an email to update
 *   percent complete (billingCutoffReminders.ts).
 * - Missed: past this month's cutoff with no invoice for the job dated this
 *   month (linked HubSpot invoice or an ERP draft). Shown on the Money tab.
 */
import { prisma } from "@/lib/prisma";
import { todayEasternKey, utcDateKey } from "./dates";
import { addDaysKey } from "./manualHoursRepeat";
import { findEmployeeEmailByName } from "./createLaborEntry";
import { getBackupPms } from "@/lib/notificationSettings";
import { escapeHtml, sendEmail } from "@/lib/email";

export const REMIND_DAYS = 5;

export type CutoffJob = {
  projectId: string;
  jobTitle: string;
  pmName: string | null;
  companyId: string | null;
  companyName: string | null;
  cutoffDay: number;
  /** Where the day came from */
  fromProject: boolean;
};

/** The cutoff day in that month, pulled back when the month is short. */
export function cutoffKey(year: number, monthIndex: number, day: number): string {
  const last = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return utcDateKey(new Date(Date.UTC(year, monthIndex, Math.min(day, last))));
}

/** Active post-construction jobs that have a cutoff day (their own, or their client company's). */
export async function loadCutoffJobs(): Promise<CutoffJob[]> {
  const projects = await prisma.project.findMany({
    where: {
      status: "ACTIVE",
      turnoverRequestId: null,
      recurringContractPeriodId: null,
      OR: [{ billingCutoffDay: { not: null } }, { clientCompany: { billingCutoffDay: { not: null } } }],
    },
    select: { id: true, jobTitle: true, supervisor: true, billingCutoffDay: true, clientCompany: { select: { id: true, name: true, billingCutoffDay: true } } },
    orderBy: { jobTitle: "asc" },
  });
  return projects.map((p) => ({
    projectId: p.id,
    jobTitle: p.jobTitle,
    pmName: p.supervisor?.trim() || null,
    companyId: p.clientCompany?.id ?? null,
    companyName: p.clientCompany?.name ?? null,
    cutoffDay: (p.billingCutoffDay ?? p.clientCompany?.billingCutoffDay)!,
    fromProject: p.billingCutoffDay != null,
  }));
}

/** Each job's cutoff dates between two days (inclusive). */
export function cutoffsBetween(jobs: CutoffJob[], startKey: string, endKey: string): { job: CutoffJob; day: string }[] {
  const out: { job: CutoffJob; day: string }[] = [];
  const [sy, sm] = startKey.split("-").map(Number) as [number, number];
  const [ey, em] = endKey.split("-").map(Number) as [number, number];
  for (let y = sy, m = sm - 1; y < ey || (y === ey && m <= em - 1); m === 11 ? ((y += 1), (m = 0)) : (m += 1)) {
    for (const job of jobs) {
      const day = cutoffKey(y, m, job.cutoffDay);
      if (day >= startKey && day <= endKey) out.push({ job, day });
    }
  }
  return out.sort((a, b) => a.day.localeCompare(b.day) || a.job.jobTitle.localeCompare(b.job.jobTitle));
}

export type CutoffStatus = { job: CutoffJob; day: string; state: "MISSED" | "BILLED" | "UPCOMING" };

/**
 * This month's cutoff for each job and where it stands. Billed = an invoice
 * for the job dated this month (linked in the ERP), or an ERP draft made
 * this month. Missed = cutoff passed and not billed.
 */
export async function loadCutoffStatus(todayKey: string = todayEasternKey()): Promise<CutoffStatus[]> {
  const jobs = await loadCutoffJobs();
  if (!jobs.length) return [];
  const [y, m] = todayKey.split("-").map(Number) as [number, number];
  const monthStart = new Date(Date.UTC(y, m - 1, 1));
  const ids = jobs.map((j) => j.projectId);
  const [invoices, drafts] = await Promise.all([
    prisma.hubSpotSovInvoice.findMany({
      where: { projectId: { in: ids }, invoiceDate: { gte: monthStart }, status: { not: "voided" } },
      select: { projectId: true },
      distinct: ["projectId"],
    }),
    prisma.itemInvoiceDraft.findMany({
      where: { groupType: "PROJECT", groupId: { in: ids }, createdAt: { gte: monthStart }, status: { in: ["DRAFT", "APPROVED"] } },
      select: { groupId: true },
    }),
  ]);
  const billed = new Set([...invoices.map((i) => i.projectId), ...drafts.map((d) => d.groupId)]);
  return jobs.map((job) => {
    const day = cutoffKey(y, m - 1, job.cutoffDay);
    const state = billed.has(job.projectId) ? "BILLED" : day < todayKey ? "MISSED" : "UPCOMING";
    return { job, day, state };
  });
}

/** Jobs whose cutoff is exactly REMIND_DAYS from today (this month or next), for the PM reminder. */
export async function loadCutoffsToRemind(todayKey: string = todayEasternKey()): Promise<{ job: CutoffJob; day: string }[]> {
  const target = addDaysKey(todayKey, REMIND_DAYS);
  return cutoffsBetween(await loadCutoffJobs(), target, target);
}

// ── PM reminder email ───────────────────────────────────────────────────────

/**
 * REMIND_DAYS before a job's cutoff, emails the job's PM (matched to their
 * employee email by name, backup PMs when there's no match) the jobs to
 * update percent complete on. Runs in the daily management-reminders cron;
 * the exact-day match means one email per job per month.
 */
export async function sendBillingCutoffReminders(todayKey: string = todayEasternKey()): Promise<{ sent: number; jobs: number }> {
  const due = await loadCutoffsToRemind(todayKey);
  if (!due.length) return { sent: 0, jobs: 0 };
  const backup = await getBackupPms();
  const byEmail = new Map<string, typeof due>();
  for (const d of due) {
    const pm = d.job.pmName ? await findEmployeeEmailByName(d.job.pmName) : null;
    for (const to of pm ? [pm] : backup) byEmail.set(to, [...(byEmail.get(to) ?? []), d]);
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "";
  const day = (k: string) => new Date(`${k}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
  let sent = 0;
  for (const [to, list] of byEmail) {
    const rows = list
      .map((d) => `<li><a href="${escapeHtml(`${appUrl}/erp/projects/${d.job.projectId}`)}">${escapeHtml(d.job.jobTitle)}</a>${d.job.companyName ? ` (${escapeHtml(d.job.companyName)})` : ""}: due ${escapeHtml(day(d.day))}</li>`)
      .join("");
    const html = `<p>Billing cutoffs are coming up in ${REMIND_DAYS} days. Please update percent complete on these jobs so billing can go out on time:</p><ul>${rows}</ul>`;
    try {
      await sendEmail({
        type: "BILLING_CUTOFF_REMINDER",
        to,
        subject: list.length === 1 ? `Billing cutoff in ${REMIND_DAYS} days: ${list[0]!.job.jobTitle}` : `Billing cutoff in ${REMIND_DAYS} days: ${list.length} jobs`,
        html,
        link: `/erp/projects/${list[0]!.job.projectId}`,
      });
      sent++;
    } catch (e) {
      console.error("Billing cutoff reminder", to, e);
    }
  }
  return { sent, jobs: due.length };
}

export type DeliveryCutoff = { day: string; state: "MISSED" | "SOON"; daysLeft: number };

/**
 * Cutoff warnings for invoices still on Needs sending (INVOICE_TRACKING_PLAN.md
 * Phase 5). The cutoff is the job's own day, else the client company's; the
 * one that counts is the first on or after the day the invoice was approved.
 * Missed once that day has passed, Soon within REMIND_DAYS of it. Invoices
 * with no cutoff, or further off, aren't in the map.
 */
export async function loadDeliveryCutoffs(
  deliveries: { id: string; destType: string; destId: string; clientCompanyId: string | null; createdAt: Date }[],
  todayKey: string = todayEasternKey(),
): Promise<Map<string, DeliveryCutoff>> {
  const out = new Map<string, DeliveryCutoff>();
  if (!deliveries.length) return out;
  const projectIds = deliveries.filter((d) => d.destType === "PROJECT").map((d) => d.destId);
  const companyIds = [...new Set(deliveries.map((d) => d.clientCompanyId).filter((x): x is string => !!x))];
  const [projects, companies] = await Promise.all([
    projectIds.length ? prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, billingCutoffDay: true } }) : [],
    companyIds.length ? prisma.clientCompany.findMany({ where: { id: { in: companyIds } }, select: { id: true, billingCutoffDay: true } }) : [],
  ]);
  const projectDay = new Map(projects.map((p) => [p.id, p.billingCutoffDay]));
  const companyDay = new Map(companies.map((c) => [c.id, c.billingCutoffDay]));
  for (const d of deliveries) {
    const cutoffDay = (d.destType === "PROJECT" ? projectDay.get(d.destId) : null) ?? (d.clientCompanyId ? companyDay.get(d.clientCompanyId) : null);
    const c = cutoffDay ? deliveryCutoffFor(cutoffDay, todayEasternKey(d.createdAt), todayKey) : null;
    if (c) out.set(d.id, c);
  }
  return out;
}

/** The first cutoff on or after the approval day, when it's missed or within REMIND_DAYS. */
export function deliveryCutoffFor(cutoffDay: number, approvedKey: string, todayKey: string): DeliveryCutoff | null {
  const [y, m] = approvedKey.split("-").map(Number) as [number, number];
  let day = cutoffKey(y, m - 1, cutoffDay);
  if (day < approvedKey) day = m === 12 ? cutoffKey(y + 1, 0, cutoffDay) : cutoffKey(y, m, cutoffDay);
  const daysLeft = Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${todayKey}T00:00:00Z`)) / 86_400_000);
  if (daysLeft < 0) return { day, state: "MISSED", daysLeft };
  if (daysLeft <= REMIND_DAYS) return { day, state: "SOON", daysLeft };
  return null;
}

/** "Missed cutoff Nov 20", or "Cutoff Nov 20, today" / "Cutoff Nov 20, 3 days left". */
export function deliveryCutoffText(c: DeliveryCutoff): string {
  const day = new Date(`${c.day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  if (c.state === "MISSED") return `Missed cutoff ${day}`;
  return `Cutoff ${day}, ${c.daysLeft === 0 ? "today" : `${c.daysLeft} day${c.daysLeft === 1 ? "" : "s"} left`}`;
}
