import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseOfferValues } from "@/lib/erp/offerLetters";
import { loadLetter, offerLetterFilename, requireOfferCandidate, stageData } from "@/lib/erp/offerLetterServer";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; letterId: string }> };

const MAX_FILE_BYTES = 10 * 1024 * 1024;

/**
 * POST (form data: file, signedAt?): the signed copy the candidate sent back.
 * Saved as a signed CandidateContract, so it shows in the Signing tab and
 * moves to the employee profile at hand-off like any other contract. Moves
 * the candidate to Hired.
 */
export async function POST(req: Request, ctx: Ctx) {
  const { id, letterId } = await ctx.params;
  const { candidate, error } = await requireOfferCandidate(id);
  if (error) return error;

  const letter = await loadLetter(id, letterId);
  if (!letter) return NextResponse.json({ error: "Letter not found" }, { status: 404 });
  if (letter.status !== "SENT") return NextResponse.json({ error: "Only a sent letter can be marked signed" }, { status: 409 });

  const fd = await req.formData().catch(() => null);
  const file = fd?.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (file.type !== "application/pdf") return NextResponse.json({ error: "Upload the signed letter as a PDF" }, { status: 415 });
  if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: "File must be 10 MB or smaller" }, { status: 413 });

  const raw = String(fd?.get("signedAt") ?? "");
  const signedAt = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T12:00:00Z`) : new Date();
  const name = offerLetterFilename(candidate.fullName, parseOfferValues(letter.values).title).replace(/\.pdf$/, " (signed).pdf");
  const dataUrl = `data:application/pdf;base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`;

  await prisma.$transaction(async (tx) => {
    const contract = await tx.candidateContract.create({
      data: { candidateId: id, contractPdfFilename: name, signingStatus: "SIGNED", signedAt, signedDocumentUrl: dataUrl },
      select: { id: true },
    });
    await tx.offerLetter.update({ where: { id: letter.id }, data: { status: "SIGNED", signedAt, candidateContractId: contract.id } });
    // A signed offer is a hire: Hired opens onboarding (status ONBOARDING).
    await tx.candidateApplication.update({ where: { id }, data: stageData("HIRED") });
  });
  return NextResponse.json({ ok: true });
}
