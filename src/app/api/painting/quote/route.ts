import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";
import {
  computePaintingQuote,
  formatUsd,
  parsePaintingQuotePayload,
  type PaintingQuoteResult,
  type PaintingQuoteInput,
} from "@/lib/paintingQuote";

const TO_EMAIL = process.env.CONTACT_TO_EMAIL || "contact@sueep.com";
const FORMSUBMIT_ENDPOINT =
  process.env.FORMSUBMIT_ENDPOINT || "https://formsubmit.co/fc9c50165f29e01095f6f39726348f26";

type LeadContact = {
  name: string;
  email: string;
  phone: string;
  zip: string;
  message?: string;
};

function parseLeadContact(body: Record<string, unknown>): LeadContact | null {
  const raw = body.leadContact;
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const name = String(o.name || "").trim();
  const email = String(o.email || "").trim();
  const phone = String(o.phone || "").trim();
  const zip = String(o.zip || "").trim();
  const message = String(o.message || "").trim();
  if (!name || !email || !phone || !zip) return null;
  return { name, email, phone, zip, message };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const input = parsePaintingQuotePayload(body);
    if (!input) {
      return NextResponse.json({ error: "Invalid quote request" }, { status: 400 });
    }

    const q = computePaintingQuote(input);
    const lead = parseLeadContact(body);

    if (lead) {
      await notifyAfterQuote(input, q, lead).catch((err) => console.error("[api/painting/quote] notify failed", err));
    }

    return NextResponse.json({
      lowDollars: q.lowCents / 100,
      highDollars: q.highCents / 100,
      lowDisplay: formatUsd(q.lowCents),
      highDisplay: formatUsd(q.highCents),
      depositCents: q.depositCents,
      depositDisplay: formatUsd(q.depositCents),
      breakdown: q.breakdown,
      disclaimer: q.disclaimer,
    });
  } catch (e) {
    console.error("/api/painting/quote error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

async function notifyAfterQuote(input: PaintingQuoteInput, q: PaintingQuoteResult, lead: LeadContact) {
  const range = `${formatUsd(q.lowCents)} – ${formatUsd(q.highCents)}`;
  const teamSubject = `Painting follow-up quote: ${lead.name}, ${range}`;
  const teamHtml = `
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111">
        <h2 style="margin:0 0 12px 0">Painting scope + instant range (follow-up page)</h2>
        <p><strong>Name:</strong> ${escapeHtml(lead.name)}</p>
        <p><strong>Email:</strong> ${escapeHtml(lead.email)}</p>
        <p><strong>Phone:</strong> ${escapeHtml(lead.phone)}</p>
        <p><strong>ZIP:</strong> ${escapeHtml(lead.zip)}</p>
        <p><strong>Original notes:</strong></p>
        <pre style="white-space:pre-wrap;margin:0 0 16px 0">${escapeHtml(lead.message || "N/A")}</pre>
        <p><strong>Planning range:</strong> ${escapeHtml(range)}</p>
        <p><strong>Deposit (50% of planning midpoint):</strong> ${escapeHtml(formatUsd(q.depositCents))}</p>
        <p><strong>Service type:</strong> ${escapeHtml(input.serviceType)}</p>
        <p><strong>Rooms:</strong> ${input.roomCount} · <strong>Sq ft band:</strong> ${escapeHtml(input.sqFtBand)} · <strong>Scope:</strong> ${escapeHtml(input.scope)}</p>
        <p><strong>Ceilings:</strong> ${escapeHtml(input.ceilings)} · <strong>Walls:</strong> ${escapeHtml(input.wallCondition)} · <strong>Occupancy:</strong> ${escapeHtml(input.occupancy)} · <strong>Timeline:</strong> ${escapeHtml(input.timeline)}</p>
      </div>
    `;

  if (!process.env.RESEND_API_KEY) {
    const formPayload = new URLSearchParams();
    formPayload.set("name", lead.name);
    formPayload.set("_replyto", lead.email);
    formPayload.set("_subject", teamSubject);
    formPayload.set("_template", "table");
    formPayload.set("_captcha", "false");
    formPayload.set("_cc", TO_EMAIL);
    formPayload.set(
      "message",
      [
        `Phone: ${lead.phone}`,
        `ZIP: ${lead.zip}`,
        `Range: ${range}`,
        `Deposit: ${formatUsd(q.depositCents)}`,
        "",
        "Original message:",
        lead.message || "N/A",
        "",
        "Scope details:",
        JSON.stringify(input, null, 2),
      ].join("\n")
    );
    await fetch(FORMSUBMIT_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: formPayload.toString(),
    });
  } else {
    await sendEmail({ type: "PAINTING_QUOTE_TEAM", subject: teamSubject, html: teamHtml, replyTo: lead.email });

    const customerHtml = `
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.5">
        <p>Hi ${escapeHtml(lead.name.split(/\s+/)[0] || lead.name)},</p>
        <p>Thanks for the extra details. <strong>We're on it</strong> and a Sueep team member will follow up to confirm scope and scheduling.</p>
        <p>Based on what you shared, your <strong>planning range</strong> is about <strong>${escapeHtml(range)}</strong>. Final pricing is always confirmed after we review your property.</p>
        <p>If you place a deposit from your thank-you page, it is 50% of the midpoint of this range. It secures scheduling and lets us order paint and materials. You&apos;ll review the terms and accept the agreement in Stripe&apos;s secure form right on that page before paying; final pricing is confirmed in writing before work begins.</p>
        <p>Sueep</p>
      </div>
    `;
    await sendEmail({
      type: "PAINTING_QUOTE_CUSTOMER",
      to: lead.email,
      subject: "Your Sueep painting planning range: we're on it",
      html: customerHtml,
      replyTo: TO_EMAIL,
    });
  }
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
