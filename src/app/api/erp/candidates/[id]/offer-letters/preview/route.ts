import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readSections, parseOfferValues } from "@/lib/erp/offerLetters";
import { renderOfferLetterPdf } from "@/lib/erp/offerLetterPdf";
import { parseCommission } from "@/lib/erp/offerCommission";
import { applyIncluded, loadTemplateForLetter, offerLetterFilename, pdfResponse, requireOfferCandidate } from "@/lib/erp/offerLetterServer";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST: the PDF for what's on the letter page right now, unsaved.
 * Body: { templateId } for a new letter or { letterId } for a draft, plus { values, included, commission }.
 */
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const { candidate, error } = await requireOfferCandidate(id);
  if (error) return error;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  let sections;
  let signer: { signerName: string | null; signerTitle: string | null } = { signerName: null, signerTitle: null };
  if (typeof body.letterId === "string") {
    const letter = await prisma.offerLetter.findFirst({
      where: { id: body.letterId, candidateId: id },
      select: { sections: true, template: { select: { signerName: true, signerTitle: true } } },
    });
    if (!letter) return NextResponse.json({ error: "Letter not found" }, { status: 404 });
    sections = readSections(letter.sections);
    if (letter.template) signer = letter.template;
  } else {
    const template = await loadTemplateForLetter(body.templateId);
    if (!template) return NextResponse.json({ error: "Pick a template" }, { status: 400 });
    sections = template.sections;
    signer = template;
  }

  const values = parseOfferValues(body.values);
  const pdf = await renderOfferLetterPdf({
    sections: applyIncluded(sections, body.included),
    values,
    signerName: signer.signerName,
    signerTitle: signer.signerTitle,
    commission: body.commission ? parseCommission(body.commission) : null,
    title: `Offer letter - ${candidate.fullName}`,
  });
  return pdfResponse(pdf.bytes, offerLetterFilename(candidate.fullName, values.title), false);
}
