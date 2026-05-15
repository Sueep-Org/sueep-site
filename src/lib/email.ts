import { Resend } from "resend";

const TO_EMAIL = process.env.CONTACT_TO_EMAIL || "contact@sueep.com";
const FROM_EMAIL = process.env.RESEND_FROM || "Sueep Website <noreply@mail.sueep.com>";

export async function sendEmail(options: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("Resend API key not configured, email not sent:", options.subject, options.to);
    return;
  }

  const resend = new Resend(apiKey);
  await resend.emails.send({
    from: FROM_EMAIL,
    to: options.to,
    subject: options.subject,
    html: options.html,
    reply_to: options.replyTo,
  });
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
      <p><strong>Created by:</strong> ${escapeHtml(params.createdBy || "system")}</p>
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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
