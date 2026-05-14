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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
