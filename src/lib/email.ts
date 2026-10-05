import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import { NOTIFICATIONS, type EmailType, type SenderKind } from "@/lib/notificationTypes";
import { getNotificationSetting } from "@/lib/notificationSettings";
import { getErpAuth } from "@/lib/erpAuth";

const FROM_EMAIL = process.env.RESEND_FROM || "Sueep Website <noreply@mail.sueep.com>";
/** Just the address out of RESEND_FROM, so each email can carry its own sender name. */
const FROM_ADDRESS = (FROM_EMAIL.match(/<([^>]+)>/)?.[1] ?? FROM_EMAIL).trim();
const SENDER_NAME: Record<SenderKind, string> = { erp: "Sueep ERP", sueep: "Sueep", website: "Sueep Website" };

type Attachment = { filename: string; content: Buffer };

/**
 * Sends one email of a given type. The type's setting on the Notifications
 * page can turn it off or add copies; the email is wrapped in the shared
 * layout and recorded in the Email Log. Throws when the provider rejects it,
 * same as before, so callers keep their own error handling.
 */
export async function sendEmail(options: {
  type: EmailType;
  /** Leave out for types whose recipients are set on the Notifications page (toMode "recipients"). */
  to?: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
  cc?: string[];
  bcc?: string[];
  attachments?: Attachment[];
  /** ERP page this email is about, e.g. /erp/projects/abc, shown in the log */
  link?: string;
}): Promise<"SENT" | "OFF" | "SKIPPED" | "NO_RECIPIENTS"> {
  const def = NOTIFICATIONS[options.type];
  const setting = await getNotificationSetting(options.type);
  const given = options.to == null ? [] : Array.isArray(options.to) ? options.to : [options.to];
  const to = uniqueAddresses(given.length || def.toMode !== "recipients" ? given : setting.to);
  const cc = uniqueAddresses([...(options.cc ?? []), ...setting.cc]).filter((e) => !to.includes(e));
  const html = def.layout ? wrapEmailLayout(options.html, options.type) : options.html;
  // Worker and client emails come from a noreply address, so a reply would
  // be lost. When someone in the ERP sent it, replies go to them instead.
  const replyTo = options.replyTo ?? (def.sender === "sueep" ? await signedInEmail() : undefined);
  const base = { type: options.type, to, cc, bcc: options.bcc ?? [], replyTo, subject: options.subject, html, attachments: options.attachments, link: options.link };

  if (!to.length) return "NO_RECIPIENTS";
  if (!setting.enabled) {
    await logEmail({ ...base, status: "OFF" });
    return "OFF";
  }
  const { id } = await deliverEmail(base);
  return id === null && !process.env.RESEND_API_KEY ? "SKIPPED" : "SENT";
}

/** Sends already-final HTML and logs the result. Used by sendEmail and the log's Resend button. */
export async function deliverEmail(e: {
  type: string;
  to: string[];
  cc: string[];
  bcc: string[];
  replyTo?: string | null;
  subject: string;
  html: string;
  attachments?: Attachment[];
  link?: string | null;
  resentFromId?: string;
  sentBy?: string;
}): Promise<{ id: string | null }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("Resend API key not configured, email not sent:", e.subject, e.to);
    await logEmail({ ...e, status: "SKIPPED", error: "Email isn't set up on this server (no RESEND_API_KEY)" });
    return { id: null };
  }

  const sender = e.type in NOTIFICATIONS ? NOTIFICATIONS[e.type as EmailType].sender : "erp";
  try {
    const { data, error } = await new Resend(apiKey).emails.send({
      from: `${SENDER_NAME[sender]} <${FROM_ADDRESS}>`,
      to: e.to,
      subject: e.subject,
      html: e.html,
      reply_to: e.replyTo ?? undefined,
      cc: e.cc.length ? e.cc : undefined,
      bcc: e.bcc.length ? e.bcc : undefined,
      attachments: e.attachments?.map((a) => ({ filename: a.filename, content: a.content })),
    });
    if (error) throw new Error(`Resend error: ${error.message}`);
    await logEmail({ ...e, status: "SENT", providerId: data?.id ?? null });
    return { id: data?.id ?? null };
  } catch (err) {
    await logEmail({ ...e, status: "FAILED", error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}

async function logEmail(e: {
  type: string;
  to: string[];
  cc: string[];
  bcc: string[];
  replyTo?: string | null;
  subject: string;
  html: string;
  attachments?: Attachment[];
  link?: string | null;
  resentFromId?: string;
  sentBy?: string;
  status: "SENT" | "FAILED" | "SKIPPED" | "OFF";
  error?: string;
  providerId?: string | null;
}) {
  // A logging problem must never stop or fail the email itself.
  try {
    await prisma.emailLog.create({
      data: {
        type: e.type,
        to: e.to,
        cc: e.cc,
        bcc: e.bcc,
        replyTo: e.replyTo ?? null,
        subject: e.subject,
        status: e.status,
        error: e.error?.slice(0, 2000) ?? null,
        providerId: e.providerId ?? null,
        html: e.html,
        hasAttachments: !!e.attachments?.length,
        link: e.link ?? null,
        resentFromId: e.resentFromId ?? null,
        sentBy: e.sentBy ?? null,
      },
    });
  } catch (err) {
    console.error("Could not write email log", err);
  }
}

/** The ERP user behind this request, or undefined (cron jobs, public forms, scripts). */
async function signedInEmail(): Promise<string | undefined> {
  try {
    return (await getErpAuth())?.email || undefined;
  } catch {
    return undefined;
  }
}

function uniqueAddresses(list: string[]): string[] {
  const out: string[] = [];
  for (const raw of list) {
    const e = raw?.trim();
    if (e && !out.some((x) => x.toLowerCase() === e.toLowerCase())) out.push(e);
  }
  return out;
}

function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim() || "").replace(/\/$/, "");
}

/**
 * The shared frame around every email: Sueep logo on top, the email's own
 * content, and a footer saying why you got it. Staff emails point to the
 * Notifications page; worker and client emails get a contact line instead.
 */
export function wrapEmailLayout(body: string, type: EmailType): string {
  const def = NOTIFICATIONS[type];
  const base = appBaseUrl();
  const logo = base
    ? `<img src="${escapeHtml(base)}/sueeplogo.png" alt="Sueep" width="64" height="32" style="display:block;height:32px;width:auto;border:0">`
    : `<span style="font-size:20px;font-weight:bold;color:#E73C6E;letter-spacing:1px">SUEEP</span>`;
  const contact = (process.env.CONTACT_TO_EMAIL || "contact@sueep.com").trim();
  const footer =
    def.sender === "erp"
      ? `You got this "${escapeHtml(def.label)}" email from the Sueep ERP.${
          base ? ` Admins and PMs can change who gets it on the <a href="${escapeHtml(base)}/erp/notifications" style="color:#6b7280">Notifications page</a>.` : ""
        }`
      : `Sueep. Questions? Email <a href="mailto:${escapeHtml(contact)}" style="color:#6b7280">${escapeHtml(contact)}</a>.`;
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f3f4f6">
  <div style="background:#f3f4f6;padding:24px 12px;font-family:Arial,Helvetica,sans-serif">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
      <div style="padding:16px 24px;border-bottom:3px solid #E73C6E">${logo}</div>
      <div style="padding:20px 24px;font-size:14px;color:#111;line-height:1.6">${body}</div>
      <div style="padding:14px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;line-height:1.5">${footer}</div>
    </div>
  </div>
</body></html>`;
}

export function formatUsd(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
    cents / 100
  );
}

export function buildTurnoverRequestEmailHtml(params: {
  buildingName: string;
  unitNumber?: string | null;
  requestType: string;
  bedrooms?: number | null;
  bathrooms?: number | null;
  services: string[];
  startDate?: string | null;
  endDate?: string | null;
  priceLabel: string;
  createdBy?: string | null;
  sueepPmName?: string | null;
}) {
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.5">
      <h2 style="margin-bottom:12px">New Turnover Request Created</h2>
      <p><strong>Building:</strong> ${escapeHtml(params.buildingName)}</p>
      <p><strong>Unit:</strong> ${escapeHtml(params.unitNumber || "N/A")}</p>
      <p><strong>Request type:</strong> ${escapeHtml(params.requestType)}</p>
      <p><strong>Bedrooms / Bathrooms:</strong> ${escapeHtml(String(params.bedrooms ?? "N/A"))} / ${escapeHtml(
    String(params.bathrooms ?? "N/A")
  )}</p>
      <p><strong>Services:</strong> ${escapeHtml(params.services.join(", "))}</p>
      <p><strong>Dates:</strong> ${escapeHtml(params.startDate || "N/A")} to ${escapeHtml(params.endDate || "N/A")}</p>
      <p><strong>Price:</strong> ${escapeHtml(params.priceLabel)}</p>
      <p><strong>SUEEP PM:</strong> ${escapeHtml(params.sueepPmName || "N/A")}</p>
      <p><strong>Created by:</strong> ${escapeHtml(params.createdBy || "system")}</p>
    </div>
  `;
}

export function buildJanitorialTurnoverProjectEmailHtml(params: {
  projectTitle: string;
  propertyName?: string | null;
  propertyAddress?: string | null;
  managerName?: string | null;
  sueepPmName?: string | null;
  unitNumbers?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  estimatedTotal?: string | null;
  details?: string | null;
  projectUrl?: string | null;
}) {
  const details = params.details
    ? `<div style="white-space:pre-line;margin-top:12px;padding:12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px">${escapeHtml(
        params.details
      )}</div>`
    : "";
  const projectLink = params.projectUrl
    ? `<p style="margin:20px 0"><a href="${escapeHtml(
        params.projectUrl
      )}" style="background:#E73C6E;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold">View project details</a></p>`
    : "";

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.5;max-width:640px">
      <h2 style="margin-bottom:12px;color:#E73C6E">New Janitorial Turnover Submitted</h2>
      <p>A new janitorial turnover project has been submitted for your review.</p>
      <p><strong>Project:</strong> ${escapeHtml(params.projectTitle)}</p>
      <p><strong>Property:</strong> ${escapeHtml(params.propertyName || "N/A")}</p>
      <p><strong>Address:</strong> ${escapeHtml(params.propertyAddress || "N/A")}</p>
      <p><strong>Property Manager/Maintenance Manager:</strong> ${escapeHtml(params.managerName || "N/A")}</p>
      <p><strong>SUEEP PM:</strong> ${escapeHtml(params.sueepPmName || "N/A")}</p>
      <p><strong>Units:</strong> ${escapeHtml(params.unitNumbers || "N/A")}</p>
      <p><strong>Dates:</strong> ${escapeHtml(params.startDate || "N/A")} to ${escapeHtml(params.endDate || "N/A")}</p>
      <p><strong>Estimated total:</strong> ${escapeHtml(params.estimatedTotal || "N/A")}</p>
      ${projectLink}
      ${details}
    </div>
  `;
}

export function buildPaperworkUploadEmail(params: {
  fullName: string;
  uploadUrl: string;
  documents: string[];
  expiryDays?: number;
}) {
  const docList = params.documents
    .map((d) => `<li style="margin-bottom:6px">${escapeHtml(d)}</li>`)
    .join("");
  const days = params.expiryDays ?? 7;
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.6;max-width:560px">
      <h2 style="margin-bottom:8px;color:#E73C6E">Action required: upload your onboarding documents</h2>
      <p>Hi ${escapeHtml(params.fullName)},</p>
      <p>Congratulations on moving forward with Sueep! To complete your onboarding we need you to upload the following documents:</p>
      <ul style="margin:12px 0;padding-left:20px">${docList}</ul>
      <p>Use the secure link below. No account required, and the link expires in ${days} days.</p>
      <p style="margin:20px 0">
        <a href="${escapeHtml(params.uploadUrl)}"
           style="background:#E73C6E;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold">
          Upload my documents
        </a>
      </p>
      <p style="font-size:12px;color:#555">Or copy this link into your browser:<br/>${escapeHtml(params.uploadUrl)}</p>
      <p style="font-size:12px;color:#888;margin-top:24px">If you weren't expecting this email, please ignore it.</p>
    </div>
  `;
}

export function buildContractorDocUploadEmail(params: {
  name: string;
  uploadUrl: string;
  documents: string[];
  expiryDays?: number;
}) {
  const docList = params.documents
    .map((d) => `<li style="margin-bottom:6px">${escapeHtml(d)}</li>`)
    .join("");
  const days = params.expiryDays ?? 7;
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.6;max-width:560px">
      <h2 style="margin-bottom:8px;color:#E73C6E">Action required: upload your documents</h2>
      <p>Hi ${escapeHtml(params.name)},</p>
      <p>Please upload the following documents using the secure link below. No account required, and the link expires in ${days} days.</p>
      <ul style="margin:12px 0;padding-left:20px">${docList}</ul>
      <p style="margin:20px 0">
        <a href="${escapeHtml(params.uploadUrl)}"
           style="background:#E73C6E;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold">
          Upload documents
        </a>
      </p>
      <p style="font-size:12px;color:#555">Or copy this link into your browser:<br/>${escapeHtml(params.uploadUrl)}</p>
      <p style="font-size:12px;color:#888;margin-top:24px">If you weren't expecting this email, please ignore it.</p>
    </div>
  `;
}

export function buildContractorInfoEmail(params: {
  name: string;
  infoUrl: string;
  expiryDays?: number;
}) {
  const days = params.expiryDays ?? 7;
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.6;max-width:560px">
      <h2 style="margin-bottom:8px;color:#E73C6E">Action required: complete your contractor information</h2>
      <p>Hi ${escapeHtml(params.name)},</p>
      <p>Please complete the contractor information form using the secure link below. You will be asked to provide your personal details, banking information, and insurance status.</p>
      <p>No account required, and the link expires in ${days} days.</p>
      <p style="margin:20px 0">
        <a href="${escapeHtml(params.infoUrl)}"
           style="background:#E73C6E;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold">
          Complete my information
        </a>
      </p>
      <p style="font-size:12px;color:#555">Or copy this link into your browser:<br/>${escapeHtml(params.infoUrl)}</p>
      <p style="font-size:12px;color:#888;margin-top:24px">If you weren't expecting this email, please ignore it.</p>
    </div>
  `;
}

export function buildEmployeeInfoEmail(params: {
  name: string;
  infoUrl: string;
  expiryDays?: number;
}) {
  const days = params.expiryDays ?? 7;
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.6;max-width:560px">
      <h2 style="margin-bottom:8px;color:#E73C6E">Action required: complete your employee information</h2>
      <p>Hi ${escapeHtml(params.name)},</p>
      <p>Please complete the employee information form using the secure link below. You will be asked to provide your address, date of birth, banking information, and SSN.</p>
      <p>No account required, and the link expires in ${days} days.</p>
      <p style="margin:20px 0">
        <a href="${escapeHtml(params.infoUrl)}"
           style="background:#E73C6E;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold">
          Complete my information
        </a>
      </p>
      <p style="font-size:12px;color:#555">Or copy this link into your browser:<br/>${escapeHtml(params.infoUrl)}</p>
      <p style="font-size:12px;color:#888;margin-top:24px">If you weren't expecting this email, please ignore it.</p>
    </div>
  `;
}

export function buildChangeOrderNotificationEmail(params: {
  recipientName: string;
  projectTitle: string;
  coTitle: string;
  coStatus: string;
  estimatedCost: string;
  estimatedDays: number | null;
  description: string | null;
  reason: string | null;
  requestedBy: string | null;
  changeOrderUrl: string | null;
}) {
  const projectLink = params.changeOrderUrl
    ? `<p style="margin:20px 0"><a href="${escapeHtml(params.changeOrderUrl)}" style="background:#E73C6E;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold">View change order details</a></p>`
    : "";
  const description = params.description
    ? `<p><strong>Description:</strong> ${escapeHtml(params.description)}</p>`
    : "";
  const reason = params.reason
    ? `<p><strong>Reason:</strong> ${escapeHtml(params.reason)}</p>`
    : "";
  const requestedBy = params.requestedBy
    ? `<p><strong>Requested by:</strong> ${escapeHtml(params.requestedBy)}</p>`
    : "";

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.6;max-width:640px">
      <h2 style="margin-bottom:12px;color:#E73C6E">Change Order Notification</h2>
      <p>Hi ${escapeHtml(params.recipientName)},</p>
      <p>A change order has been submitted for your review on the following project.</p>
      <p><strong>Project:</strong> ${escapeHtml(params.projectTitle)}</p>
      <p><strong>Change order:</strong> ${escapeHtml(params.coTitle)}</p>
      <p><strong>Status:</strong> ${escapeHtml(params.coStatus)}</p>
      <p><strong>Estimated cost:</strong> ${escapeHtml(params.estimatedCost)}</p>
      <p><strong>Schedule impact:</strong> ${params.estimatedDays != null ? `${params.estimatedDays} day(s)` : "N/A"}</p>
      ${requestedBy}
      ${description}
      ${reason}
      ${projectLink}
    </div>
  `;
}

export function buildWorkOrderNotificationEmailHtml(params: {
  recipientName: string;
  projectName: string;
  siteAddress: string;
  contacts: string;
  startDate: string;
  serviceType: string;
  notes: string;
  projectUrl: string | null;
}) {
  const projectLink = params.projectUrl
    ? `<p style="margin:20px 0"><a href="${escapeHtml(params.projectUrl)}" style="background:#E73C6E;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold">View Project</a></p>`
    : "";
  const notesBlock = params.notes
    ? `<div style="margin-top:16px;padding:12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;white-space:pre-line">${escapeHtml(params.notes)}</div>`
    : "";
  const contactsBlock = params.contacts
    ? `<p><strong>Main Point of Contacts:</strong></p><div style="margin-left:16px;white-space:pre-line">${escapeHtml(params.contacts)}</div>`
    : "";

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.6;max-width:640px">
      <h2 style="margin-bottom:12px;color:#E73C6E">Job Brief</h2>
      <p>Hi ${escapeHtml(params.recipientName)},</p>
      <p>A job brief has been created for the following project and assigned to you for review.</p>
      <p><strong>Project Name:</strong> ${escapeHtml(params.projectName)}</p>
      <p><strong>Site Address:</strong> ${escapeHtml(params.siteAddress || "N/A")}</p>
      ${contactsBlock}
      <p><strong>Starting Date (Estimated):</strong> ${escapeHtml(params.startDate || "N/A")}</p>
      <p><strong>Service Type:</strong> ${escapeHtml(params.serviceType || "N/A")}</p>
      ${notesBlock}
      ${projectLink}
      <p style="font-size:12px;color:#888;margin-top:24px">Please log in to the project portal to review the full details.</p>
    </div>
  `;
}

export function buildProjectRequestEmail(params: {
  type: "change-order" | "sov-schedule";
  projectTitle: string;
  requesterName: string;
  requesterEmail: string;
  // CO fields
  coTitle?: string;
  coDescription?: string;
  coEstimatedStartDate?: string;
  coEstimatedEndDate?: string;
  coCleanerCount?: number;
  coSupervisorCount?: number;
  /** Only set when the project has a real Labor rate — see
   * hasCustomChangeOrderLaborRate. */
  coQuotedPriceCents?: number;
  // SOV fields
  sovDescription?: string;
  desiredDate?: string;
  comments?: string;
  projectUrl: string | null;
}) {
  const typeLabel = params.type === "change-order" ? "Change Order Request" : "SOV Work Scheduling Request";

  const crewLine =
    params.coCleanerCount || params.coSupervisorCount
      ? `<p><strong>Requested Crew:</strong> ${params.coCleanerCount ?? 0} cleaner(s), ${params.coSupervisorCount ?? 0} supervisor(s), 8-hr day</p>`
      : "";
  const priceLine =
    params.coQuotedPriceCents != null
      ? `<p><strong>Quoted Price (this project's Labor rates):</strong> ${formatUsd(params.coQuotedPriceCents)}</p>`
      : "";

  const details =
    params.type === "change-order"
      ? `
        <p><strong>Change Order Title:</strong> ${escapeHtml(params.coTitle ?? "")}</p>
        ${params.coDescription ? `<p><strong>Description / Scope:</strong> ${escapeHtml(params.coDescription)}</p>` : ""}
        ${params.coEstimatedStartDate ? `<p><strong>Estimated Start Date:</strong> ${escapeHtml(params.coEstimatedStartDate)}</p>` : ""}
        ${params.coEstimatedEndDate ? `<p><strong>Estimated End Date:</strong> ${escapeHtml(params.coEstimatedEndDate)}</p>` : ""}
        ${crewLine}
        ${priceLine}
      `
      : `
        <p><strong>SOV Item:</strong> ${escapeHtml(params.sovDescription ?? "")}</p>
        ${params.desiredDate ? `<p><strong>Desired Date:</strong> ${escapeHtml(params.desiredDate)}</p>` : ""}
        ${params.comments ? `<p><strong>Comments:</strong> ${escapeHtml(params.comments)}</p>` : ""}
      `;

  const ctaLabel = params.type === "change-order" ? "View change order in ERP" : "View project in ERP";
  const cta = params.projectUrl
    ? `<p style="margin:20px 0"><a href="${escapeHtml(params.projectUrl)}" style="background:#E73C6E;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold">${ctaLabel}</a></p>`
    : "";

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.6;max-width:640px">
      <h2 style="margin-bottom:12px;color:#E73C6E">${typeLabel}</h2>
      <p>A request has been submitted by <strong>${escapeHtml(params.requesterName)}</strong> (${escapeHtml(params.requesterEmail)}) for the following project.</p>
      <p><strong>Project:</strong> ${escapeHtml(params.projectTitle)}</p>
      ${details}
      ${cta}
      <p style="margin-top:24px;font-size:13px;color:#6b7280">The Sueep Team</p>
    </div>
  `;
}

export function buildProjectRequestConfirmationEmail(params: {
  type: "change-order" | "sov-schedule";
  projectTitle: string;
  requesterName: string;
  coTitle?: string;
  coEstimatedStartDate?: string;
  coEstimatedEndDate?: string;
  /** Only set when the project has a real Labor rate — see
   * hasCustomChangeOrderLaborRate. */
  coQuotedPriceCents?: number;
  sovDescription?: string;
  desiredDate?: string;
}) {
  const typeLabel = params.type === "change-order" ? "change order request" : "scheduling request";
  const detail =
    params.type === "change-order"
      ? `<p><strong>Change Order:</strong> ${escapeHtml(params.coTitle ?? "")}</p>
         ${params.coEstimatedStartDate ? `<p><strong>Estimated Start Date:</strong> ${escapeHtml(params.coEstimatedStartDate)}</p>` : ""}
         ${params.coEstimatedEndDate ? `<p><strong>Estimated End Date:</strong> ${escapeHtml(params.coEstimatedEndDate)}</p>` : ""}
         ${params.coQuotedPriceCents != null ? `<p><strong>Estimated Price:</strong> ${formatUsd(params.coQuotedPriceCents)}</p>` : ""}`
      : `
          <p><strong>SOV Item:</strong> ${escapeHtml(params.sovDescription ?? "")}</p>
          ${params.desiredDate ? `<p><strong>Desired Date:</strong> ${escapeHtml(params.desiredDate)}</p>` : ""}
        `;

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.6;max-width:640px">
      <h2 style="margin-bottom:12px;color:#E73C6E">Request received</h2>
      <p>Hi ${escapeHtml(params.requesterName)},</p>
      <p>We've received your ${typeLabel} for <strong>${escapeHtml(params.projectTitle)}</strong>. The project supervisor and Sueep PM have been notified and will be in touch shortly.</p>
      ${detail}
      <p style="margin-top:24px;font-size:13px;color:#6b7280">The Sueep Team</p>
    </div>
  `;
}

export function buildTurnoverMarginAlertEmail(params: {
  jobTitle: string;
  severity: "watch" | "critical" | "bad";
  hoursLogged: number;
  hoursBudget: number;
  marginPct: number;
  projectUrl: string | null;
}) {
  const color =
    params.severity === "bad" ? "#dc2626" : params.severity === "critical" ? "#ea580c" : "#d97706";
  const headline =
    params.severity === "bad"
      ? "Turnover is now losing money on labor"
      : params.severity === "critical"
        ? "Turnover margin has dropped below 30%"
        : "Turnover has gone over its hours budget";

  const cta = params.projectUrl
    ? `<p style="margin:20px 0"><a href="${escapeHtml(params.projectUrl)}" style="background:#E73C6E;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold">View labor log</a></p>`
    : "";

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.6;max-width:640px">
      <h2 style="margin-bottom:12px;color:${color}">${headline}</h2>
      <p><strong>Project:</strong> ${escapeHtml(params.jobTitle)}</p>
      <p><strong>Hours logged:</strong> ${params.hoursLogged.toFixed(1)} of a ${params.hoursBudget.toFixed(1)} hr budget</p>
      <p><strong>Implied margin:</strong> ~${params.marginPct.toFixed(0)}% (target: 50%)</p>
      ${cta}
      <p style="margin-top:24px;font-size:13px;color:#6b7280">The Sueep Team</p>
    </div>
  `;
}

export function buildScheduleNudgeEmail(params: {
  cadence: "morning" | "midday";
  projects: { id: string; jobTitle: string }[];
  scheduleUrl: string;
}) {
  const headline = params.cadence === "morning" ? "Today's unscheduled projects" : "Still unscheduled for today";
  const intro =
    params.cadence === "morning"
      ? "These active projects of yours haven't been scheduled for today yet. Click one to schedule it:"
      : "It's midday and these active projects of yours still haven't been scheduled for today:";
  // Each project opens today's "assign a supervisor" window for it on the Schedule.
  const items = params.projects
    .map((p) => `<li><a href="${escapeHtml(`${params.scheduleUrl}?scheduleProjectId=${encodeURIComponent(p.id)}`)}" style="color:#E73C6E">${escapeHtml(p.jobTitle)}</a></li>`)
    .join("");

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.6;max-width:640px">
      <h2 style="margin-bottom:12px;color:#E73C6E">${headline}</h2>
      <p>${intro}</p>
      <ul style="margin:12px 0 20px;padding-left:20px">${items}</ul>
      <p style="margin:20px 0"><a href="${escapeHtml(params.scheduleUrl)}" style="background:#E73C6E;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold">Open Schedule</a></p>
      <p style="margin-top:24px;font-size:13px;color:#6b7280">The Sueep Team</p>
    </div>
  `;
}

const TIME_OFF_TYPE_LABELS: Record<string, string> = {
  VACATION: "Vacation",
  SICK: "Sick",
  HALF_DAY: "Half Day",
  UNPAID: "Unpaid",
  OTHER: "Other",
};

export function buildTimeOffLoggedEmail(params: {
  personName: string;
  personKind: "Employee" | "Contractor";
  type: string;
  startDate: Date;
  endDate: Date;
  days: number;
  notes: string | null;
}) {
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  const range = params.startDate.getTime() === params.endDate.getTime() ? fmt(params.startDate) : `${fmt(params.startDate)} – ${fmt(params.endDate)}`;
  const typeLabel = TIME_OFF_TYPE_LABELS[params.type] ?? params.type;
  const dayLabel = `${params.days} day${params.days === 1 ? "" : "s"}`;

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.6;max-width:640px">
      <h2 style="margin-bottom:12px;color:#E73C6E">Time off logged</h2>
      <p><strong>${escapeHtml(params.personName)}</strong> (${params.personKind})</p>
      <p><strong>Type:</strong> ${escapeHtml(typeLabel)}</p>
      <p><strong>Dates:</strong> ${escapeHtml(range)} (${dayLabel})</p>
      ${params.notes ? `<p><strong>Notes:</strong> ${escapeHtml(params.notes)}</p>` : ""}
      <p style="margin-top:24px;font-size:13px;color:#6b7280">The Sueep Team</p>
    </div>
  `;
}

// turnoverCompletedAt/projectDate are calendar-day labels stored as UTC
// midnight (see the date convention notes in dates.ts), so this reads
// calendar components back with an explicit UTC timeZone rather than
// whatever zone the server process happens to be running in.
function formatCompletedLabel(completedAt: Date, today: Date): string {
  const diffDays = Math.round((today.getTime() - completedAt.getTime()) / 86400000);
  const dateStr = completedAt.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
  if (diffDays === 0) return `completed today, ${dateStr}`;
  const weekday = completedAt.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long" });
  return `completed ${weekday}, ${dateStr}`;
}

export function buildTurnoverCompletionDigestEmail(params: {
  buildingName: string;
  buildingAddress: string;
  /** "Today," as a UTC-midnight Date, same anchor the digest cron used to
   * decide what counts as recent, so the per-unit labels below line up with
   * however the subject line phrased things. */
  today: Date;
  units: { jobTitle: string; unitNumber: string | null; completedAt: Date }[];
  upcoming?: { jobTitle: string; unitNumber: string | null; projectDate: Date }[];
}) {
  const items = params.units
    .map((u) => {
      const label = u.unitNumber ? `Unit ${u.unitNumber}, ${u.jobTitle}` : u.jobTitle;
      return `<li>${escapeHtml(label)}, ${escapeHtml(formatCompletedLabel(u.completedAt, params.today))}</li>`;
    })
    .join("");
  const plural = params.units.length === 1 ? "unit" : "units";
  const allToday = params.units.every((u) => Math.round((params.today.getTime() - u.completedAt.getTime()) / 86400000) === 0);

  const upcoming = params.upcoming ?? [];
  const upcomingSection =
    upcoming.length > 0
      ? `
      <p style="margin-top:24px"><strong>Upcoming turns at this building:</strong></p>
      <ul style="margin:12px 0 20px;padding-left:20px">
        ${upcoming
          .map((u) => {
            const label = u.unitNumber ? `Unit ${u.unitNumber}, ${u.jobTitle}` : u.jobTitle;
            const date = u.projectDate.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
            return `<li>${escapeHtml(label)}, ${escapeHtml(date)}</li>`;
          })
          .join("")}
      </ul>`
      : "";

  const heading = allToday
    ? `${params.units.length} ${plural} completed today at ${escapeHtml(params.buildingName)}`
    : `${params.units.length} ${plural} completed at ${escapeHtml(params.buildingName)}`;

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.6;max-width:640px">
      <h2 style="margin-bottom:12px;color:#E73C6E">${heading}</h2>
      <p>${escapeHtml(params.buildingAddress)}</p>
      <p>The following ${plural} finished turnover:</p>
      <ul style="margin:12px 0 20px;padding-left:20px">${items}</ul>
      ${upcomingSection}
      <p style="margin-top:24px;font-size:13px;color:#6b7280">The Sueep Team</p>
    </div>
  `;
}

/** Morning email listing Management calendar items that hit a reminder day. */
export function buildManagementReminderEmail(params: {
  items: { title: string; detail: string | null; category: string; date: string; when: string }[];
  calendarUrl: string;
}) {
  const rows = params.items
    .map(
      (i) => `<tr>
        <td style="padding:6px 12px 6px 0;white-space:nowrap;vertical-align:top"><strong>${escapeHtml(i.when)}</strong><br><span style="color:#6b7280;font-size:12px">${escapeHtml(i.date)}</span></td>
        <td style="padding:6px 0;vertical-align:top">${escapeHtml(i.title)}${i.detail ? `<br><span style="color:#6b7280;font-size:12px">${escapeHtml(i.detail)}</span>` : ""}<br><span style="color:#9ca3af;font-size:12px">${escapeHtml(i.category)}</span></td>
      </tr>`
    )
    .join("");
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.5;max-width:640px">
      <h2 style="margin-bottom:12px;color:#E73C6E">Coming up on the Management calendar</h2>
      <table style="border-collapse:collapse;margin:12px 0 20px">${rows}</table>
      <p style="margin:20px 0"><a href="${escapeHtml(params.calendarUrl)}" style="background:#E73C6E;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold">Open calendar</a></p>
      <p style="margin-top:24px;font-size:13px;color:#6b7280">Reminder days for each category can be changed under Categories on the calendar.</p>
    </div>
  `;
}

export function buildEmailFailuresEmail(params: {
  failures: { label: string; to: string; subject: string; error: string; url: string }[];
  logUrl: string;
}) {
  const rows = params.failures
    .map(
      (f) => `<li style="margin-bottom:10px"><a href="${escapeHtml(f.url)}" style="color:#111;font-weight:bold">${escapeHtml(f.subject)}</a><br>
        <span style="font-size:12px;color:#6b7280">${escapeHtml(f.label)}, to ${escapeHtml(f.to)}</span><br>
        <span style="font-size:12px;color:#dc2626">${escapeHtml(f.error)}</span></li>`
    )
    .join("");
  const n = params.failures.length;
  return `
    <h2 style="margin:0 0 12px;color:#dc2626">${n} email${n === 1 ? "" : "s"} failed to send</h2>
    <p>These didn't reach anyone in the last day. Open one to see it and resend it.</p>
    <ul style="margin:12px 0 20px;padding-left:20px">${rows}</ul>
    <p style="margin:20px 0"><a href="${escapeHtml(params.logUrl)}" style="${BUTTON_STYLE}">Open Email Log</a></p>
  `;
}

const BUTTON_STYLE = "background:#E73C6E;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold";

export function buildSafetyNoticeEmail(params: {
  name: string;
  projectName: string;
  checkDate: string;
  violationCount: number;
  escalated: boolean;
  threshold: number;
}) {
  const remaining = params.threshold - params.violationCount;
  const note =
    params.violationCount >= 2
      ? `<p><strong>Note:</strong> This is violation #${params.violationCount} on record. ${
          params.escalated
            ? "This has been escalated to Operations Management."
            : `${remaining === 1 ? "One more violation" : `${remaining} more violations`} will result in escalation.`
        }</p>`
      : "";
  return `
    <h2 style="margin:0 0 12px;color:#E73C6E">Safety compliance notice</h2>
    <p>Hi ${escapeHtml(params.name)},</p>
    <p>You were marked <strong>non-compliant</strong> during the daily PPE inspection on <strong>${escapeHtml(params.checkDate)}</strong> for <strong>${escapeHtml(params.projectName)}</strong>.</p>
    <p>Per Sueep policy, this must be corrected before you begin work. Please speak with your supervisor right away.</p>
    ${note}
    <p>Sueep Operations</p>
  `;
}

export function buildSafetyEscalationEmail(params: {
  workerName: string;
  projectName: string;
  checkDate: string;
  violationCount: number;
  projectUrl: string | null;
}) {
  return `
    <h2 style="margin:0 0 12px;color:#dc2626">Safety escalation: ${escapeHtml(params.workerName)}</h2>
    <p>This worker has been marked non-compliant <strong>${params.violationCount} times</strong> and has reached the escalation limit.</p>
    <p><strong>Worker:</strong> ${escapeHtml(params.workerName)}<br>
       <strong>Project:</strong> ${escapeHtml(params.projectName)}<br>
       <strong>Date:</strong> ${escapeHtml(params.checkDate)}<br>
       <strong>Violations on record:</strong> ${params.violationCount}</p>
    <p>Please review and take action per SOP PC-QA-001.</p>
    ${params.projectUrl ? `<p style="margin:20px 0"><a href="${escapeHtml(params.projectUrl)}" style="${BUTTON_STYLE}">View project</a></p>` : ""}
  `;
}

/** English and Spanish, since most janitors read the Spanish half. */
export function buildClockLinkEmail(params: { firstName: string; url: string }) {
  const name = escapeHtml(params.firstName);
  const url = escapeHtml(params.url);
  return `
    <h2 style="margin:0 0 12px;color:#E73C6E">Your clock-in link</h2>
    <p>Hi ${name},</p>
    <p>Use this link to clock in and out of your shifts. Save it to your phone's home screen so it's easy to find.</p>
    <p style="margin:20px 0"><a href="${url}" style="${BUTTON_STYLE}">Open my clock-in page</a></p>
    <p style="font-size:12px;color:#555">Or copy this link: ${url}</p>
    <p>This link is just for you, so please don't share it.</p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">
    <h2 style="margin:0 0 12px;color:#E73C6E">Tu enlace para marcar entrada</h2>
    <p>Hola ${name},</p>
    <p>Usa este enlace para marcar tu entrada y salida en tus turnos. Guárdalo en la pantalla de inicio de tu teléfono para encontrarlo fácilmente. La página está disponible en español.</p>
    <p>Este enlace es solo para ti, por favor no lo compartas.</p>
  `;
}

export function buildPropertyManagerCodeEmail(params: { firstName: string; code: string }) {
  return `
    <h2 style="margin:0 0 12px;color:#E73C6E">Your sign-in code</h2>
    <p>Hi ${escapeHtml(params.firstName)},</p>
    <p>Enter this code on your Sueep turnover page:</p>
    <p style="margin:20px 0;font-size:28px;font-weight:bold;letter-spacing:6px;color:#111827">${escapeHtml(params.code)}</p>
    <p>It works for 15 minutes. You'll only need a code once on each phone or computer.</p>
    <p style="font-size:12px;color:#555">Didn't ask for this? You can ignore this email.</p>
  `;
}

/** To staff: a new turnover request, one or more units at one building. */
export function buildPropertyManagerRequestEmail(params: {
  requester: string;
  building: string;
  start: string;
  units: { unit: string; layout: string; work: string[]; estimate: string; moveOut: string | null; moveIn: string | null }[];
  total: string | null;
  notes: string | null;
  url: string;
}) {
  const line = (label: string, value: string | null) => (value ? `<strong>${label}:</strong> ${escapeHtml(value)}<br>` : "");
  const units = params.units
    .map(
      (u) =>
        `<p>${line("Unit", `${u.unit} (${u.layout})`)}${line("Work", u.work.join(", "))}${line("Move-out", u.moveOut)}${line("Move-in", u.moveIn)}${line("Estimate", u.estimate)}</p>`,
    )
    .join("");
  const count = params.units.length;
  return `
    <h2 style="margin:0 0 12px;color:#E73C6E">New turnover request${count > 1 ? ` (${count} units)` : ""}</h2>
    <p><strong>${escapeHtml(params.requester)}</strong> asked for ${count > 1 ? `${count} turnovers` : "a turnover"} at <strong>${escapeHtml(params.building)}</strong>, starting <strong>${escapeHtml(params.start)}</strong>.</p>
    ${units}
    ${params.total ? `<p><strong>Total estimate:</strong> ${escapeHtml(params.total)}</p>` : ""}
    ${params.notes ? `<p style="white-space:pre-line"><strong>Notes:</strong> ${escapeHtml(params.notes)}</p>` : ""}
    <p style="margin:20px 0"><a href="${escapeHtml(params.url)}" style="${BUTTON_STYLE}">Open requests</a></p>
  `;
}

/** To staff: property manager requests and changes nobody has answered. */
export function buildPropertyManagerWaitingEmail(params: { items: { what: string; from: string; sent: string }[]; url: string }) {
  const rows = params.items
    .map(
      (i) =>
        `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee">${escapeHtml(i.what)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee">${escapeHtml(i.from)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;white-space:nowrap">${escapeHtml(i.sent)}</td></tr>`,
    )
    .join("");
  return `
    <h2 style="margin:0 0 12px;color:#E73C6E">Property managers are waiting</h2>
    <p>These have waited over a business day for an answer:</p>
    <table style="border-collapse:collapse;font-size:14px;width:100%">
      <tr><th align="left" style="padding:6px 8px;border-bottom:2px solid #ddd">What</th><th align="left" style="padding:6px 8px;border-bottom:2px solid #ddd">From</th><th align="left" style="padding:6px 8px;border-bottom:2px solid #ddd">Sent</th></tr>
      ${rows}
    </table>
    <p style="margin:20px 0"><a href="${escapeHtml(params.url)}" style="${BUTTON_STYLE}">Open requests</a></p>
  `;
}

/** Monday email to a property manager: their turnovers this week, and anything waiting on us. */
export function buildPropertyManagerWeeklyEmail(params: {
  firstName: string;
  weekLabel: string;
  thisWeek: { what: string; dates: string; status: string }[];
  waiting: { what: string; detail: string }[];
  url: string | null;
  contact: SueepContact | null;
}) {
  const cell = "padding:6px 8px;border-bottom:1px solid #eee";
  const week = params.thisWeek.length
    ? `<table style="border-collapse:collapse;font-size:14px;width:100%">${params.thisWeek
        .map((t) => `<tr><td style="${cell}"><strong>${escapeHtml(t.what)}</strong></td><td style="${cell}">${escapeHtml(t.dates)}</td><td style="${cell}">${escapeHtml(t.status)}</td></tr>`)
        .join("")}</table>`
    : "<p>Nothing booked this week.</p>";
  const waiting = params.waiting.length
    ? `<p style="margin-top:20px"><strong>Waiting for us to confirm:</strong></p><ul style="padding-left:20px">${params.waiting
        .map((w) => `<li>${escapeHtml(w.what)}: ${escapeHtml(w.detail)}</li>`)
        .join("")}</ul>`
    : "";
  return `
    <h2 style="margin:0 0 12px;color:#E73C6E">Your turnovers this week</h2>
    <p>Hi ${escapeHtml(params.firstName)}, here&#39;s what&#39;s happening ${escapeHtml(params.weekLabel)}:</p>
    ${week}
    ${waiting}
    ${seeMyTurnoversButton(params.url)}
    ${contactLine(params.contact)}
  `;
}

/** Who at Sueep a property manager should call. */
export type SueepContact = { name: string | null; phone: string | null; email: string | null };

/** "Questions? Call David Rodriguez at (215) 555-0100 or email david@sueep.com." */
function contactLine(contact: SueepContact | null | undefined): string {
  if (!contact?.name && !contact?.phone && !contact?.email) return "";
  const who = contact.name ? escapeHtml(contact.name) : "us";
  const ways = [
    contact.phone ? `call ${who} at <a href="tel:${escapeHtml(contact.phone.replace(/[^\d+]/g, ""))}">${escapeHtml(contact.phone)}</a>` : null,
    contact.email ? `email <a href="mailto:${escapeHtml(contact.email)}">${escapeHtml(contact.email)}</a>` : null,
  ].filter(Boolean);
  return ways.length ? `<p>Questions? ${ways.join(" or ")}.</p>` : "";
}

function seeMyTurnoversButton(url: string | null): string {
  return url ? `<p style="margin:20px 0"><a href="${escapeHtml(url)}" style="${BUTTON_STYLE}">See my turnovers</a></p>` : "";
}

/** First email a property manager gets: what the page is and how to use it, in plain steps. */
export function buildPropertyManagerWelcomeEmail(params: { firstName: string; buildings: string[]; url: string; contact: SueepContact | null }) {
  const buildings = params.buildings.map((b) => `<strong>${escapeHtml(b)}</strong>`);
  const list = buildings.length > 1 ? `${buildings.slice(0, -1).join(", ")} and ${buildings[buildings.length - 1]}` : (buildings[0] ?? "your buildings");
  return `
    <h2 style="margin:0 0 12px;color:#E73C6E">Your Sueep turnover page</h2>
    <p>Hi ${escapeHtml(params.firstName)},</p>
    <p>We set up a page where you can see and book turnovers for ${list}. No password needed.</p>
    <ol style="padding-left:20px;line-height:1.7">
      <li>Click the button below to open your page.</li>
      <li>Bookmark it, or save it to your phone&#39;s home screen.</li>
      <li>To book a turnover, tap <strong>Book a turnover</strong>. We email you to confirm the date and price.</li>
    </ol>
    ${seeMyTurnoversButton(params.url)}
    <p style="font-size:12px;color:#555">If your page ever asks for a code, we&#39;ll email you one. Please don&#39;t forward this email, since the button signs you in.</p>
    ${contactLine(params.contact)}
  `;
}

/** To the property manager. `changes` lists what staff changed from the request, e.g. the date or price. */
export function buildPropertyManagerConfirmedEmail(params: {
  firstName: string;
  building: string;
  unit: string;
  dates: string;
  price: string;
  changes: string[];
  message: string | null;
  url: string | null;
  contact?: SueepContact | null;
}) {
  const changes = params.changes.length
    ? `<p style="background:#fef3c7;padding:10px 12px;border-radius:6px">${params.changes.map(escapeHtml).join("<br>")}</p>`
    : "";
  return `
    <h2 style="margin:0 0 12px;color:#E73C6E">Turnover scheduled</h2>
    <p>Hi ${escapeHtml(params.firstName)},</p>
    <p>Unit <strong>${escapeHtml(params.unit)}</strong> at <strong>${escapeHtml(params.building)}</strong> is scheduled for <strong>${escapeHtml(params.dates)}</strong>.</p>
    <p><strong>Price:</strong> ${escapeHtml(params.price)}</p>
    ${changes}
    <p style="font-size:13px;color:#555">To add it to your calendar, open the attached file.</p>
    ${params.message ? `<p style="white-space:pre-line">${escapeHtml(params.message)}</p>` : ""}
    ${seeMyTurnoversButton(params.url)}
    ${contactLine(params.contact)}
  `;
}

export function buildPropertyManagerDeclinedEmail(params: {
  firstName: string;
  building: string;
  unit: string;
  reason: string;
  message: string | null;
  url: string | null;
  contact?: SueepContact | null;
}) {
  return `
    <h2 style="margin:0 0 12px;color:#E73C6E">We can't take this turnover</h2>
    <p>Hi ${escapeHtml(params.firstName)},</p>
    <p>We aren't able to do your request for unit <strong>${escapeHtml(params.unit)}</strong> at <strong>${escapeHtml(params.building)}</strong>.</p>
    <p><strong>Reason:</strong> ${escapeHtml(params.reason)}</p>
    ${params.message ? `<p style="white-space:pre-line">${escapeHtml(params.message)}</p>` : ""}
    ${seeMyTurnoversButton(params.url)}
    ${contactLine(params.contact)}
  `;
}

/** To staff when a property manager cancels or moves something. `lines` are already plain sentences. */
export function buildPropertyManagerChangeEmail(params: { title: string; lines: string[]; url: string }) {
  return `
    <h2 style="margin:0 0 12px;color:#E73C6E">${escapeHtml(params.title)}</h2>
    ${params.lines.map((l) => `<p style="white-space:pre-line">${escapeHtml(l)}</p>`).join("")}
    <p style="margin:20px 0"><a href="${escapeHtml(params.url)}" style="${BUTTON_STYLE}">Open requests</a></p>
  `;
}

/** To the property manager when staff apply or decline their cancel or new date. */
export function buildPropertyManagerChangeAnsweredEmail(params: {
  firstName: string;
  title: string;
  body: string;
  message: string | null;
  url: string | null;
  contact?: SueepContact | null;
}) {
  return `
    <h2 style="margin:0 0 12px;color:#E73C6E">${escapeHtml(params.title)}</h2>
    <p>Hi ${escapeHtml(params.firstName)},</p>
    <p>${escapeHtml(params.body)}</p>
    ${params.message ? `<p style="white-space:pre-line">${escapeHtml(params.message)}</p>` : ""}
    ${seeMyTurnoversButton(params.url)}
    ${contactLine(params.contact)}
  `;
}

export function buildCoiRequestAlertEmail(params: {
  requesterName: string;
  requesterCompany: string | null;
  project: string;
  holders: string[];
  neededBy: string | null;
  url: string;
}) {
  return `
    <h2 style="margin:0 0 12px;color:#E73C6E">New COI request</h2>
    <p><strong>${escapeHtml(params.requesterName)}</strong>${params.requesterCompany ? ` (${escapeHtml(params.requesterCompany)})` : ""} asked for a certificate of insurance.</p>
    <p><strong>Project:</strong> ${escapeHtml(params.project)}<br>
       <strong>For:</strong> ${params.holders.map(escapeHtml).join(", ")}${params.neededBy ? `<br><strong>Needed by:</strong> ${escapeHtml(params.neededBy)}` : ""}</p>
    <p style="margin:20px 0"><a href="${escapeHtml(params.url)}" style="${BUTTON_STYLE}">Open in the ERP</a></p>
  `;
}

export function buildRescheduleEmail(params: { jobTitle: string; oldLabel: string; newLabel: string; projectUrl: string | null }) {
  return `
    <h2 style="margin:0 0 12px;color:#E73C6E">Project rescheduled</h2>
    <p><strong>${escapeHtml(params.jobTitle)}</strong> was moved from ${escapeHtml(params.oldLabel)} to <strong>${escapeHtml(params.newLabel)}</strong>.</p>
    ${params.projectUrl ? `<p style="margin:20px 0"><a href="${escapeHtml(params.projectUrl)}" style="${BUTTON_STYLE}">View project</a></p>` : ""}
  `;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
