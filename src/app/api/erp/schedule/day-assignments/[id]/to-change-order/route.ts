import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canSeeFinancials, getErpAuth } from "@/lib/erpAuth";
import { loadPricingSettings } from "@/lib/pricingSettingsServer";
import { withNextDayUpcharge } from "@/lib/nextDayUpcharge";
import { applyNextDaySurcharge } from "@/lib/erp/nextDaySurcharge";
import { escapeHtml, formatUsd, sendEmail } from "@/lib/email";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Turns a scheduling request into a change order: work a project manager asked
 * for through the portal that isn't in their contract. The change order is
 * made for that day (SUBMITTED, waiting for their OK), put on the day in place
 * of any SOV lines, and the requester can be emailed. A next day request
 * keeps its upcharge on the new change order's price.
 */
export async function POST(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canSeeFinancials(auth.role)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const { id } = await ctx.params;

  let body: { title?: unknown; price?: unknown; notify?: unknown; message?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : "";
  if (!title) return NextResponse.json({ error: "Give the change order a title." }, { status: 400 });
  let baseCents: number | null = null;
  if (body.price != null && String(body.price).trim() !== "") {
    const n = Number(String(body.price).replace(/[$,\s]/g, ""));
    if (!Number.isFinite(n) || n < 0) return NextResponse.json({ error: "Price needs to be a dollar amount." }, { status: 400 });
    baseCents = Math.round(n * 100);
  }
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 2000) : "";

  const day = await prisma.projectDayAssignment.findUnique({
    where: { id },
    select: {
      id: true,
      date: true,
      comment: true,
      requesterName: true,
      requesterEmail: true,
      nextDayUpcharge: true,
      project: { select: { id: true, jobTitle: true } },
    },
  });
  if (!day) return NextResponse.json({ error: "That day isn't on the schedule anymore." }, { status: 404 });
  const notify = body.notify === true && !!day.requesterEmail;

  const { nextDayPct } = await loadPricingSettings();
  const priceCents = baseCents == null ? null : withNextDayUpcharge(baseCents, day.nextDayUpcharge, nextDayPct);
  const requestedBy = day.requesterEmail ? `${day.requesterName?.trim() || day.requesterEmail} <${day.requesterEmail}>` : null;

  const co = await prisma.$transaction(async (tx) => {
    const created = await tx.projectChangeOrder.create({
      data: {
        projectId: day.project.id,
        title,
        description: day.comment,
        requestedBy,
        status: "SUBMITTED",
        requestedDate: day.date,
        startDate: day.date,
        endDate: day.date,
        contractValueCents: priceCents,
        nextDayUpcharge: day.nextDayUpcharge,
      },
      select: { id: true, title: true },
    });
    // The day now covers this change order instead of contract (SOV) work.
    await tx.projectDayAssignment.update({
      where: { id: day.id },
      data: { sovItems: { set: [] }, changeOrders: { connect: { id: created.id } } },
    });
    return created;
  });
  // Voids any next day surcharge made for SOV lines that just came off the day.
  await applyNextDaySurcharge(day.id).catch((e) => console.error("Next day surcharge failed", { id: day.id }, e));

  let emailed = false;
  if (notify) {
    const when = day.date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.6;max-width:640px">
        <h2 style="margin-bottom:12px;color:#E73C6E">Your request is a change order</h2>
        <p>Hi ${escapeHtml(day.requesterName?.trim() || "there")},</p>
        <p>Thanks for your request for <strong>${escapeHtml(day.project.jobTitle)}</strong> on ${escapeHtml(when)}. This work isn't part of the original contract, so we've set it up as a change order.</p>
        <p><strong>Change order:</strong> ${escapeHtml(title)}</p>
        ${priceCents != null ? `<p><strong>Price:</strong> ${formatUsd(priceCents)}${day.nextDayUpcharge ? ` (includes the ${nextDayPct}% next day upcharge)` : ""}</p>` : ""}
        ${day.comment ? `<p><strong>What you asked for:</strong> ${escapeHtml(day.comment)}</p>` : ""}
        ${message ? `<p>${escapeHtml(message).replace(/\n/g, "<br>")}</p>` : ""}
        <p>We'll follow up to confirm it with you. Reply to this email with any questions.</p>
        <p style="margin-top:24px;font-size:13px;color:#6b7280">The Sueep Team</p>
      </div>`;
    const result = await sendEmail({
      type: "SCHEDULE_REQUEST_MADE_CO",
      to: day.requesterEmail!,
      replyTo: auth.email,
      subject: `Change order for your request: ${day.project.jobTitle}`,
      html,
      link: `/erp/projects/${day.project.id}/change-orders/${co.id}`,
    }).catch((e) => {
      console.error("Change order email to requester failed", { id: day.id }, e);
      return null;
    });
    emailed = result === "SENT";
  }

  return NextResponse.json({ changeOrderId: co.id, title: co.title, priceCents, emailed });
}
