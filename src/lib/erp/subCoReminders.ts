/**
 * Weekday-morning nudges for sub change order requests (cron
 * /api/cron/sub-co-reminders):
 * - the property manager, when they haven't answered for a business day.
 *   Up to 3 reminders, a business day apart, so clients aren't nagged forever.
 * - David and Jennifer (SUB_CO_WAITING), one list of requests waiting on the
 *   property manager over 2 business days, or on the office over 1. Sent
 *   every weekday until they're dealt with.
 */
import { prisma } from "@/lib/prisma";
import { escapeHtml, sendEmail } from "@/lib/email";
import { sendPmReminder, subCoRequestsPath } from "./subCoApproval";

const MAX_PM_REMINDERS = 3;

/** The same time `n` business days ago (weekends skipped). */
export function businessDaysAgo(now: Date, n: number): Date {
  const d = new Date(now);
  for (let left = n; left > 0; ) {
    d.setUTCDate(d.getUTCDate() - 1);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) left--;
  }
  return d;
}

function shortDay(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/New_York" });
}

export async function runSubCoReminders(now = new Date()): Promise<{ pmReminders: number; officeWaiting: number; officeEmailed: boolean }> {
  const oneDay = businessDaysAgo(now, 1);
  const twoDays = businessDaysAgo(now, 2);

  const due = await prisma.subCoRequest.findMany({
    where: {
      status: "WAITING_PM",
      pmSentAt: { lte: oneDay },
      pmReminderCount: { lt: MAX_PM_REMINDERS },
      OR: [{ pmRemindedAt: null }, { pmRemindedAt: { lte: oneDay } }],
    },
    select: { id: true },
  });
  let pmReminders = 0;
  for (const r of due) {
    if (await sendPmReminder(r.id, now).catch((e) => (console.error("Sub CO reminder failed", { id: r.id }, e), false))) pmReminders++;
  }

  const waiting = await prisma.subCoRequest.findMany({
    where: {
      OR: [
        { status: "WAITING_PM", pmSentAt: { lte: twoDays } },
        { status: { in: ["SUBMITTED", "OFFICE_REVIEW", "READY"] }, createdAt: { lte: oneDay } },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: { status: true, createdAt: true, pmSentAt: true, pmReminderCount: true, projectId: true, project: { select: { jobTitle: true } }, contractor: { select: { name: true } } },
  });
  if (!waiting.length) return { pmReminders, officeWaiting: 0, officeEmailed: false };

  const base = (process.env.NEXT_PUBLIC_APP_URL?.trim() || "").replace(/\/$/, "");
  const cell = "padding:6px 8px;border-bottom:1px solid #eee";
  const rows = waiting
    .map((w) => {
      const onPm = w.status === "WAITING_PM";
      const what = onPm
        ? `Property manager hasn't answered${w.pmReminderCount ? ` (${w.pmReminderCount} reminder${w.pmReminderCount === 1 ? "" : "s"} sent)` : ""}`
        : w.status === "READY"
          ? "Email to the property manager didn't go out"
          : "Needs a price or a property manager email";
      const unit = base ? `<a href="${escapeHtml(base + subCoRequestsPath(w.projectId))}">${escapeHtml(w.project.jobTitle)}</a>` : escapeHtml(w.project.jobTitle);
      return `<tr><td style="${cell}">${unit}</td><td style="${cell}">${escapeHtml(w.contractor.name)}</td><td style="${cell}">${escapeHtml(what)}</td><td style="${cell};white-space:nowrap">${escapeHtml(shortDay(onPm && w.pmSentAt ? w.pmSentAt : w.createdAt))}</td></tr>`;
    })
    .join("");
  const result = await sendEmail({
    type: "SUB_CO_WAITING",
    link: "/erp",
    subject: `${waiting.length} sub change order${waiting.length === 1 ? "" : "s"} waiting`,
    html: `
      <h2 style="margin:0 0 12px;color:#E73C6E">Sub change orders waiting</h2>
      <p>These subs are waiting to hear if they can do the extra work. A call to the property manager may help, or mark the answer on the unit's CO Requests tab.</p>
      <table style="border-collapse:collapse;font-size:14px"><tr><th style="text-align:left;padding:6px 8px">Unit</th><th style="text-align:left;padding:6px 8px">Sub</th><th style="text-align:left;padding:6px 8px">Waiting on</th><th style="text-align:left;padding:6px 8px">Since</th></tr>${rows}</table>
    `,
  });
  return { pmReminders, officeWaiting: waiting.length, officeEmailed: result === "SENT" };
}
