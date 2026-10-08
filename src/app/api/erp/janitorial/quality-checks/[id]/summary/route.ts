import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageJanitorial } from "@/lib/erpAuth";
import { sendEmail, wrapEmailLayout } from "@/lib/email";
import { parseEmailList } from "@/lib/notificationTypes";
import { buildCheckSummary, summaryAttachments } from "@/lib/erp/janitorialQualityChecks";

type Ctx = { params: Promise<{ id: string }> };

/**
 * The property manager summary for a finished quality check.
 * { preview: true } returns the email's HTML without sending.
 */
export async function POST(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canManageJanitorial(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const summary = await buildCheckSummary(id, {
    message: String(body.message ?? "").slice(0, 5000),
    includeNotes: body.includeNotes === true,
    includeDiscussion: body.includeDiscussion === true,
    includePhotos: body.includePhotos === true,
  });
  if (!summary) return NextResponse.json({ error: "Quality check not found" }, { status: 404 });
  if (body.preview === true) {
    return NextResponse.json({ subject: summary.subject, html: wrapEmailLayout(summary.html, "QUALITY_CHECK_SUMMARY"), photoCount: summary.photoIds.length });
  }

  if (!summary.done) return NextResponse.json({ error: "Finish the check before sending the summary" }, { status: 400 });
  const to = parseEmailList(body.to);
  if (!to) return NextResponse.json({ error: "One of the email addresses isn't valid" }, { status: 400 });
  if (!to.length) return NextResponse.json({ error: "Pick who gets the summary" }, { status: 400 });

  try {
    const result = await sendEmail({
      type: "QUALITY_CHECK_SUMMARY",
      to,
      link: `/erp/janitorial/quality-checks/${id}`,
      subject: summary.subject,
      html: summary.html,
      attachments: await summaryAttachments(summary.photoIds),
    });
    if (result === "OFF") return NextResponse.json({ error: "Site visit summary emails are turned off on the Notifications page" }, { status: 409 });
    // No email key (local dev): logged but not delivered, so don't record it as sent.
    if (result === "SKIPPED") return NextResponse.json({ error: "Email isn't set up on this server, so nothing was sent" }, { status: 409 });
  } catch (e) {
    console.error("QUALITY_CHECK_SUMMARY email failed", e);
    return NextResponse.json({ error: "The email didn't send. Try again." }, { status: 502 });
  }

  await prisma.janitorialQualityCheck.update({ where: { id }, data: { summarySentAt: new Date(), summarySentTo: to } });
  return NextResponse.json({ ok: true, to });
}
