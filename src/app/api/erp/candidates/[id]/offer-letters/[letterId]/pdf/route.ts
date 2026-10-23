import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseOfferValues } from "@/lib/erp/offerLetters";
import { loadLetter, offerLetterFilename, pdfResponse, renderLetter, requireOfferCandidate } from "@/lib/erp/offerLetterServer";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; letterId: string }> };

/**
 * GET: the letter's PDF. Signed letters give the signed copy, sent ones the
 * exact copy sent, drafts a fresh print. ?copy=sent asks for the sent copy of
 * a signed letter. ?download=1 saves instead of opening.
 */
export async function GET(req: Request, ctx: Ctx) {
  const { id, letterId } = await ctx.params;
  const { candidate, error } = await requireOfferCandidate(id);
  if (error) return error;

  const letter = await loadLetter(id, letterId);
  if (!letter) return NextResponse.json({ error: "Letter not found" }, { status: 404 });

  const params = new URL(req.url).searchParams;
  const download = params.get("download") === "1";
  const title = parseOfferValues(letter.values).title;

  if (letter.status === "SIGNED" && letter.candidateContractId && params.get("copy") !== "sent") {
    const contract = await prisma.candidateContract.findUnique({ where: { id: letter.candidateContractId }, select: { signedDocumentUrl: true } });
    const stored = contract?.signedDocumentUrl;
    if (stored?.startsWith("data:")) {
      const bytes = Buffer.from(stored.slice(stored.indexOf(",") + 1), "base64");
      return pdfResponse(new Uint8Array(bytes), offerLetterFilename(candidate.fullName, title).replace(/\.pdf$/, " (signed).pdf"), download);
    }
  }

  const filename = offerLetterFilename(candidate.fullName, title);
  if (letter.renderedPdf) return pdfResponse(new Uint8Array(letter.renderedPdf), filename, download);
  const pdf = await renderLetter(letter, candidate.fullName, false);
  return pdfResponse(pdf.bytes, filename, download);
}
