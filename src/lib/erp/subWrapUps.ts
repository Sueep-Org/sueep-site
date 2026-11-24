/**
 * End-of-day wrap-up for the sub running a day. After the day's end time
 * they get an email (SUB_WRAP_UP_REQUEST) with a button to their jobs page,
 * where they mark each task done or not done; not done needs a reason. The
 * day's PM is emailed what wasn't done (SUB_WORK_NOT_DONE). The next morning,
 * if they still haven't sent it, they're reminded and the PM is told
 * (SUB_WRAP_UP_MISSED). Saved on the day's SubCheckIn row, so it shows on
 * the schedule's day card next to check-in, photos and the review.
 *
 * Tasks: a turnover unit's checklist sections; otherwise the day's SOV
 * lines, scope items and change orders; a change order day is the change
 * order; with none of those, one task for the whole day.
 */
import { prisma } from "@/lib/prisma";
import { escapeHtml, sendEmail } from "@/lib/email";
import { getNotificationSetting } from "@/lib/notificationSettings";
import { appUrl } from "@/lib/erp/scheduleInvites";
import { subEmailButtonUrl, type LinkedSub } from "@/lib/erp/subPortalAccess";
import { TURNOVER_PHOTO_AREAS } from "@/lib/erp/subPhotoAreas";
import { parseLang, tr, type Lang } from "@/lib/erp/language";
import { todayEasternKey } from "@/lib/erp/dates";
import { easternWallToInstant } from "@/lib/erp/janitorialHours";
import { findJobDay, jobKeyOf, utcDay } from "@/lib/erp/subCheckIns";
import {
  WHOLE_DAY_TASK,
  WRAP_UP_DAYS_BACK,
  WRAP_UP_NOTE_MAX,
  WRAP_UP_REASON_MAX,
  WRAP_UP_REASON_MIN,
  type PortalWrapUp,
  type WrapUpItem,
} from "@/lib/erp/subWrapUpShared";

const TURNOVER_SEGMENT = "JANITORIAL_TURNOVER_REQUESTS";
const CLOSED_PROJECT = ["ARCHIVED", "CANCELLED"];
/** The wrap-up email goes this long after the day's end time */
export const WRAP_UP_DELAY_MINUTES = 60;
/** End time used when a day has none */
export const DEFAULT_END_TIME = "17:00";
/** The next-morning reminder goes from this Eastern time on */
export const REMINDER_TIME = "08:00";
/** Don't send a wrap-up email more than this long after it was due (e.g. a cron outage) */
const SEND_WINDOW_HOURS = 6;
const BUTTON = "display:inline-block;padding:10px 18px;border-radius:6px;background:#E73C6E;color:#fff;text-decoration:none;font-weight:600";

function addDaysKey(key: string, days: number): string {
  const d = utcDay(key);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dayLabel(key: string, lang: Lang): string {
  return utcDay(key).toLocaleDateString(lang === "es" ? "es-US" : "en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
}

/** A day a sub runs, with what the wrap-up needs */
export type LeadDay = {
  contractorId: string;
  jobKey: string;
  projectId: string;
  changeOrderId: string | null;
  dateKey: string;
  endTime: string | null;
  title: string;
  tasks: string[];
  pmEmail: string | null;
  path: string;
};

function unique(list: string[]): string[] {
  const seen = new Set<string>();
  return list
    .map((s) => s.trim())
    .filter((s) => {
      const k = s.toLowerCase();
      if (!s || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

/** Days run by these subs (all subs when contractorIds is null) between two Eastern date keys, inclusive. */
export async function loadLeadDays(fromKey: string, toKey: string, contractorIds: string[] | null): Promise<LeadDay[]> {
  const where = {
    date: { gte: utcDay(fromKey), lte: utcDay(toKey) },
    supervisorContractorId: contractorIds ? { in: contractorIds } : { not: null },
  };
  const [days, coDays] = await Promise.all([
    prisma.projectDayAssignment.findMany({
      where: { ...where, project: { status: { notIn: CLOSED_PROJECT } } },
      select: {
        projectId: true,
        date: true,
        endTime: true,
        supervisorContractorId: true,
        scopeItems: true,
        projectManager: { select: { email: true } },
        project: { select: { jobTitle: true, segment: true } },
        sovItems: { select: { description: true } },
        changeOrders: { select: { title: true } },
      },
    }),
    prisma.changeOrderDayAssignment.findMany({
      where: { ...where, changeOrder: { project: { status: { notIn: CLOSED_PROJECT } } } },
      select: {
        changeOrderId: true,
        date: true,
        endTime: true,
        supervisorContractorId: true,
        projectManager: { select: { email: true } },
        changeOrder: { select: { title: true, projectId: true, project: { select: { jobTitle: true } } } },
      },
    }),
  ]);
  return [
    ...days.map((d): LeadDay => {
      const tasks =
        d.project.segment === TURNOVER_SEGMENT
          ? TURNOVER_PHOTO_AREAS.map((a) => a.label)
          : unique([...d.sovItems.map((s) => s.description), ...d.scopeItems, ...d.changeOrders.map((c) => `Change order: ${c.title}`)]);
      return {
        contractorId: d.supervisorContractorId!,
        jobKey: jobKeyOf(d.projectId, null),
        projectId: d.projectId,
        changeOrderId: null,
        dateKey: d.date.toISOString().slice(0, 10),
        endTime: d.endTime,
        title: d.project.jobTitle,
        tasks: tasks.length ? tasks : [WHOLE_DAY_TASK],
        pmEmail: d.projectManager?.email ?? null,
        path: `/erp/projects/${d.projectId}`,
      };
    }),
    ...coDays.map((d): LeadDay => ({
      contractorId: d.supervisorContractorId!,
      jobKey: jobKeyOf(d.changeOrder.projectId, d.changeOrderId),
      projectId: d.changeOrder.projectId,
      changeOrderId: d.changeOrderId,
      dateKey: d.date.toISOString().slice(0, 10),
      endTime: d.endTime,
      title: `${d.changeOrder.title} (${d.changeOrder.project.jobTitle})`,
      tasks: [d.changeOrder.title.trim() || WHOLE_DAY_TASK],
      pmEmail: d.projectManager?.email ?? null,
      path: `/erp/projects/${d.changeOrder.projectId}/change-orders/${d.changeOrderId}`,
    })),
  ];
}

/** When the day is over for wrap-up purposes: its end time, or 5 PM. */
export function dayEndsAt(day: { dateKey: string; endTime: string | null }): Date {
  return easternWallToInstant(day.dateKey, day.endTime || DEFAULT_END_TIME);
}

type WrapRow = { contractorId: string; jobKey: string; date: Date; checkOutAt: Date | null; wrapUpAt: Date | null; wrapUpEmailAt: Date | null; wrapUpReminderAt: Date | null };

async function wrapRows(contractorIds: string[], fromKey: string, toKey: string): Promise<Map<string, WrapRow>> {
  const rows = await prisma.subCheckIn.findMany({
    where: { contractorId: { in: contractorIds }, date: { gte: utcDay(fromKey), lte: utcDay(toKey) } },
    select: { contractorId: true, jobKey: true, date: true, checkOutAt: true, wrapUpAt: true, wrapUpEmailAt: true, wrapUpReminderAt: true },
  });
  return new Map(rows.map((r) => [rowKey(r.contractorId, r.jobKey, r.date.toISOString().slice(0, 10)), r]));
}

const rowKey = (contractorId: string, jobKey: string, dateKey: string) => `${contractorId}|${jobKey}|${dateKey}`;

// ── The sub's side ─────────────────────────────────────────────────────────

/**
 * Days this sub ran in the last few days that still need a wrap-up: past
 * days, and today once they've checked out or the day's end time has passed.
 */
export async function portalWrapUps(contractorId: string, now: Date = new Date()): Promise<PortalWrapUp[]> {
  const todayKey = todayEasternKey(now);
  const fromKey = addDaysKey(todayKey, -WRAP_UP_DAYS_BACK);
  const [days, rows] = await Promise.all([loadLeadDays(fromKey, todayKey, [contractorId]), wrapRows([contractorId], fromKey, todayKey)]);
  return days
    .filter((d) => {
      const r = rows.get(rowKey(contractorId, d.jobKey, d.dateKey));
      if (r?.wrapUpAt) return false;
      return d.dateKey < todayKey || !!r?.checkOutAt || now >= dayEndsAt(d);
    })
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.title.localeCompare(b.title))
    .map((d) => ({ jobKey: d.jobKey, dateKey: d.dateKey, title: d.title, tasks: d.tasks }));
}

export type WrapUpErrorCode = "INVALID" | "NOT_YOURS" | "TOO_OLD" | "NOT_YET" | "REASON" | "ALREADY_SENT";

/** Saves the sub's wrap-up and tells the PM what wasn't done. */
export async function submitWrapUp(
  sub: LinkedSub,
  input: { jobKey: unknown; dateKey: unknown; answers: unknown; note: unknown },
  now: Date = new Date(),
): Promise<{ ok: true } | { error: string; code: WrapUpErrorCode }> {
  const lang = sub.lang;
  const jobKey = typeof input.jobKey === "string" ? input.jobKey : "";
  const dateKey = typeof input.dateKey === "string" ? input.dateKey : "";
  const invalid = { error: tr(lang, { en: "Something went wrong. Refresh and try again.", es: "Algo salió mal. Recarga e intenta de nuevo." }), code: "INVALID" as const };
  if (!/^(p|co):[\w-]+$/.test(jobKey) || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !Array.isArray(input.answers)) return invalid;

  const todayKey = todayEasternKey(now);
  if (dateKey > todayKey) return { error: tr(lang, { en: "This day hasn't happened yet.", es: "Este día todavía no ha llegado." }), code: "NOT_YET" };
  if (dateKey < addDaysKey(todayKey, -WRAP_UP_DAYS_BACK)) {
    return { error: tr(lang, { en: "This day is too old to wrap up here. Tell Sueep instead.", es: "Este día ya pasó hace mucho. Avísale a Sueep." }), code: "TOO_OLD" };
  }
  const jobDay = await findJobDay(sub.id, jobKey, dateKey);
  if (!jobDay || jobDay.role !== "lead") {
    return { error: tr(lang, { en: "Only the person running this day can wrap it up.", es: "Solo quien dirige este día puede cerrarlo." }), code: "NOT_YOURS" };
  }
  const day = (await loadLeadDays(dateKey, dateKey, [sub.id])).find((d) => d.jobKey === jobKey);
  if (!day) return invalid;

  const answers = input.answers as unknown[];
  if (answers.length !== day.tasks.length) return invalid;
  const items: WrapUpItem[] = [];
  for (let i = 0; i < day.tasks.length; i++) {
    const a = answers[i] as { done?: unknown; reason?: unknown } | null;
    if (!a || typeof a.done !== "boolean") return invalid;
    const reason = typeof a.reason === "string" ? a.reason.trim().slice(0, WRAP_UP_REASON_MAX) : "";
    if (!a.done && reason.length < WRAP_UP_REASON_MIN) {
      return { error: tr(lang, { en: `Say why "${day.tasks[i]}" wasn't done.`, es: `Escribe por qué no se hizo "${day.tasks[i]}".` }), code: "REASON" };
    }
    items.push({ label: day.tasks[i], done: a.done, reason: a.done ? null : reason });
  }
  const note = typeof input.note === "string" ? input.note.trim().slice(0, WRAP_UP_NOTE_MAX) : "";

  const date = utcDay(dateKey);
  const row = await prisma.subCheckIn.upsert({
    where: { contractorId_jobKey_date: { contractorId: sub.id, jobKey, date } },
    create: { contractorId: sub.id, jobKey, projectId: day.projectId, changeOrderId: day.changeOrderId, date, role: "lead" },
    update: {},
    select: { id: true },
  });
  const saved = await prisma.subCheckIn.updateMany({
    where: { id: row.id, wrapUpAt: null },
    data: { wrapUpAt: now, wrapUpItems: items, wrapUpNote: note || null },
  });
  if (saved.count === 0) return { error: tr(lang, { en: "You already sent this day's wrap-up.", es: "Ya enviaste el cierre de este día." }), code: "ALREADY_SENT" };

  if (items.some((i) => !i.done)) {
    await emailNotDone(sub.name, day, items, note).catch((e) => console.error("Work not done email failed", { contractorId: sub.id, jobKey, dateKey }, e));
  }
  return { ok: true };
}

async function emailNotDone(subName: string, day: LeadDay, items: WrapUpItem[], note: string): Promise<void> {
  const also = (await getNotificationSetting("SUB_WORK_NOT_DONE")).to;
  const base = appUrl();
  const job = base ? `<a href="${escapeHtml(`${base}${day.path}`)}">${escapeHtml(day.title)}</a>` : escapeHtml(day.title);
  const notDone = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);
  await sendEmail({
    type: "SUB_WORK_NOT_DONE",
    to: [...new Set([...(day.pmEmail ? [day.pmEmail] : []), ...also])],
    link: day.path,
    subject: `Not done: ${notDone.length} of ${items.length} on ${day.title} (${subName})`,
    html: [
      `<p><strong>${escapeHtml(subName)}</strong> wrapped up ${job} for ${escapeHtml(dayLabel(day.dateKey, "en"))} and says this wasn't done:</p>`,
      `<ul style="padding-left:18px">${notDone.map((i) => `<li><strong>${escapeHtml(i.label)}</strong>: ${escapeHtml(i.reason ?? "")}</li>`).join("")}</ul>`,
      done.length ? `<p style="color:#555">Done: ${done.map((i) => escapeHtml(i.label)).join(", ")}</p>` : "",
      note ? `<p>Their note: ${escapeHtml(note).replace(/\n/g, "<br>")}</p>` : "",
      `<p>It also shows on the day card on the schedule.</p>`,
    ].join(""),
  });
}

// ── Emails (cron) ──────────────────────────────────────────────────────────

/**
 * Every 15 minutes (vercel.json). Today: an hour after each day's end time,
 * the sub running it gets the wrap-up email. From 8 AM: yesterday's days
 * still not wrapped up remind the sub and tell the PM. Each goes once.
 */
export async function sendWrapUpEmails(now: Date = new Date()): Promise<{ requested: number; reminded: number }> {
  const todayKey = todayEasternKey(now);
  const yesterdayKey = addDaysKey(todayKey, -1);
  const subs = await prisma.contractor.findMany({
    where: { status: "ACTIVE", portalTurnedOffAt: null, portalToken: { not: null }, email: { not: null } },
    select: { id: true, name: true, email: true, language: true },
  });
  if (subs.length === 0) return { requested: 0, reminded: 0 };
  const subOf = new Map(subs.map((s) => [s.id, s]));
  const ids = [...subOf.keys()];
  const afterReminderTime = now >= easternWallToInstant(todayKey, REMINDER_TIME);
  const [days, rows] = await Promise.all([loadLeadDays(afterReminderTime ? yesterdayKey : todayKey, todayKey, ids), wrapRows(ids, yesterdayKey, todayKey)]);

  let requested = 0;
  let reminded = 0;
  for (const d of days) {
    const r = rows.get(rowKey(d.contractorId, d.jobKey, d.dateKey));
    if (r?.wrapUpAt) continue;
    const sub = subOf.get(d.contractorId)!;
    let kind: "request" | "reminder";
    if (d.dateKey === todayKey) {
      const due = dayEndsAt(d).getTime() + WRAP_UP_DELAY_MINUTES * 60_000;
      if (r?.wrapUpEmailAt || now.getTime() < due || now.getTime() - due > SEND_WINDOW_HOURS * 3_600_000) continue;
      kind = "request";
    } else {
      // Only days they were asked about, so turning this on doesn't flood PMs with old days
      if (!r?.wrapUpEmailAt || r.wrapUpReminderAt) continue;
      kind = "reminder";
    }

    // Claim it first, so two runs can't both send
    const row = await prisma.subCheckIn.upsert({
      where: { contractorId_jobKey_date: { contractorId: d.contractorId, jobKey: d.jobKey, date: utcDay(d.dateKey) } },
      create: { contractorId: d.contractorId, jobKey: d.jobKey, projectId: d.projectId, changeOrderId: d.changeOrderId, date: utcDay(d.dateKey), role: "lead" },
      update: {},
      select: { id: true },
    });
    const claimed = await prisma.subCheckIn.updateMany({
      where: { id: row.id, wrapUpAt: null, ...(kind === "request" ? { wrapUpEmailAt: null } : { wrapUpReminderAt: null }) },
      data: kind === "request" ? { wrapUpEmailAt: now } : { wrapUpReminderAt: now },
    });
    if (claimed.count === 0) continue;
    if (kind === "request") requested++;
    else reminded++;

    await emailSub(sub, d, kind === "reminder").catch((e) => console.error("Wrap-up email failed", { contractorId: d.contractorId, jobKey: d.jobKey }, e));
    if (kind === "reminder") await emailMissed(sub.name, d).catch((e) => console.error("Wrap-up missed email failed", { contractorId: d.contractorId, jobKey: d.jobKey }, e));
  }
  return { requested, reminded };
}

async function emailSub(sub: { id: string; name: string; email: string | null; language: string }, day: LeadDay, reminder: boolean): Promise<void> {
  if (!sub.email) return;
  const lang = parseLang(sub.language);
  const button = await subEmailButtonUrl(sub.id);
  const first = sub.name.split(" ")[0] || sub.name;
  const when = dayLabel(day.dateKey, lang);
  const tasks = day.tasks.filter((t) => t !== WHOLE_DAY_TASK);
  const html = [
    `<h2 style="margin:0 0 12px;color:#E73C6E">${reminder ? tr(lang, { en: "Still need your wrap-up", es: "Todavía falta tu cierre del día" }) : tr(lang, { en: "Wrap up your day", es: "Cierra tu día" })}</h2>`,
    `<p>${tr(lang, { en: "Hi", es: "Hola" })} ${escapeHtml(first)},</p>`,
    `<p>${tr(lang, {
      en: `Please tell us how <strong>${escapeHtml(day.title)}</strong> went on ${escapeHtml(when)}. Mark each task done or not done, and if something wasn't done, write why.`,
      es: `Cuéntanos cómo fue <strong>${escapeHtml(day.title)}</strong> el ${escapeHtml(when)}. Marca cada tarea como hecha o no hecha, y si algo no se hizo, escribe por qué.`,
    })}</p>`,
    tasks.length ? `<ul style="padding-left:18px">${tasks.slice(0, 15).map((t) => `<li>${escapeHtml(t)}</li>`).join("")}${tasks.length > 15 ? "<li>…</li>" : ""}</ul>` : "",
    `<p>${tr(lang, { en: "If you haven't yet, check out and add your after photos on the same page.", es: "Si todavía no lo hiciste, registra tu salida y agrega tus fotos de después en la misma página." })}</p>`,
    button ? `<p style="margin:20px 0"><a href="${escapeHtml(button)}" style="${BUTTON}">${tr(lang, { en: "Wrap up my day", es: "Cerrar mi día" })}</a></p>` : "",
    `<p style="font-size:12px;color:#555">${tr(lang, { en: "Please don't forward this email, since the button signs you in.", es: "No reenvíes este correo, porque el botón inicia tu sesión." })}</p>`,
  ].join("");
  await sendEmail({
    type: "SUB_WRAP_UP_REQUEST",
    to: sub.email,
    link: day.path,
    subject: reminder
      ? tr(lang, { en: `Reminder: wrap up ${day.title}`, es: `Recordatorio: cierra ${day.title}` })
      : tr(lang, { en: `Wrap up your day: ${day.title}`, es: `Cierra tu día: ${day.title}` }),
    html,
    lang,
  });
}

async function emailMissed(subName: string, day: LeadDay): Promise<void> {
  const also = (await getNotificationSetting("SUB_WRAP_UP_MISSED")).to;
  const base = appUrl();
  const job = base ? `<a href="${escapeHtml(`${base}${day.path}`)}">${escapeHtml(day.title)}</a>` : escapeHtml(day.title);
  await sendEmail({
    type: "SUB_WRAP_UP_MISSED",
    to: [...new Set([...(day.pmEmail ? [day.pmEmail] : []), ...also])],
    link: day.path,
    subject: `No wrap-up: ${subName}, ${day.title}`,
    html: `<p><strong>${escapeHtml(subName)}</strong> hasn't sent their end-of-day wrap-up for ${job} (${escapeHtml(dayLabel(day.dateKey, "en"))}), so we don't know what got done. They were reminded this morning.</p><p>They can still send it from their jobs page for ${WRAP_UP_DAYS_BACK} days.</p>`,
  });
}
