import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 60;

const TO_EMAIL = process.env.CONTACT_TO_EMAIL || "contact@sueep.com";
const FROM_EMAIL = process.env.RESEND_FROM || "Sueep Website <noreply@mail.sueep.com>";

const KNOWN_BODY_KEYS = new Set([
  "fullName",
  "email",
  "phone",
  "positionInterest",
  "additionalNotes",
  "_honey",
]);

/**
 * POST /api/candidate-applications
 * Public intake from /careers. Persists to ERP DB; optional Resend notify (same pattern as referrals).
 */
export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";
    const isFormPost =
      contentType.includes("application/x-www-form-urlencoded") ||
      contentType.includes("multipart/form-data");

    let fullName = "";
    let email = "";
    let phone = "";
    let positionInterest = "";
    let additionalNotes = "";
    let honey = "";
    const extraResponses: Record<string, unknown> = {};

    if (contentType.includes("application/json")) {
      const body = (await req.json()) as Record<string, unknown>;
      fullName = String(body.fullName || "").trim();
      email = String(body.email || "").trim().toLowerCase();
      phone = String(body.phone || "").trim();
      positionInterest = String(body.positionInterest || "").trim();
      additionalNotes = String(body.additionalNotes || "").trim();
      honey = String(body._honey || "");
      for (const [k, v] of Object.entries(body)) {
        if (KNOWN_BODY_KEYS.has(k)) continue;
        if (v === undefined || v === null || v === "") continue;
        extraResponses[k] = v;
      }
    } else if (isFormPost) {
      const form = await req.formData();
      fullName = String(form.get("fullName") || "").trim();
      email = String(form.get("email") || "").trim().toLowerCase();
      phone = String(form.get("phone") || "").trim();
      positionInterest = String(form.get("positionInterest") || "").trim();
      additionalNotes = String(form.get("additionalNotes") || "").trim();
      honey = String(form.get("_honey") || "");
    } else {
      return NextResponse.json({ error: "Unsupported content type" }, { status: 415 });
    }

    if (honey) {
      if (isFormPost) {
        return NextResponse.redirect(new URL("/careers?submitted=1", req.url), { status: 303 });
      }
      return NextResponse.json({ ok: true, skipped: true });
    }

    if (!fullName || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      if (isFormPost) {
        return NextResponse.redirect(new URL("/careers?submitted=0", req.url), { status: 303 });
      }
      return NextResponse.json({ error: "fullName and a valid email are required" }, { status: 400 });
    }

    const row = await prisma.candidateApplication.create({
      data: {
        fullName,
        email,
        phone: phone || null,
        positionInterest: positionInterest || null,
        additionalNotes: additionalNotes || null,
        ...(Object.keys(extraResponses).length > 0
          ? { responses: extraResponses as Prisma.InputJsonValue }
          : {}),
      },
    });

    const subject = `Careers inquiry: ${fullName}`;
    const summaryHtml = `
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111">
        <h2 style="margin:0 0 12px 0">New careers / onboarding submission</h2>
        <p><strong>Name:</strong> ${escapeHtml(fullName)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        <p><strong>Phone:</strong> ${escapeHtml(phone || "—")}</p>
        <p><strong>Interest:</strong> ${escapeHtml(positionInterest || "—")}</p>
        <p><strong>Notes:</strong></p>
        <pre style="white-space:pre-wrap;margin:0">${escapeHtml(additionalNotes || "—")}</pre>
        <p style="margin-top:16px"><strong>Application id:</strong> ${escapeHtml(row.id)}</p>
        <p>Open ERP → Candidates to review.</p>
      </div>
    `;

    if (process.env.RESEND_API_KEY) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: FROM_EMAIL,
          to: TO_EMAIL,
          subject,
          html: summaryHtml,
          reply_to: email,
        });
      } catch (e) {
        console.error("[api/candidate-applications] Resend failed", e);
      }
    }

    if (isFormPost) {
      return NextResponse.redirect(new URL("/careers?submitted=1", req.url), { status: 303 });
    }
    return NextResponse.json({ ok: true, id: row.id });
  } catch (e) {
    console.error("/api/candidate-applications error", e);
    const fallbackUrl = new URL("/careers?submitted=0", req.url);
    const contentType = req.headers.get("content-type") || "";
    const isFormPost =
      contentType.includes("application/x-www-form-urlencoded") ||
      contentType.includes("multipart/form-data");
    if (isFormPost) {
      return NextResponse.redirect(fallbackUrl, { status: 303 });
    }
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