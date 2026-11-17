/**
 * Email subs: one message to many subs, picked on Contractors → Email subs.
 * Each sub gets their own email (no shared To/BCC list), in Spanish when
 * their language is Spanish and a Spanish version was written, optionally
 * with a fresh link to their info form (the same 7-day link "Send info link"
 * makes, where they can add workers' comp and other insurance).
 *
 * and/or a sign-in button to their sub portal, and the same attached files.
 *
 * Every send goes through the Email Log, and sending stops at the daily
 * cutoff so the automatic emails later in the day still have room.
 */
import { prisma } from "@/lib/prisma";
import { escapeHtml, sendEmail } from "@/lib/email";
import { getNotificationSetting } from "@/lib/notificationSettings";
import { loadEmailQuota } from "./emailQuota";
import { subCoverage, type CoverageItemStatus } from "./subCoverage";
import { parseLang, type Lang } from "./language";
import { ensurePortalToken, subEmailButtonUrl } from "./subPortalAccess";

type Attachment = { filename: string; content: Buffer; mimeType?: string };

export const INFO_LINK_DAYS = 7;
/** Most picked in one send. */
export const MAX_BULK_RECIPIENTS = 200;

export type BulkSubRow = {
  id: string;
  name: string;
  email: string | null;
  language: Lang;
  status: string;
  role: string | null;
  /** Was ever sent the info form link (the link stays on the contractor once made). */
  gotInfoLink: boolean;
  wcStatus: CoverageItemStatus;
  wcExpiresAt: string | null;
  glStatus: CoverageItemStatus;
  /** Their latest schedule day (project or change order), "YYYY-MM-DD", or null. Can be in the future. */
  lastScheduledDay: string | null;
  /** Portal turned off on the Users page, so no portal button for them. */
  portalOff: boolean;
};

export async function loadBulkEmailSubs(): Promise<BulkSubRow[]> {
  const rows = await prisma.contractor.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      language: true,
      status: true,
      infoToken: true,
      role: true,
      portalTurnedOffAt: true,
      hasInsurance: true,
      workersCompExpiresAt: true,
      workersCompExempt: true,
      glExpiresAt: true,
      autoExpiresAt: true,
      umbrellaExpiresAt: true,
    },
  });
  const [days, coDays] = await Promise.all([
    prisma.projectWorkerDayAssignment.groupBy({ by: ["contractorId"], where: { contractorId: { not: null } }, _max: { date: true } }),
    prisma.changeOrderWorkerDayAssignment.groupBy({ by: ["contractorId"], where: { contractorId: { not: null } }, _max: { date: true } }),
  ]);
  const last = new Map<string, Date>();
  for (const r of [...days, ...coDays]) {
    if (!r.contractorId || !r._max.date) continue;
    const prev = last.get(r.contractorId);
    if (!prev || r._max.date > prev) last.set(r.contractorId, r._max.date);
  }
  return rows.map((c) => {
    const items = subCoverage(c).items;
    const wc = items.find((i) => i.key === "wc");
    const gl = items.find((i) => i.key === "gl");
    const lastDay = last.get(c.id);
    return {
      id: c.id,
      name: c.name,
      email: c.email?.trim() || null,
      language: parseLang(c.language),
      status: c.status,
      role: c.role?.trim() || null,
      gotInfoLink: !!c.infoToken,
      wcStatus: wc?.status ?? "MISSING",
      wcExpiresAt: wc?.expiresAt ?? null,
      glStatus: gl?.status ?? "MISSING",
      lastScheduledDay: lastDay ? lastDay.toISOString().slice(0, 10) : null,
      portalOff: !!c.portalTurnedOffAt,
    };
  });
}

export type BulkMessage = {
  subject: string;
  body: string;
  /** Optional Spanish version, used for subs whose language is Spanish. */
  subjectEs?: string;
  bodyEs?: string;
  includeInfoLink: boolean;
  includePortalLink: boolean;
};

function paragraphs(text: string): string {
  return text
    .trim()
    .split(/\n\s*\n/)
    .map((p) => `<p>${escapeHtml(p.trim()).replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

function button(url: string, label: string, primary: boolean): string {
  const look = primary ? "background:#E73C6E;color:#fff" : "background:#fff;color:#E73C6E;border:1px solid #E73C6E";
  return `<a href="${escapeHtml(url)}" style="${look};padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;margin:0 8px 8px 0">${label}</a>`;
}

export function bulkEmailHtml(params: { name: string; body: string; lang: Lang; infoUrl: string | null; portalUrl: string | null; banner?: string }): string {
  const es = params.lang === "es";
  const buttons = [
    params.infoUrl ? button(params.infoUrl, es ? "Abrir mi formulario" : "Open my info form", true) : "",
    params.portalUrl ? button(params.portalUrl, es ? "Abrir mi página de Sueep" : "Open my Sueep page", !params.infoUrl) : "",
  ].join("");
  const notes = [
    params.infoUrl ? (es ? `El enlace del formulario vence en ${INFO_LINK_DAYS} días.` : `The info form link expires in ${INFO_LINK_DAYS} days.`) : "",
  ].filter(Boolean);
  const block = buttons
    ? `<p style="margin:20px 0 12px">${buttons}</p>${notes.length ? `<p style="font-size:12px;color:#555">${notes.join(" ")}</p>` : ""}`
    : "";
  return `
    ${params.banner ?? ""}
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.6;max-width:560px">
      <p>${es ? "Hola" : "Hi"} ${escapeHtml(params.name)},</p>
      ${paragraphs(params.body)}
      ${block}
    </div>
  `;
}

export type BulkResult = { id: string; name: string; result: "sent" | "failed" | "limit" | "skipped"; note?: string };

/** Makes a new info form link for the sub, replacing their old one (same as Send info link). */
async function freshInfoUrl(contractorId: string): Promise<string> {
  const token = crypto.randomUUID();
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + INFO_LINK_DAYS);
  await prisma.contractor.update({ where: { id: contractorId }, data: { infoToken: token, infoTokenExpiry: expiry } });
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://sueep.com";
  return `${siteUrl}/contractor-info/${token}`;
}

/** Sign-in button to their portal, making the portal if they don't have one yet (same as Email portal link). Null when inactive or turned off. */
async function portalButtonUrl(c: { id: string; status: string; portalTurnedOffAt: Date | null }): Promise<string | null> {
  if (c.status !== "ACTIVE" || c.portalTurnedOffAt) return null;
  await ensurePortalToken(c.id, false);
  return subEmailButtonUrl(c.id);
}

function pickVersion(msg: BulkMessage, lang: Lang) {
  const useEs = lang === "es" && !!msg.bodyEs?.trim();
  return {
    lang: (useEs ? "es" : "en") as Lang,
    subject: (useEs && msg.subjectEs?.trim()) || msg.subject.trim(),
    body: useEs ? msg.bodyEs! : msg.body,
  };
}

/**
 * Emails only the sender what this sub would get. Doesn't touch the sub's
 * links: the buttons point at an example page and say so.
 */
export async function sendBulkTestEmail(sampleId: string | null, msg: BulkMessage, files: Attachment[], senderEmail: string): Promise<{ ok: true } | { error: string }> {
  const sample = sampleId ? await prisma.contractor.findUnique({ where: { id: sampleId }, select: { name: true, language: true } }) : null;
  const v = pickVersion(msg, parseLang(sample?.language));
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://sueep.com";
  const banner = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;background:#FEF3C7;color:#92400E;padding:8px 12px;border-radius:6px;margin-bottom:12px">Test: this is what ${escapeHtml(sample?.name ?? "a sub")} would get. Only you got this one. The buttons don't open their real pages here; in the real email each sub gets their own.</div>`;
  const status = await sendEmail({
    type: "SUB_BULK_EMAIL_TEST",
    to: senderEmail,
    sentBy: senderEmail,
    subject: `[Test] ${v.subject}`,
    html: bulkEmailHtml({
      name: sample?.name ?? "Sub name",
      body: v.body,
      lang: v.lang,
      infoUrl: msg.includeInfoLink ? siteUrl : null,
      portalUrl: msg.includePortalLink ? siteUrl : null,
      banner,
    }),
    lang: v.lang,
    attachments: files.length ? files : undefined,
  });
  if (status === "SENT") return { ok: true };
  if (status === "SKIPPED") return { error: "Email isn't set up on this server" };
  if (status === "OFF") return { error: "Test emails to subs are turned off in Email Settings" };
  return { error: "No one to send it to" };
}

export async function sendBulkSubEmail(ids: string[], msg: BulkMessage, files: Attachment[], senderEmail: string): Promise<{ results: BulkResult[]; remaining: number }> {
  const subs = await prisma.contractor.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true, language: true, status: true, portalTurnedOffAt: true } });
  const byId = new Map(subs.map((s) => [s.id, s]));
  const ccCount = (await getNotificationSetting("SUB_BULK_EMAIL")).cc.length;
  const quota = await loadEmailQuota();
  let room = quota.cutoff - quota.used;

  const results: BulkResult[] = [];
  // The files are stored with the first email of the send only, not once per sub.
  let keptFiles = false;
  for (const id of ids) {
    const s = byId.get(id);
    if (!s) continue;
    const email = s.email?.trim();
    if (!email) {
      results.push({ id, name: s.name, result: "skipped", note: "No email address" });
      continue;
    }
    const cost = 1 + ccCount;
    if (room < cost) {
      results.push({ id, name: s.name, result: "limit", note: "Daily email limit reached" });
      continue;
    }
    const v = pickVersion(msg, parseLang(s.language));
    try {
      const infoUrl = msg.includeInfoLink ? await freshInfoUrl(s.id) : null;
      const portalUrl = msg.includePortalLink ? await portalButtonUrl(s) : null;
      const keep = files.length > 0 && !keptFiles;
      const status = await sendEmail({
        type: "SUB_BULK_EMAIL",
        to: email,
        replyTo: senderEmail,
        sentBy: senderEmail,
        subject: v.subject,
        html: bulkEmailHtml({ name: s.name, body: v.body, lang: v.lang, infoUrl, portalUrl }),
        lang: v.lang,
        link: `/erp/contractors/${s.id}`,
        attachments: files.length ? files : undefined,
        keepAttachments: keep,
      });
      if (status === "SENT") {
        if (keep) keptFiles = true;
        room -= cost;
        results.push({ id, name: s.name, result: "sent", note: msg.includePortalLink && !portalUrl ? "Sent without the portal button (their page is turned off)" : undefined });
      } else {
        const note = status === "OFF" ? "\"Email to subs\" is turned off in Email Settings" : status === "SKIPPED" ? "Email isn't set up on this server" : "No one to send it to";
        results.push({ id, name: s.name, result: "failed", note });
      }
    } catch (e) {
      results.push({ id, name: s.name, result: "failed", note: (e instanceof Error ? e.message : String(e)).slice(0, 200) });
    }
  }
  return { results, remaining: Math.max(0, room) };
}
