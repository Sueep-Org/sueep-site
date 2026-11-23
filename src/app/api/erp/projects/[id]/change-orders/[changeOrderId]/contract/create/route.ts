import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canSeeJobCosts } from "@/lib/erpAuth";
import { generateManualChangeOrderContractPdf } from "@/lib/contracts/buildChangeOrderContractPdf";
import { escapeHtml, formatUsd, sendEmail } from "@/lib/email";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; changeOrderId: string }> };

/**
 * Create contract on a change order, for when the client didn't use the
 * request link. action "preview" returns the PDF (nothing saved); "send"
 * saves it on the change order as EMAILED and emails it to the client, who
 * signs and sends it back; the PM then uploads the signed copy on that row
 * (contracts/[contractId] PATCH), which marks the change order Approved.
 * Roles that see job costs (Admin, PM, Business Manager, Sales, Estimation).
 */
export async function POST(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canSeeJobCosts(auth.role)) return NextResponse.json({ error: "You can't create contracts." }, { status: 403 });
  const { id, changeOrderId } = await ctx.params;
  const co = await prisma.projectChangeOrder.findFirst({
    where: { id: changeOrderId, projectId: id },
    select: { id: true, title: true, project: { select: { jobTitle: true } } },
  });
  if (!co) return NextResponse.json({ error: "Change order not found" }, { status: 404 });

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
  const action = b.action === "send" ? "send" : "preview";
  const coTitle = str(b.coTitle) || co.title;
  const recipientName = str(b.recipientName);
  const recipientEmail = str(b.recipientEmail).toLowerCase();
  const mode = b.mode === "rates" ? "rates" : "price";
  const dateKey = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(str(v)) ? str(v) : undefined);
  const startDateKey = dateKey(b.startDateKey);
  const endDateKey = dateKey(b.endDateKey);
  if (!recipientName) return NextResponse.json({ error: "Who is it for? Enter the client's name." }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) return NextResponse.json({ error: "Enter the client's email." }, { status: 400 });

  const referenceNumber = `CO-${co.id.slice(-6).toUpperCase()}`;
  const result = await generateManualChangeOrderContractPdf({
    projectId: id,
    coTitle,
    scopeDescription: str(b.scope),
    startDateKey,
    endDateKey,
    clientCompany: str(b.clientCompany),
    clientAddress: str(b.clientAddress),
    recipientName,
    recipientEmail,
    mode,
    totalCents: num(b.totalCents),
    cleaners: num(b.cleaners),
    foremen: num(b.foremen),
    days: num(b.days),
    cleanerRateCents: num(b.cleanerRateCents),
    foremanRateCents: num(b.foremanRateCents),
    referenceNumber,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  const filename = `${coTitle.replace(/[^\w\- ]+/g, "").trim() || "change-order"} contract.pdf`;

  if (action === "preview") {
    return new NextResponse(Buffer.from(result.pdfBytes), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${filename}"` },
    });
  }

  const pdfBase64 = Buffer.from(result.pdfBytes).toString("base64");
  const message = str(b.message);
  const html = `
    <p>Hi ${escapeHtml(recipientName)},</p>
    <p>Attached is the change order contract for <strong>${escapeHtml(coTitle)}</strong> on ${escapeHtml(co.project.jobTitle)}, for ${escapeHtml(formatUsd(result.totalCents))}.</p>
    ${message ? `<p>${escapeHtml(message).replace(/\n/g, "<br />")}</p>` : ""}
    <p>Please sign it and reply to this email with the signed copy. We'll schedule the work once it's back.</p>
    <p>Thank you,<br />Sueep</p>`;
  let sent: Awaited<ReturnType<typeof sendEmail>>;
  try {
    sent = await sendEmail({
      type: "CO_CONTRACT_SENT",
      to: recipientEmail,
      subject: `Change order contract: ${coTitle}`,
      html,
      attachments: [{ filename, content: Buffer.from(result.pdfBytes) }],
      link: `/erp/projects/${id}/change-orders/${changeOrderId}`,
      sentBy: auth.email,
    });
  } catch (e) {
    console.error("Change order contract email failed", e);
    return NextResponse.json({ error: "The email couldn't be sent. Nothing was saved; try again." }, { status: 502 });
  }
  if (sent === "OFF") {
    return NextResponse.json({ error: "The Change order contract email is turned off on Email Settings. Nothing was sent or saved." }, { status: 409 });
  }
  const contract = await prisma.changeOrderContract.create({
    data: {
      changeOrderId,
      contractPdfFilename: filename,
      signingStatus: "EMAILED",
      customerEmail: recipientEmail,
      unsignedPdfUrl: `data:application/pdf;base64,${pdfBase64}`,
      sentAt: new Date(),
      sentTo: recipientEmail,
      sentBy: auth.email,
    },
  });
  return NextResponse.json({
    // SKIPPED: this server has no email key (local dev); saved, but nothing went out.
    warning: sent === "SKIPPED" ? "Saved, but email isn't set up on this server, so nothing was sent." : null,
    contract: {
      id: contract.id,
      contractPdfFilename: filename,
      docusealTemplateId: null,
      signingStatus: "EMAILED",
      customerEmail: recipientEmail,
      docusealSubmissionId: null,
      signedAt: null,
      signedDocumentUrl: null,
      sentAt: contract.sentAt?.toISOString() ?? null,
    },
  });
}
