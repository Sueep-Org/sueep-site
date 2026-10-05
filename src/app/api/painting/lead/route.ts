import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";

// Only used by the FormSubmit fallback; with Resend, recipients are set on the ERP Notifications page.
const TO_EMAIL = process.env.CONTACT_TO_EMAIL || "contact@sueep.com";
const FORMSUBMIT_ENDPOINT =
  process.env.FORMSUBMIT_ENDPOINT || "https://formsubmit.co/fc9c50165f29e01095f6f39726348f26";

/**
 * JSON-only: first step of painting wizard — notifies team, then client continues to detail questions in-app.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const honey = String(body?._honey || "");
    if (honey) return NextResponse.json({ ok: true, skipped: true });

    const name = String(body?.name || "").trim();
    const email = String(body?.email || "").trim();
    const phone = String(body?.phone || "").trim();
    const zip = String(body?.zip || "").trim();
    const serviceType = String(body?.serviceType || "").trim();
    const message = String(body?.message || "").trim();

    if (!name || !email || !phone || !zip || !serviceType || !message) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const subject = `Residential painting lead (wizard step 1): ${name}`;
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111">
        <h2 style="margin:0 0 12px 0">Painting estimate, first step</h2>
        <p>Customer started the on-page quote flow.</p>
        <p><strong>Name:</strong> ${escapeHtml(name)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        <p><strong>Phone:</strong> ${escapeHtml(phone)}</p>
        <p><strong>ZIP:</strong> ${escapeHtml(zip)}</p>
        <p><strong>Service type:</strong> ${escapeHtml(serviceType)}</p>
        <p><strong>Project notes:</strong></p>
        <pre style="white-space:pre-wrap;margin:0">${escapeHtml(message)}</pre>
      </div>
    `;

    if (!process.env.RESEND_API_KEY) {
      const formPayload = new URLSearchParams();
      formPayload.set("name", name);
      formPayload.set("_replyto", email);
      formPayload.set("_subject", subject);
      formPayload.set("_template", "table");
      formPayload.set("_captcha", "false");
      formPayload.set("_cc", TO_EMAIL);
      formPayload.set(
        "message",
        [`ZIP: ${zip}`, `Service: ${serviceType}`, "", message].join("\n")
      );
      await fetch(FORMSUBMIT_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: formPayload.toString(),
      });
    } else {
      await sendEmail({ type: "PAINTING_LEAD", subject, html, replyTo: email });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("/api/painting/lead error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

function escapeHtml(input: string) {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
