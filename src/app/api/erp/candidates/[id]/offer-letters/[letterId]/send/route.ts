import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildOfferLetterEmail, sendEmail } from "@/lib/email";
import { missingOfferBlanks, parseOfferValues, readSections } from "@/lib/erp/offerLetters";
import { loadLetter, offerLetterFilename, renderLetter, requireOfferCandidate, stageData } from "@/lib/erp/offerLetterServer";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; letterId: string }> };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST: send a draft. Freezes the PDF (with the signer's signature) so the
 * copy on file is exactly what the candidate got.
 * Body: { mode: "email", to, cc?, subject, message } or { mode: "manual" } when it went out some other way.
 */
export async function POST(req: Request, ctx: Ctx) {
  const { id, letterId } = await ctx.params;
  const { auth, candidate, error } = await requireOfferCandidate(id);
  if (error) return error;

  const letter = await loadLetter(id, letterId);
  if (!letter) return NextResponse.json({ error: "Letter not found" }, { status: 404 });
  if (letter.status !== "DRAFT") return NextResponse.json({ error: "This letter was already sent" }, { status: 409 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const missing = missingOfferBlanks(readSections(letter.sections), parseOfferValues(letter.values));
  if (missing.length) {
    return NextResponse.json({ error: `Fill in first: ${missing.map((b) => b.label).join(", ")}` }, { status: 400 });
  }

  const pdf = await renderLetter(letter, candidate.fullName, true);
  const filename = offerLetterFilename(candidate.fullName, parseOfferValues(letter.values).title);

  let emailSkipped = false;
  if (body.mode === "email") {
    const to = typeof body.to === "string" ? body.to.trim() : "";
    if (!EMAIL_RE.test(to)) return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
    const cc = (Array.isArray(body.cc) ? body.cc : [])
      .filter((e): e is string => typeof e === "string" && EMAIL_RE.test(e.trim()))
      .map((e) => e.trim());
    const subject = typeof body.subject === "string" && body.subject.trim() ? body.subject.trim().slice(0, 200) : "Your offer from Sueep";
    const message = typeof body.message === "string" ? body.message.slice(0, 5000) : "";

    let result: Awaited<ReturnType<typeof sendEmail>>;
    try {
      result = await sendEmail({
        type: "OFFER_LETTER",
        to,
        // The sender gets a copy so the thread is in their inbox when the candidate replies.
        cc: [...new Set([...cc, auth.email])].filter((e) => e.toLowerCase() !== to.toLowerCase()),
        subject,
        html: buildOfferLetterEmail({ message }),
        attachments: [{ filename, content: Buffer.from(pdf.bytes), mimeType: "application/pdf" }],
        link: `/erp/candidates/${id}`,
        sentBy: auth.email,
        keepAttachments: true,
      });
    } catch (e) {
      console.error("offer letter email failed:", e);
      return NextResponse.json({ error: "The email could not be sent" }, { status: 502 });
    }
    if (result === "OFF") return NextResponse.json({ error: "Offer letter emails are turned off on the Notifications page" }, { status: 409 });
    if (result === "NO_RECIPIENTS") return NextResponse.json({ error: "No one to send to" }, { status: 400 });
    emailSkipped = result === "SKIPPED";
  } else if (body.mode !== "manual") {
    return NextResponse.json({ error: "Pick how it was sent" }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.offerLetter.update({
      where: { id: letter.id },
      data: { status: "SENT", sentAt: new Date(), sentBy: auth.email, renderedPdf: Buffer.from(pdf.bytes) },
    }),
    // Sending an offer puts them in the Offer stage, unless they're already hired.
    prisma.candidateApplication.updateMany({ where: { id, NOT: { stage: "HIRED" } }, data: stageData("OFFER") }),
  ]);
  return NextResponse.json({ ok: true, emailSkipped });
}
