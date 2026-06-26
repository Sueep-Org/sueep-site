import { Resend } from "resend";

const FROM_EMAIL = process.env.RESEND_FROM || "Sueep Website <noreply@mail.sueep.com>";

export async function sendEmail(options: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  attachments?: Array<{ filename: string; content: Buffer }>;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("Resend API key not configured, email not sent:", options.subject, options.to);
    return;
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: options.to,
    subject: options.subject,
    html: options.html,
    reply_to: options.replyTo,
    attachments: options.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
    })),
  });
  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }
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
      <p><strong>Unit:</strong> ${escapeHtml(params.unitNumber || "—")}</p>
      <p><strong>Request type:</strong> ${escapeHtml(params.requestType)}</p>
      <p><strong>Bedrooms / Bathrooms:</strong> ${escapeHtml(String(params.bedrooms ?? "—"))} / ${escapeHtml(
    String(params.bathrooms ?? "—")
  )}</p>
      <p><strong>Services:</strong> ${escapeHtml(params.services.join(", "))}</p>
      <p><strong>Dates:</strong> ${escapeHtml(params.startDate || "—")} — ${escapeHtml(params.endDate || "—")}</p>
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
      <p><strong>Property:</strong> ${escapeHtml(params.propertyName || "—")}</p>
      <p><strong>Address:</strong> ${escapeHtml(params.propertyAddress || "—")}</p>
      <p><strong>Property Manager/Maintenance Manager:</strong> ${escapeHtml(params.managerName || "—")}</p>
      <p><strong>SUEEP PM:</strong> ${escapeHtml(params.sueepPmName || "—")}</p>
      <p><strong>Units:</strong> ${escapeHtml(params.unitNumbers || "—")}</p>
      <p><strong>Dates:</strong> ${escapeHtml(params.startDate || "—")} — ${escapeHtml(params.endDate || "—")}</p>
      <p><strong>Estimated total:</strong> ${escapeHtml(params.estimatedTotal || "—")}</p>
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
      <p>Use the secure link below — no account required. The link expires in ${days} days.</p>
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
      <p>Please upload the following documents using the secure link below. No account required — the link expires in ${days} days.</p>
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
      <p>No account required — the link expires in ${days} days.</p>
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
      <p><strong>Schedule impact:</strong> ${params.estimatedDays != null ? `${params.estimatedDays} day(s)` : "—"}</p>
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
      <h2 style="margin-bottom:12px;color:#E73C6E">Work Order Created</h2>
      <p>Hi ${escapeHtml(params.recipientName)},</p>
      <p>A work order has been created for the following project and assigned to you for review.</p>
      <p><strong>Project Name:</strong> ${escapeHtml(params.projectName)}</p>
      <p><strong>Site Address:</strong> ${escapeHtml(params.siteAddress || "—")}</p>
      ${contactsBlock}
      <p><strong>Starting Date (Estimated):</strong> ${escapeHtml(params.startDate || "—")}</p>
      <p><strong>Service Type:</strong> ${escapeHtml(params.serviceType || "—")}</p>
      ${notesBlock}
      ${projectLink}
      <p style="font-size:12px;color:#888;margin-top:24px">Please log in to the project portal to review the full details.</p>
    </div>
  `;
}

export function buildRealEstateConfirmationEmail(params: {
  agentName: string;
  propertyAddress: string;
  propertyType?: string | null;
  bedrooms?: string | null;
  bathrooms?: string | null;
  services: string[];
  cleanDate?: string | null;
  moveInDate?: string | null;
  contractValue?: string | null;
}) {
  const serviceRows = params.services.length
    ? params.services.map((s) => `<li style="margin-bottom:4px">${escapeHtml(s)}</li>`).join("")
    : "<li>No specific services selected</li>";

  const detailRows = [
    params.propertyType ? `<tr><td style="padding:6px 12px 6px 0;color:#555;white-space:nowrap">Property type</td><td style="padding:6px 0;font-weight:600">${escapeHtml(params.propertyType)}</td></tr>` : "",
    params.bedrooms ? `<tr><td style="padding:6px 12px 6px 0;color:#555;white-space:nowrap">Bedrooms</td><td style="padding:6px 0;font-weight:600">${escapeHtml(params.bedrooms)}</td></tr>` : "",
    params.bathrooms ? `<tr><td style="padding:6px 12px 6px 0;color:#555;white-space:nowrap">Bathrooms</td><td style="padding:6px 0;font-weight:600">${escapeHtml(params.bathrooms)}</td></tr>` : "",
    params.cleanDate ? `<tr><td style="padding:6px 12px 6px 0;color:#555;white-space:nowrap">Target clean date</td><td style="padding:6px 0;font-weight:600">${escapeHtml(params.cleanDate)}</td></tr>` : "",
    params.moveInDate ? `<tr><td style="padding:6px 12px 6px 0;color:#555;white-space:nowrap">Move-in / listing date</td><td style="padding:6px 0;font-weight:600">${escapeHtml(params.moveInDate)}</td></tr>` : "",
    params.contractValue ? `<tr><td style="padding:6px 12px 6px 0;color:#555;white-space:nowrap">Estimated value</td><td style="padding:6px 0;font-weight:600">$${escapeHtml(params.contractValue)}</td></tr>` : "",
  ].filter(Boolean).join("");

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.6;max-width:600px">
      <div style="background:#E73C6E;padding:24px 28px;border-radius:8px 8px 0 0">
        <h1 style="margin:0;color:#fff;font-size:20px">Sueep — Request Received</h1>
      </div>
      <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px">
        <p>Hi ${escapeHtml(params.agentName)},</p>
        <p>Thanks for submitting a cleaning request through Sueep. We've received your request and our team will be in touch shortly to confirm the details and schedule.</p>

        <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:16px 20px;margin:20px 0">
          <p style="margin:0 0 10px;font-weight:700;font-size:15px">📍 ${escapeHtml(params.propertyAddress)}</p>
          ${detailRows ? `<table style="border-collapse:collapse;width:100%">${detailRows}</table>` : ""}
        </div>

        <p style="font-weight:600;margin-bottom:8px">Services requested:</p>
        <ul style="margin:0;padding-left:20px;color:#374151">${serviceRows}</ul>

        <p style="margin-top:24px;font-size:13px;color:#6b7280">
          Questions? Reply to this email or reach out to your Sueep contact directly.
        </p>
        <p style="margin-top:4px;font-size:13px;color:#6b7280">— The Sueep Team</p>
      </div>
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
  // SOV fields
  sovDescription?: string;
  desiredDate?: string;
  comments?: string;
  projectUrl: string | null;
}) {
  const typeLabel = params.type === "change-order" ? "Change Order Request" : "SOV Work Scheduling Request";

  const details =
    params.type === "change-order"
      ? `
        <p><strong>Change Order Title:</strong> ${escapeHtml(params.coTitle ?? "")}</p>
        ${params.coDescription ? `<p><strong>Description / Scope:</strong> ${escapeHtml(params.coDescription)}</p>` : ""}
        ${params.coEstimatedStartDate ? `<p><strong>Estimated Start Date:</strong> ${escapeHtml(params.coEstimatedStartDate)}</p>` : ""}
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
      <p style="margin-top:24px;font-size:13px;color:#6b7280">— The Sueep Team</p>
    </div>
  `;
}

export function buildProjectRequestConfirmationEmail(params: {
  type: "change-order" | "sov-schedule";
  projectTitle: string;
  requesterName: string;
  coTitle?: string;
  coEstimatedStartDate?: string;
  sovDescription?: string;
  desiredDate?: string;
}) {
  const typeLabel = params.type === "change-order" ? "change order request" : "scheduling request";
  const detail =
    params.type === "change-order"
      ? `<p><strong>Change Order:</strong> ${escapeHtml(params.coTitle ?? "")}</p>
         ${params.coEstimatedStartDate ? `<p><strong>Estimated Start Date:</strong> ${escapeHtml(params.coEstimatedStartDate)}</p>` : ""}`
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
      <p style="margin-top:24px;font-size:13px;color:#6b7280">— The Sueep Team</p>
    </div>
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
