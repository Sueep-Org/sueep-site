import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { contentDisposition } from "@/lib/contentDisposition";
import { requireOfficeHiring } from "./officeHiringAccess";
import { parseOfferValues, readSections, type OfferSection } from "./offerLetters";
import { parseCommission } from "./offerCommission";
import { renderOfferLetterPdf } from "./offerLetterPdf";
import { signatureFor } from "./offerSignature";
import { statusForStage, type OfficeStage } from "./officeHiring";

/** Candidate update for a stage move from an offer letter, keeping status in step (see statusForStage). */
export function stageData(stage: OfficeStage) {
  return { stage, status: statusForStage(stage) };
}

/**
 * For the /api/erp/candidates/[id]/offer-letters routes: office hiring roles
 * only, and the candidate must be an office candidate.
 */
export async function requireOfferCandidate(candidateId: string) {
  const { auth, error } = await requireOfficeHiring();
  if (error) return { auth: null, candidate: null, error };
  const candidate = await prisma.candidateApplication.findUnique({
    where: { id: candidateId },
    select: {
      id: true,
      fullName: true,
      email: true,
      track: true,
      jobOpening: { select: { title: true, workMode: true, salaryMinCents: true, salaryMaxCents: true } },
    },
  });
  if (!candidate || candidate.track !== "OFFICE") {
    return { auth: null, candidate: null, error: NextResponse.json({ error: "Candidate not found" }, { status: 404 }) };
  }
  return { auth, candidate, error: null };
}

/** The template's sections with this letter's on/off choices applied. */
export function applyIncluded(sections: OfferSection[], included: unknown): OfferSection[] {
  if (!Array.isArray(included)) return sections;
  const on = new Set(included.filter((k): k is string => typeof k === "string"));
  return sections.map((s) => ({ ...s, enabled: on.has(s.key) }));
}

export async function loadTemplateForLetter(templateId: unknown) {
  if (typeof templateId !== "string" || !templateId) return null;
  const t = await prisma.offerLetterTemplate.findUnique({
    where: { id: templateId },
    select: { id: true, name: true, sections: true, signerName: true, signerTitle: true },
  });
  return t ? { ...t, sections: readSections(t.sections) } : null;
}

/** Sign-by date column from the letter's YYYY-MM-DD value, if it is one. */
export function signByDateOf(values: Record<string, string>): Date | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(values.signByDate ?? "") ? new Date(`${values.signByDate}T12:00:00Z`) : null;
}

export function offerLetterFilename(fullName: string, title: string | undefined) {
  return `Offer Letter - ${[title, fullName].filter(Boolean).join(" ")}.pdf`.replace(/[\\/:*?"<>|]+/g, " ");
}

export function pdfResponse(bytes: Uint8Array, filename: string, download: boolean) {
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": contentDisposition(download ? "attachment" : "inline", filename),
      "Cache-Control": "private, no-store",
    },
  });
}

/** A saved letter and what's needed to print it. */
export async function loadLetter(candidateId: string, letterId: string) {
  return prisma.offerLetter.findFirst({
    where: { id: letterId, candidateId },
    select: {
      id: true,
      status: true,
      values: true,
      sections: true,
      commission: true,
      renderedPdf: true,
      candidateContractId: true,
      template: { select: { signerName: true, signerTitle: true, commissionDefaults: true } },
    },
  });
}

/** Prints a saved letter. `stamp` adds the company signer's signature (when sending). */
export async function renderLetter(letter: NonNullable<Awaited<ReturnType<typeof loadLetter>>>, fullName: string, stamp: boolean) {
  const signerName = letter.template?.signerName ?? null;
  return renderOfferLetterPdf({
    sections: readSections(letter.sections),
    values: parseOfferValues(letter.values),
    signerName,
    signerTitle: letter.template?.signerTitle ?? null,
    commission: parseCommission(letter.commission ?? letter.template?.commissionDefaults),
    signatureImage: stamp ? await signatureFor(signerName) : null,
    title: `Offer letter - ${fullName}`,
  });
}
