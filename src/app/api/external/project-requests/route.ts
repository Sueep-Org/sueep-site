import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail, buildProjectRequestEmail, buildProjectRequestConfirmationEmail } from "@/lib/email";
import {
  computeChangeOrderLaborEstimate,
  deriveChangeOrderSupervisorCount,
  getChangeOrderLaborRates,
  hasCustomChangeOrderLaborRate,
  CHANGE_ORDER_ESTIMATE_DAY_HOURS,
} from "@/lib/changeOrderLaborRates";
import { generateChangeOrderContractPdf } from "@/lib/contracts/buildChangeOrderContractPdf";
import { embedChangeOrderSignature } from "@/lib/contracts/fillChangeOrderPdf";

export const runtime = "nodejs";

const MAX_SIGNATURE_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB — a drawn canvas signature, not a scanned file

type Body = {
  type: "change-order" | "sov-schedule";
  projectId: string;
  requesterName: string;
  requesterEmail: string;
  // CO fields
  coTitle?: string;
  coDescription?: string;
  coEstimatedStartDate?: string;
  // Optional — when set, the CO gets its own end-day chip on the calendar
  // (via ProjectChangeOrder.endDate) the same way an internally-created CO
  // does, in addition to the day it's requested for.
  coEstimatedEndDate?: string;
  // Crew size — cleaners only. The required supervisor(s) are always
  // derived server-side (deriveChangeOrderSupervisorCount), never accepted
  // from the client (see ProjectManagerForm — no supervisor input exists).
  coCleanerCount?: string;
  // Set when the requester marked this CO as not needing a crew at all
  // (material-only, price adjustment, subcontracted work, etc.) — see
  // ProjectChangeOrder.noCrewRequired.
  coNoCrewRequired?: boolean;
  // Priced-CO signing fields — sent together once the requester draws their
  // signature on the "Sign Contract" step (see ProjectManagerForm +
  // SignaturePadInput). clientCompany/clientAddress feed the contract PDF
  // the same way they do for the unsigned preview
  // (/api/co-request-contract-pdf). signaturePngDataUrl is a canvas-drawn
  // image, never typed text, so the PDF's "signature" field can't just be
  // filled in with plain text (see embedChangeOrderSignature).
  clientCompany?: string;
  clientAddress?: string;
  signaturePngDataUrl?: string;
  signaturePrintedName?: string;
  // SOV fields
  sovItemId?: string;
  desiredDate?: string;
  comments?: string;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { type, projectId, requesterEmail, requesterName } = body;
  if (!type || !projectId || !requesterEmail?.trim() || !requesterName?.trim()) {
    return NextResponse.json({ error: "type, projectId, requesterName and requesterEmail are required" }, { status: 400 });
  }
  if (type === "change-order" && !body.coTitle?.trim()) {
    return NextResponse.json({ error: "coTitle is required for change order requests" }, { status: 400 });
  }
  if (type === "change-order" && !body.coEstimatedStartDate) {
    return NextResponse.json({ error: "coEstimatedStartDate is required for change order requests" }, { status: 400 });
  }
  if (
    type === "change-order" &&
    body.coEstimatedEndDate &&
    body.coEstimatedStartDate &&
    body.coEstimatedEndDate < body.coEstimatedStartDate
  ) {
    return NextResponse.json({ error: "coEstimatedEndDate must be on or after coEstimatedStartDate" }, { status: 400 });
  }
  if (type === "sov-schedule" && !body.desiredDate) {
    return NextResponse.json({ error: "desiredDate is required for SOV scheduling" }, { status: 400 });
  }
  if (type === "change-order" && body.signaturePngDataUrl) {
    if (!body.signaturePngDataUrl.startsWith("data:image/png;base64,")) {
      return NextResponse.json({ error: "Signature must be a PNG image" }, { status: 400 });
    }
    if (body.signaturePngDataUrl.length > MAX_SIGNATURE_IMAGE_BYTES) {
      return NextResponse.json({ error: "Signature image is too large" }, { status: 413 });
    }
    if (!body.signaturePrintedName?.trim()) {
      return NextResponse.json({ error: "Printed name is required to sign" }, { status: 400 });
    }
    if (!body.clientCompany?.trim() || !body.clientAddress?.trim()) {
      return NextResponse.json({ error: "Client company and address are required to sign" }, { status: 400 });
    }
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      jobTitle: true,
      supervisor: true,
      supervisorUser: { select: { email: true } },
      laborRateCard: true,
    },
  });

  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  // Create a change order record when type is change-order
  let changeOrderId: string | null = null;
  // Set below once the signed contract PDF is generated, so the requester's
  // confirmation email can attach it — the whole reason they went through
  // the "review, then sign" flow was to see and keep this document.
  let signedContractAttachment: { filename: string; content: Buffer } | null = null;
  // Recomputed server-side against the project's real rate — never trust a
  // client-sent total. Stays null (no price stored at all) for any project
  // that hasn't had a real Labor rate set (see hasCustomChangeOrderLaborRate),
  // same "don't surface the internal default as if it were reviewed" rule
  // the price-estimate endpoint follows.
  let quotedPriceCents: number | null = null;
  const cleanerCount = Math.max(0, Math.round(Number(body.coCleanerCount) || 0));
  const supervisorCount = deriveChangeOrderSupervisorCount(cleanerCount);
  if (type === "change-order") {
    const estimatedStartDate = body.coEstimatedStartDate
      ? new Date(`${body.coEstimatedStartDate}T00:00:00Z`)
      : null;
    const estimatedEndDate = body.coEstimatedEndDate
      ? new Date(`${body.coEstimatedEndDate}T00:00:00Z`)
      : null;
    const priced = hasCustomChangeOrderLaborRate(project.laborRateCard) && (cleanerCount > 0 || supervisorCount > 0);
    if (priced) {
      const rates = getChangeOrderLaborRates(project.laborRateCard);
      const estimate = computeChangeOrderLaborEstimate(
        { cleanerCount, supervisorCount, hours: CHANGE_ORDER_ESTIMATE_DAY_HOURS },
        rates,
      );
      quotedPriceCents = estimate.totalCents;
    }
    const co = await prisma.projectChangeOrder.create({
      data: {
        projectId,
        title: body.coTitle!.trim(),
        description: body.coDescription?.trim() || null,
        requestedBy: `${requesterName.trim()} <${requesterEmail.trim()}>`,
        status: "SUBMITTED",
        requestedDate: estimatedStartDate ?? new Date(),
        // Optional — lets this CO show up on the schedule calendar on its
        // end day too, exactly like a CO scheduled internally (see the
        // ProjectChangeOrder.endDate doc comment).
        endDate: estimatedEndDate,
        estLaborers: cleanerCount > 0 ? cleanerCount : null,
        estSupervisors: supervisorCount > 0 ? supervisorCount : null,
        noCrewRequired: body.coNoCrewRequired === true,
        estHours: priced ? CHANGE_ORDER_ESTIMATE_DAY_HOURS : null,
        contractValueCents: quotedPriceCents,
      },
      select: { id: true },
    });
    changeOrderId = co.id;

    // The requester drew their signature in the browser (see
    // SignaturePadInput + ProjectManagerForm's "Sign Contract" step) rather
    // than typing into a PDF form field. Regenerate the same contract PDF
    // (mirrors /api/co-request-contract-pdf) and stamp that signature image
    // onto it server-side. Store it the same way the ERP's own "Already
    // signed? Upload it here" path does, as a base64 data URL, non-fatal on
    // failure since the CO itself is already created and notified regardless.
    if (body.signaturePngDataUrl) {
      try {
        const contract = await generateChangeOrderContractPdf({
          projectId,
          coTitle: body.coTitle!.trim(),
          coDescription: body.coDescription?.trim() || undefined,
          coEstimatedStartDate: body.coEstimatedStartDate,
          coCleanerCount: body.coCleanerCount,
          clientCompany: body.clientCompany!.trim(),
          clientAddress: body.clientAddress!.trim(),
          requesterName: requesterName.trim(),
          requesterEmail: requesterEmail.trim(),
        });
        if (!contract.ok) throw new Error(contract.error);
        const signedBytes = await embedChangeOrderSignature(contract.pdfBytes, {
          signaturePngDataUrl: body.signaturePngDataUrl,
          printedName: body.signaturePrintedName!.trim(),
          signatureDate: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
        });
        const signedDocumentUrl = `data:application/pdf;base64,${Buffer.from(signedBytes).toString("base64")}`;
        const contractFilename = `${body.coTitle!.trim().replace(/[^\w\- ]+/g, "").trim() || "change-order"}.pdf`;
        await prisma.changeOrderContract.create({
          data: {
            changeOrderId,
            contractPdfFilename: contractFilename,
            signingStatus: "SIGNED",
            customerEmail: requesterEmail.trim(),
            signedAt: new Date(),
            signedDocumentUrl,
          },
        });
        signedContractAttachment = { filename: contractFilename, content: Buffer.from(signedBytes) };
      } catch (err) {
        console.error("Failed to generate/store signed ChangeOrderContract (non-fatal):", err);
      }
    }
  }

  // A "Schedule SOV Work" request always lands as a real ProjectDayAssignment
  // (no supervisor/PM), the same row shape a Sueep staffer creates when
  // scheduling manually via the "+" button, with the SOV item attached if
  // one was picked. That's deliberate: it means this shows up on the
  // calendar exactly like an internally-scheduled assignment (same chip,
  // same click-to-open coverage editor, same delete button), not a separate
  // lightweight "request" chip that only looks similar. Kept out of
  // ProjectChangeOrder entirely, see that model's own comment for why.
  let sovDescription: string | undefined;
  if (type === "sov-schedule") {
    if (body.sovItemId) {
      const sovItem = await prisma.projectSOVItem.findFirst({
        where: { id: body.sovItemId, sov: { projectId } },
        select: { description: true },
      });
      if (!sovItem) return NextResponse.json({ error: "SOV item not found" }, { status: 404 });
      sovDescription = sovItem.description;
    }

    const date = new Date(`${body.desiredDate}T00:00:00Z`);
    // Preserved here (not just in the notification email) so "who asked for
    // this" stays visible on the calendar chip itself, not just in an inbox.
    // Merged into the day's existing comment rather than overwriting it, in
    // case a supervisor already noted something for that day.
    const requesterLine = `Requested by ${requesterName.trim()} via project portal${
      body.comments?.trim() ? `: ${body.comments.trim()}` : ""
    }`;
    const existingAssignment = await prisma.projectDayAssignment.findUnique({
      where: { projectId_date: { projectId, date } },
      select: { comment: true },
    });
    const mergedComment = existingAssignment?.comment ? `${existingAssignment.comment}\n${requesterLine}` : requesterLine;
    await prisma.projectDayAssignment.upsert({
      where: { projectId_date: { projectId, date } },
      create: {
        projectId,
        date,
        comment: mergedComment,
        sovItems: body.sovItemId ? { connect: [{ id: body.sovItemId }] } : undefined,
      },
      update: {
        comment: mergedComment,
        sovItems: body.sovItemId ? { connect: [{ id: body.sovItemId }] } : undefined,
      },
    });
  }

  // Build notification recipients
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() ?? "";
  const projectUrl = appUrl
    ? changeOrderId
      ? `${appUrl}/erp/projects/${project.id}/change-orders/${changeOrderId}`
      : `${appUrl}/erp/projects/${project.id}`
    : null;

  const recipients: string[] = [];

  // Supervisor (ERP user linked to the project)
  if (project.supervisorUser?.email) {
    recipients.push(project.supervisorUser.email);
  } else if (project.supervisor?.trim()) {
    // Try to find the supervisor by name in the Employee table
    const [firstName, ...rest] = project.supervisor.trim().split(" ");
    const lastName = rest.join(" ");
    const emp = await prisma.employee.findFirst({
      where: {
        firstName: { equals: firstName, mode: "insensitive" },
        lastName: { equals: lastName, mode: "insensitive" },
        email: { not: null },
      },
      select: { email: true },
    });
    if (emp?.email) recipients.push(emp.email);
  }

  // Default Sueep PM as fallback/CC
  const sueepEmail = (process.env.DOCUSEAL_SUEEP_SIGNER_EMAIL ?? "david@sueep.com").trim();
  if (!recipients.includes(sueepEmail)) recipients.push(sueepEmail);
  if (!recipients.includes("jennifer@sueep.com")) recipients.push("jennifer@sueep.com");

  // Estimating always CC'd
  const estimatingEmail = "estimating@sueep.com";
  if (!recipients.includes(estimatingEmail)) recipients.push(estimatingEmail);

  const typeLabel = type === "change-order" ? "Change Order Request" : "SOV Work Scheduling Request";
  const html = buildProjectRequestEmail({
    type,
    projectTitle: project.jobTitle,
    requesterName: requesterName.trim(),
    requesterEmail: requesterEmail.trim(),
    coTitle: body.coTitle,
    coDescription: body.coDescription,
    coEstimatedStartDate: body.coEstimatedStartDate,
    coEstimatedEndDate: body.coEstimatedEndDate,
    coCleanerCount: cleanerCount > 0 ? cleanerCount : undefined,
    coSupervisorCount: supervisorCount > 0 ? supervisorCount : undefined,
    coQuotedPriceCents: quotedPriceCents ?? undefined,
    sovDescription,
    desiredDate: body.desiredDate,
    comments: body.comments,
    projectUrl,
  });

  const confirmationHtml = buildProjectRequestConfirmationEmail({
    type,
    projectTitle: project.jobTitle,
    requesterName: requesterName.trim(),
    coTitle: body.coTitle,
    coEstimatedStartDate: body.coEstimatedStartDate,
    coEstimatedEndDate: body.coEstimatedEndDate,
    coQuotedPriceCents: quotedPriceCents ?? undefined,
    sovDescription,
    desiredDate: body.desiredDate,
  });

  await Promise.all([
    // Internal notification to supervisors/PM with ERP link
    ...recipients.map((to) =>
      sendEmail({
        to,
        subject: `${typeLabel}: ${project.jobTitle}`,
        html,
        replyTo: requesterEmail.trim(),
      }).catch((err) => console.error(`Failed to send to ${to}:`, err))
    ),
    // Confirmation to the requester — no ERP link. Carries their own copy of
    // the signed contract when this request was signed (see
    // signedContractAttachment above) — otherwise they'd never get one.
    sendEmail({
      to: requesterEmail.trim(),
      subject: `Your request was received — ${project.jobTitle}`,
      html: confirmationHtml,
      ...(signedContractAttachment ? { attachments: [signedContractAttachment] } : {}),
    }).catch((err) => console.error("Failed to send requester confirmation:", err)),
  ]);

  return NextResponse.json({ ok: true });
}
