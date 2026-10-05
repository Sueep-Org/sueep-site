import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";
// Only used by the FormSubmit fallback; with Resend, recipients are set on the ERP Notifications page.
const TO_EMAIL = process.env.CONTACT_TO_EMAIL || "contact@sueep.com";
const FORMSUBMIT_ENDPOINT =
  process.env.FORMSUBMIT_ENDPOINT || "https://formsubmit.co/fc9c50165f29e01095f6f39726348f26";

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";
    const isFormPost =
      contentType.includes("application/x-www-form-urlencoded") ||
      contentType.includes("multipart/form-data");
    let name = "";
    let email = ""; // accepts either 'email' or '_replyto' from forms
    let company = "";
    let phone = "";
    let message = "";
    let honey = ""; // spam honeypot
    let service = ""; // optional: painting | cleaning for conversion tracking
    let buildingType = "";
    let sqftRange = "";
    let zip = "";
    let serviceType = "";

    if (contentType.includes("application/json")) {
      const body = await req.json();
      name = String(body?.name || "");
      email = String(body?.email || body?._replyto || "");
      company = String(body?.company || "");
      phone = String(body?.phone || "");
      message = String(body?.message || "");
      honey = String(body?._honey || "");
      service = String(body?._service || "").toLowerCase();
      buildingType = String(body?.buildingType || "");
      sqftRange = String(body?.sqftRange || "");
      zip = String(body?.zip || "");
      serviceType = String(body?.serviceType || "");
    } else if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      name = String(form.get("name") || "");
      email = String(form.get("email") || form.get("_replyto") || "");
      company = String(form.get("company") || "");
      phone = String(form.get("phone") || "");
      message = String(form.get("message") || "");
      honey = String(form.get("_honey") || "");
      service = String(form.get("_service") || "").toLowerCase();
      buildingType = String(form.get("buildingType") || "");
      sqftRange = String(form.get("sqftRange") || "");
      zip = String(form.get("zip") || "");
      serviceType = String(form.get("serviceType") || "");
    }

    const thankYouPath =
      service === "painting"
        ? "/thank-you?status=ok&service=painting"
        : service === "cleaning"
          ? "/thank-you?status=ok&service=cleaning"
          : "/thank-you?status=ok";

    // Basic honeypot spam check
    if (honey) {
      if (isFormPost) {
        return NextResponse.redirect(new URL(thankYouPath, req.url), { status: 303 });
      }
      return NextResponse.json({ ok: true, skipped: true });
    }

    if (!name || !email || !phone || !message) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const subject =
      service === "cleaning"
        ? `Commercial cleaning inquiry from ${name}`
        : service === "painting"
          ? `Residential painting inquiry from ${name}`
          : `New website inquiry from ${name}`;
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111">
        <h2 style="margin:0 0 12px 0">Website Contact Form</h2>
        <p><strong>Name:</strong> ${escapeHtml(name)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        ${company ? `<p><strong>Company / Property:</strong> ${escapeHtml(company)}</p>` : ""}
        <p><strong>Phone:</strong> ${escapeHtml(phone)}</p>
        ${zip ? `<p><strong>ZIP:</strong> ${escapeHtml(zip)}</p>` : ""}
        ${serviceType ? `<p><strong>Service type:</strong> ${escapeHtml(serviceType)}</p>` : ""}
        ${buildingType ? `<p><strong>Building type:</strong> ${escapeHtml(buildingType)}</p>` : ""}
        ${sqftRange ? `<p><strong>Approx. sq ft:</strong> ${escapeHtml(sqftRange)}</p>` : ""}
        <p><strong>Message:</strong></p>
        <pre style="white-space:pre-wrap;margin:0">${escapeHtml(message)}</pre>
      </div>
    `;

    if (!process.env.RESEND_API_KEY) {
      // Fallback: forward to FormSubmit so messages still deliver without Resend
      try {
        const formPayload = new URLSearchParams();
        formPayload.set("name", name);
        formPayload.set("_replyto", email);
        formPayload.set("company", company);
        formPayload.set("phone", phone);
        const extra = [
          zip && `ZIP: ${zip}`,
          serviceType && `Service type: ${serviceType}`,
          buildingType && `Building type: ${buildingType}`,
          sqftRange && `Approx. sq ft: ${sqftRange}`,
        ]
          .filter(Boolean)
          .join("\n");
        formPayload.set("message", extra ? `${extra}\n\n${message}` : message);
        formPayload.set("_subject", subject);
        formPayload.set("_template", "table");
        formPayload.set("_captcha", "false");
        formPayload.set("_cc", TO_EMAIL);
        await fetch(FORMSUBMIT_ENDPOINT, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: formPayload.toString(),
        });
        if (isFormPost) {
          return NextResponse.redirect(new URL(thankYouPath, req.url), { status: 303 });
        }
        return NextResponse.json({ ok: true, forwarded: true });
      } catch (e) {
        console.error("FormSubmit fallback failed", e);
        if (isFormPost) {
          return NextResponse.redirect(new URL("/thank-you?status=error", req.url), { status: 303 });
        }
        return NextResponse.json({ error: "Fallback send failed" }, { status: 500 });
      }
    }

    await sendEmail({ type: "WEBSITE_CONTACT", subject, html, replyTo: email });

    if (isFormPost) {
      return NextResponse.redirect(new URL(thankYouPath, req.url), { status: 303 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("/api/contact error", err);
    try {
      const contentType = req.headers.get("content-type") || "";
      const isFormPost =
        contentType.includes("application/x-www-form-urlencoded") ||
        contentType.includes("multipart/form-data");
      if (isFormPost) {
        return NextResponse.redirect(new URL("/thank-you?status=error", req.url), { status: 303 });
      }
    } catch {}
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function GET() {
  const hasKey = Boolean(process.env.RESEND_API_KEY);
  const from = process.env.RESEND_FROM || null;
  const to = process.env.CONTACT_TO_EMAIL || "contact@sueep.com";
  return NextResponse.json({ hasKey, from, to });
}

function escapeHtml(input: string) {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


