/**
 * COI requests from the public request link (/coi-request/[token]). Each
 * project can have its own link; there's also one general link (token in
 * AppSetting) where the requester types the project instead.
 */

import { prisma } from "@/lib/prisma";
import { buildCoiRequestAlertEmail, sendEmail } from "@/lib/email";
import { inputToCents } from "./money";

export const GENERAL_TOKEN_KEY = "coiRequestToken";

export const REQUEST_STATUSES = [
  { value: "NEW", label: "New" },
  { value: "PENDING_REVIEW", label: "With broker" },
  { value: "DONE", label: "Done" },
  { value: "CANCELLED", label: "Cancelled" },
] as const;

export function requestStatusLabel(v: string): string {
  return REQUEST_STATUSES.find((s) => s.value === v)?.label ?? v;
}

export const OPEN_STATUSES = ["NEW", "PENDING_REVIEW"];

export type RequestHolder = { name: string; address: string | null };

export function requestHolders(json: unknown): RequestHolder[] {
  if (!Array.isArray(json)) return [];
  return json
    .map((h) => (h && typeof h === "object" ? (h as Record<string, unknown>) : {}))
    .map((h) => ({ name: typeof h.name === "string" ? h.name : "", address: typeof h.address === "string" && h.address ? h.address : null }))
    .filter((h) => h.name);
}

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://sueep.com";
}

export function requestLinkUrl(token: string): string {
  return `${siteUrl()}/coi-request/${token}`;
}

/** The project a link belongs to, `{ project: null }` for the general link, or null if the token is unknown. */
export async function resolveRequestToken(token: string): Promise<{ project: { id: string; jobTitle: string } | null } | null> {
  if (!token || token.length < 16) return null;
  const project = await prisma.project.findUnique({ where: { coiRequestToken: token }, select: { id: true, jobTitle: true, status: true } });
  if (project) return project.status === "ARCHIVED" ? null : { project: { id: project.id, jobTitle: project.jobTitle } };
  const general = await prisma.appSetting.findUnique({ where: { key: GENERAL_TOKEN_KEY } });
  return general?.value === token ? { project: null } : null;
}

const MAX_SAMPLE = 4 * 1024 * 1024;
const SAMPLE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"];
const MAX_HOLDERS = 10;

function text(form: FormData, key: string, max = 2000): string | null {
  const v = form.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, max);
  return t || null;
}

/** Validates the public request form. Money fields are dollar text. */
export async function parseRequestForm(form: FormData) {
  const requesterName = text(form, "requesterName", 200);
  const requesterEmail = text(form, "requesterEmail", 200);
  if (!requesterName) return { error: "Your name is required" } as const;
  if (!requesterEmail || !/^\S+@\S+\.\S+$/.test(requesterEmail)) return { error: "A valid email is required" } as const;

  const names = form.getAll("holderName").map((v) => (typeof v === "string" ? v.trim().slice(0, 300) : ""));
  const addresses = form.getAll("holderAddress").map((v) => (typeof v === "string" ? v.trim().slice(0, 1000) : ""));
  const holders = names.map((name, i) => ({ name, address: addresses[i] || null })).filter((h) => h.name);
  if (!holders.length) return { error: "Add at least one certificate holder" } as const;
  if (holders.length > MAX_HOLDERS) return { error: `At most ${MAX_HOLDERS} certificate holders per request` } as const;

  const money: Record<string, number | null> = {};
  for (const key of ["reqGlOccurrenceCents", "reqGlAggregateCents", "reqAutoCents", "reqUmbrellaCents", "reqWcEmployersLiabilityCents"]) {
    const raw = text(form, key, 30);
    const cents = raw ? inputToCents(raw) : null;
    if (raw && (cents == null || cents < 0)) return { error: "Coverage amounts must be dollar amounts" } as const;
    money[key] = cents;
  }

  const neededRaw = text(form, "neededBy", 10);
  const neededBy = neededRaw && /^\d{4}-\d{2}-\d{2}$/.test(neededRaw) ? new Date(`${neededRaw}T00:00:00.000Z`) : null;

  let sample: { sampleFilename: string; sampleMimeType: string; sampleData: Buffer } | null = null;
  const file = form.get("sample");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_SAMPLE) return { error: "Sample file too large (max 4 MB)" } as const;
    const type = file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "");
    if (!SAMPLE_TYPES.includes(type)) return { error: "Sample must be a PDF or image" } as const;
    sample = { sampleFilename: file.name.slice(0, 200) || "sample", sampleMimeType: type, sampleData: Buffer.from(await file.arrayBuffer()) };
  }

  const yes = (k: string) => form.get(k) === "on" || form.get(k) === "true";

  return {
    data: {
      requesterName,
      requesterEmail,
      requesterCompany: text(form, "requesterCompany", 200),
      requesterPhone: text(form, "requesterPhone", 50),
      projectText: text(form, "projectText", 300),
      neededBy,
      holders,
      reqGlOccurrenceCents: money.reqGlOccurrenceCents,
      reqGlAggregateCents: money.reqGlAggregateCents,
      reqAutoCents: money.reqAutoCents,
      reqUmbrellaCents: money.reqUmbrellaCents,
      reqWcEmployersLiabilityCents: money.reqWcEmployersLiabilityCents,
      requiresAdditionalInsured: yes("requiresAdditionalInsured"),
      requiresWaiverOfSubrogation: yes("requiresWaiverOfSubrogation"),
      requiresPrimaryNoncontributory: yes("requiresPrimaryNoncontributory"),
      additionalInsureds: text(form, "additionalInsureds"),
      specialWording: text(form, "specialWording", 4000),
      notes: text(form, "notes"),
      ...(sample ?? {}),
    },
  } as const;
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/** Emails whoever is set for "COI request received" on the Notifications page (also editable on the Requests tab). Never throws. */
export async function notifyNewRequest(req: {
  id: string;
  projectId: string | null;
  projectTitle: string | null;
  projectText: string | null;
  requesterName: string;
  requesterCompany: string | null;
  holders: RequestHolder[];
  neededBy: Date | null;
}) {
  try {
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://app.sueep.com").replace(/\/$/, "");
    // /erp/... works on both the app subdomain and the main site.
    const link = req.projectId ? `${appUrl}/erp/projects/${req.projectId}?tab=COIs` : `${appUrl}/erp/insurance/requests`;
    const project = req.projectTitle ?? req.projectText ?? "No project given";
    const needed = req.neededBy ? req.neededBy.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : null;
    // Recipients are set on the Notifications page (and the Requests tab); nobody set means no email.
    await sendEmail({
      type: "COI_REQUEST_RECEIVED",
      link: req.projectId ? `/erp/projects/${req.projectId}` : "/erp/insurance/requests",
      subject: `COI request: ${project}`,
      html: buildCoiRequestAlertEmail({
        requesterName: req.requesterName,
        requesterCompany: req.requesterCompany,
        project,
        holders: req.holders.map((h) => h.name),
        neededBy: needed,
        url: link,
      }),
    });
  } catch (e) {
    console.error("COI request notification failed:", e);
  }
}

/** Email that sends a GC or property manager their COI request link. */
export function buildRequestLinkEmailHtml(opts: { projectTitle: string | null; url: string; message: string | null }): string {
  const message = opts.message ? `<p style="white-space:pre-line">${esc(opts.message)}</p>` : "";
  const forWhat = opts.projectTitle ? ` for <strong>${esc(opts.projectTitle)}</strong>` : "";
  const reuse = opts.projectTitle ? "every certificate you need on this project" : "any certificate you need from us";
  return `<div style="font-family:Arial,sans-serif;font-size:14px;color:#111827;line-height:1.5">
<p>Hello,</p>
${message}
<p>Use the link below to request a certificate of insurance from Sueep${forWhat}. Tell us who the certificate is for and what it needs, and attach a sample if you have one.</p>
<p><a href="${opts.url}" style="display:inline-block;background:#E73C6E;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:bold">Request a COI</a></p>
<p style="color:#6b7280;font-size:12px">You can use this same link for ${reuse}.<br/>${esc(opts.url)}</p>
<p>Thank you,<br/>Sueep</p>
</div>`;
}

const MAX_RECIPIENTS = 5;

/** Parses "a@x.com, b@y.com" into addresses, or an error message. */
export function parseRecipients(raw: unknown): { to: string[] } | { error: string } {
  const to = String(raw ?? "")
    .split(/[,;\s]+/)
    .map((e) => e.trim())
    .filter(Boolean);
  if (!to.length) return { error: "Enter an email address" };
  if (to.length > MAX_RECIPIENTS) return { error: `At most ${MAX_RECIPIENTS} addresses at a time` };
  const bad = to.find((e) => !/^\S+@\S+\.\S+$/.test(e));
  if (bad) return { error: `"${bad}" is not a valid email` };
  return { to };
}

/** Emails a request link to each address, with replies going to the sender. Throws if sending fails. */
export async function sendRequestLinkEmails(opts: { to: string[]; url: string; projectTitle: string | null; message: string | null; replyTo: string }) {
  const subject = opts.projectTitle ? `Request a certificate of insurance: ${opts.projectTitle}` : "Request a certificate of insurance from Sueep";
  for (const address of opts.to) {
    await sendEmail({
      type: "COI_REQUEST_LINK",
      link: "/erp/insurance/requests",
      to: address,
      subject,
      html: buildRequestLinkEmailHtml({ projectTitle: opts.projectTitle, url: opts.url, message: opts.message }),
      replyTo: opts.replyTo,
    });
  }
}
