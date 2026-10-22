/**
 * Confirm or Can't make it on schedule invites. Every invite email (supervisor,
 * crew, sub running a day, change order days) carries a link to a response
 * page; the answer is saved per invite (ScheduleConfirmation, keyed by the
 * invite's uid).
 *
 * - The link opens a page with buttons; only clicking a button records an
 *   answer, because email scanners open links on their own.
 * - A changed day (new date, time, scope or address) is sent again and asks
 *   again: the answer goes back to "no answer yet".
 * - Can't make it alerts the "Schedule declined" recipients (Jennifer, Edwin,
 *   David, Nick by default) right away. Nothing is removed from the schedule.
 * - When everyone on a day the client asked for has confirmed, the client
 *   hears it (scheduleRequester.ts).
 * - About 2pm the day before, anyone who hasn't answered for tomorrow goes in
 *   one "No answer yet" email to the same people (once per invite).
 */
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { escapeHtml, sendEmail } from "@/lib/email";
import { addDaysKey } from "./manualHoursRepeat";
import { todayEasternKey } from "./dates";
import { notifyRequesterAfterConfirm } from "./scheduleRequester";
import { dateLocale, tr, type Lang } from "./language";
import { languageForEmail } from "./languageLookup";
import { coRequestOpenFor, coRequestPath } from "./subCoRequests";

export type ConfirmationKind = "day" | "co-day" | "worker" | "co-worker" | "day-sub" | "co-day-sub";
export type ConfirmationStatus = "PENDING" | "CONFIRMED" | "DECLINED" | "CANCELLED";

const ROLE_LABEL: Record<ConfirmationKind, string> = {
  day: "Supervising",
  "co-day": "Supervising",
  worker: "Working",
  "co-worker": "Working",
  "day-sub": "Running the job",
  "co-day-sub": "Running the job",
};

/** Invite uids look like "worker-assignment-<id>@sueep.com" or "day-assignment-<id>-sub-<contractorId>@sueep.com". */
export function parseInviteUid(uid: string): { kind: ConfirmationKind; assignmentId: string } | null {
  const m = uid.match(/^(co-day|day|co-worker|worker)-assignment-([A-Za-z0-9]+)(-sub-[A-Za-z0-9]+)?@sueep\.com$/);
  if (!m) return null;
  const base = m[1] as "co-day" | "day" | "co-worker" | "worker";
  return { kind: m[3] ? (`${base}-sub` as ConfirmationKind) : base, assignmentId: m[2]! };
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.trim() || "";
}

/** The page the invite's buttons open. Null when the app address isn't set (no working link to send). */
export function responseUrl(token: string): string | null {
  const base = appUrl();
  return base && !/your-vercel-domain/.test(base) ? `${base}/schedule-response/${token}` : null;
}

/**
 * Before an invite goes out: the response row and its link. When the day
 * changed since the last invite, the earlier answer no longer counts.
 */
export async function prepareConfirmation(p: { uid: string; to: string; name?: string; title: string; dateKey: string; link?: string; changed: boolean }): Promise<string | null> {
  const parsed = parseInviteUid(p.uid);
  if (!parsed) return null;
  const existing = await prisma.scheduleConfirmation.findUnique({ where: { uid: p.uid } });
  const base = { kind: parsed.kind, assignmentId: parsed.assignmentId, personName: p.name || p.to, personEmail: p.to, title: p.title, dateKey: p.dateKey, link: p.link ?? null };
  if (!existing) {
    const token = randomBytes(24).toString("hex");
    await prisma.scheduleConfirmation.create({ data: { uid: p.uid, token, ...base } });
    return token;
  }
  const reset = p.changed || existing.status === "CANCELLED" || existing.personEmail !== p.to;
  await prisma.scheduleConfirmation.update({
    where: { uid: p.uid },
    data: { ...base, ...(reset ? { status: "PENDING", reason: null, respondedAt: null, unansweredAlertAt: null } : {}) },
  });
  return existing.token;
}

export async function markInviteSent(uid: string): Promise<void> {
  await prisma.scheduleConfirmation.updateMany({ where: { uid }, data: { inviteSentAt: new Date() } });
}

export async function cancelConfirmation(uid: string): Promise<void> {
  await prisma.scheduleConfirmation.updateMany({ where: { uid }, data: { status: "CANCELLED" } });
}

/** The two buttons in the invite email. */
export function responseButtonsHtml(url: string, lang: Lang = "en"): string {
  const btn = (label: string, bg: string) =>
    `<a href="${escapeHtml(url)}" style="display:inline-block;padding:10px 18px;margin-right:8px;border-radius:6px;background:${bg};color:#fff;text-decoration:none;font-weight:600">${label}</a>`;
  return `<p style="margin:16px 0 4px">${tr(lang, { en: "Can you make it?", es: "¿Puedes ir?" })}</p><p>${btn(tr(lang, { en: "Confirm", es: "Confirmar" }), "#16a34a")}${btn(tr(lang, { en: "Can't make it", es: "No puedo ir" }), "#6b7280")}</p>`;
}

const ROLE_LABEL_ES: Record<ConfirmationKind, string> = {
  day: "Supervisando",
  "co-day": "Supervisando",
  worker: "Trabajando",
  "co-worker": "Trabajando",
  "day-sub": "Dirigiendo el trabajo",
  "co-day-sub": "Dirigiendo el trabajo",
};

function dayLabel(key: string, lang: Lang = "en"): string {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString(dateLocale(lang), { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
}

export type ResponseView = {
  personName: string;
  role: string;
  title: string;
  day: string;
  status: ConfirmationStatus;
  reason: string | null;
  past: boolean;
  lang: Lang;
  /** Turnover subs: their change order request page, while it takes requests */
  coRequestPath: string | null;
};

export async function loadResponse(token: string): Promise<ResponseView | null> {
  const c = await prisma.scheduleConfirmation.findUnique({ where: { token } });
  if (!c) return null;
  const lang = await languageForEmail(c.personEmail);
  return {
    personName: c.personName,
    role: (lang === "es" ? ROLE_LABEL_ES : ROLE_LABEL)[c.kind as ConfirmationKind] ?? tr(lang, { en: "Scheduled", es: "Programado" }),
    title: c.title,
    day: dayLabel(c.dateKey, lang),
    lang,
    status: c.status as ConfirmationStatus,
    reason: c.reason,
    past: c.dateKey < todayEasternKey(),
    coRequestPath: c.kind === "day-sub" && (await coRequestOpenFor(token)) ? coRequestPath(token) : null,
  };
}

/** Records an answer. Can't make it alerts the Schedule declined recipients; changing back to Confirm tells them too. */
export async function recordResponse(token: string, answer: "CONFIRMED" | "DECLINED", reasonRaw: string | null): Promise<{ error: string } | { status: ConfirmationStatus }> {
  const c = await prisma.scheduleConfirmation.findUnique({ where: { token } });
  if (!c) return { error: "This link isn't valid anymore." };
  const lang = await languageForEmail(c.personEmail);
  if (c.status === "CANCELLED") return { error: tr(lang, { en: "You're no longer scheduled for this day.", es: "Ya no estás programado para este día." }) };
  if (c.dateKey < todayEasternKey()) return { error: tr(lang, { en: "This day has already passed.", es: "Este día ya pasó." }) };
  const reason = answer === "DECLINED" ? reasonRaw?.trim().slice(0, 500) || null : null;
  const before = c.status;
  await prisma.scheduleConfirmation.update({ where: { token }, data: { status: answer, reason, respondedAt: new Date() } });

  const appBase = appUrl();
  const jobLink = c.link && appBase ? `${appBase}${c.link}` : null;
  const role = ROLE_LABEL[c.kind as ConfirmationKind] ?? "Scheduled";
  const who = escapeHtml(c.personName);
  const job = jobLink ? `<a href="${escapeHtml(jobLink)}">${escapeHtml(c.title)}</a>` : escapeHtml(c.title);
  try {
    if (answer === "DECLINED" && before !== "DECLINED") {
      await sendEmail({
        type: "SCHEDULE_DECLINED",
        subject: `Can't make it: ${c.personName}, ${c.title}, ${dayLabel(c.dateKey)}`,
        html: `<p><strong>${who}</strong> (${escapeHtml(role.toLowerCase())}) said they <strong>can't make it</strong> to ${job} on ${escapeHtml(dayLabel(c.dateKey))}.</p>${
          reason ? `<p><strong>Reason:</strong> ${escapeHtml(reason)}</p>` : ""
        }<p>They're still on the schedule, marked declined. Swap someone in on the Schedule.</p>`,
        link: c.link ?? undefined,
      });
    } else if (answer === "CONFIRMED" && before === "DECLINED") {
      await sendEmail({
        type: "SCHEDULE_DECLINED",
        subject: `Now confirmed: ${c.personName}, ${c.title}, ${dayLabel(c.dateKey)}`,
        html: `<p><strong>${who}</strong> changed their answer and <strong>can make it</strong> to ${job} on ${escapeHtml(dayLabel(c.dateKey))} after all.</p>`,
        link: c.link ?? undefined,
      });
    }
  } catch (e) {
    console.error("Schedule response alert failed", { token: token.slice(0, 6) }, e);
  }
  // The last Confirm for a day the client asked for tells the client
  if (answer === "CONFIRMED") await notifyRequesterAfterConfirm(c);
  return { status: answer };
}

/** Invites for `dayKey` that went out and have no answer yet (and weren't alerted before). */
export async function unansweredFor(dayKey: string) {
  return prisma.scheduleConfirmation.findMany({
    where: { dateKey: dayKey, status: "PENDING", inviteSentAt: { not: null }, unansweredAlertAt: null },
    orderBy: [{ title: "asc" }, { personName: "asc" }],
  });
}

/** About 2pm: one email listing tomorrow's invites with no answer. Daily cron; sends nothing when everyone answered. */
export async function sendUnansweredAlert(todayKey: string = todayEasternKey()): Promise<{ sent: number; people: number }> {
  const tomorrow = addDaysKey(todayKey, 1);
  const rows = await unansweredFor(tomorrow);
  if (!rows.length) return { sent: 0, people: 0 };
  const appBase = appUrl();
  const items = rows
    .map((r) => {
      const job = r.link && appBase ? `<a href="${escapeHtml(`${appBase}${r.link}`)}">${escapeHtml(r.title)}</a>` : escapeHtml(r.title);
      return `<li><strong>${escapeHtml(r.personName)}</strong> (${escapeHtml((ROLE_LABEL[r.kind as ConfirmationKind] ?? "Scheduled").toLowerCase())}): ${job}</li>`;
    })
    .join("");
  await sendEmail({
    type: "SCHEDULE_UNANSWERED",
    subject: `No answer yet for tomorrow: ${rows.length} ${rows.length === 1 ? "person" : "people"}`,
    html: `<p>These people are scheduled for <strong>${escapeHtml(dayLabel(tomorrow))}</strong> and haven't confirmed yet:</p><ul>${items}</ul><p>A quick call or text may be worth it.</p>`,
    link: "/erp/schedule",
  });
  await prisma.scheduleConfirmation.updateMany({ where: { uid: { in: rows.map((r) => r.uid) } }, data: { unansweredAlertAt: new Date() } });
  return { sent: 1, people: rows.length };
}

/** Declined and not-yet-answered invites from today through `days` ahead, for the dashboard. */
export async function confirmationIssues(days: number, todayKey: string = todayEasternKey()) {
  const rows = await prisma.scheduleConfirmation.findMany({
    where: { dateKey: { gte: todayKey, lte: addDaysKey(todayKey, days) }, status: { in: ["DECLINED", "PENDING"] }, inviteSentAt: { not: null } },
    orderBy: [{ dateKey: "asc" }, { title: "asc" }],
  });
  return { declined: rows.filter((r) => r.status === "DECLINED"), pending: rows.filter((r) => r.status === "PENDING") };
}

/** Answers by invite uid, for showing marks on the schedule. */
export async function statusesByUid(uids: string[]): Promise<Map<string, ConfirmationStatus>> {
  if (!uids.length) return new Map();
  const rows = await prisma.scheduleConfirmation.findMany({ where: { uid: { in: uids } }, select: { uid: true, status: true } });
  return new Map(rows.map((r) => [r.uid, r.status as ConfirmationStatus]));
}

export type ProjectInviteResponse = {
  uid: string;
  personName: string;
  role: string;
  title: string;
  /** Invite for a change order day; `title` is then the change order */
  changeOrder: boolean;
  dateKey: string;
  status: "PENDING" | "CONFIRMED" | "DECLINED";
  reason: string | null;
  respondedAt: string | null;
  inviteSentAt: string | null;
};

/** Every invite sent for a job's days and its change orders' days, with each person's answer. Newest day first. */
export async function inviteResponsesForProject(projectId: string): Promise<ProjectInviteResponse[]> {
  const [days, workers, coDays, coWorkers] = await Promise.all([
    prisma.projectDayAssignment.findMany({ where: { projectId }, select: { id: true } }),
    prisma.projectWorkerDayAssignment.findMany({ where: { projectId }, select: { id: true } }),
    prisma.changeOrderDayAssignment.findMany({ where: { changeOrder: { projectId } }, select: { id: true } }),
    prisma.changeOrderWorkerDayAssignment.findMany({ where: { changeOrder: { projectId } }, select: { id: true } }),
  ]);
  const ids = [...days, ...workers, ...coDays, ...coWorkers].map((a) => a.id);
  if (!ids.length) return [];
  const rows = await prisma.scheduleConfirmation.findMany({
    where: { assignmentId: { in: ids }, status: { not: "CANCELLED" }, inviteSentAt: { not: null } },
    orderBy: [{ dateKey: "desc" }, { personName: "asc" }],
  });
  return rows.map((r) => ({
    uid: r.uid,
    personName: r.personName,
    role: ROLE_LABEL[r.kind as ConfirmationKind] ?? "Scheduled",
    title: r.title,
    changeOrder: r.kind.startsWith("co-"),
    dateKey: r.dateKey,
    status: r.status as ProjectInviteResponse["status"],
    reason: r.reason,
    respondedAt: r.respondedAt?.toISOString() ?? null,
    inviteSentAt: r.inviteSentAt?.toISOString() ?? null,
  }));
}
