/**
 * When a candidate becomes an employee or a contractor, their uploads and
 * contracts move onto the new profile and the candidate profile is deleted,
 * so they stop showing on the Candidates page.
 *
 * Everything is copied before the delete, in one transaction: if any step
 * fails, the candidate is left as it was.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const CONTRACT_FIELDS = {
  createdAt: true,
  contractPdfFilename: true,
  docusealTemplateId: true,
  signingStatus: true,
  signerEmail: true,
  docusealSubmissionId: true,
  signedAt: true,
  signedDocumentUrl: true,
} as const;

/** Uploads become employee documents (the file itself, not a link back to the candidate) and contracts become employee contracts. */
export async function moveCandidateToEmployee(candidateId: string, employeeId: string): Promise<void> {
  const [docs, contracts] = await Promise.all([
    prisma.candidateDocument.findMany({ where: { candidateApplicationId: candidateId } }),
    prisma.candidateContract.findMany({ where: { candidateId }, select: CONTRACT_FIELDS }),
  ]);
  await prisma.$transaction(async (tx) => {
    for (const d of docs) {
      const doc = await tx.employeeDocument.create({
        data: {
          employeeId,
          documentType: d.label,
          title: d.filename,
          fileData: d.data,
          fileMimeType: d.mimeType,
          fileFilename: d.filename,
          isVerified: false,
        },
        select: { id: true },
      });
      await tx.employeeDocument.update({ where: { id: doc.id }, data: { fileUrl: `/api/erp/employees/${employeeId}/documents/${doc.id}/file` } });
    }
    if (contracts.length) await tx.employeeContract.createMany({ data: contracts.map((c) => ({ ...c, employeeId })) });
    await tx.candidateApplication.delete({ where: { id: candidateId } });
  }, { timeout: 60_000 });
}

/**
 * Uploads become contractor documents, contracts become contractor
 * contracts, and the questionnaire answers are kept on the contractor
 * (manualApplicationInfo, the same shape the profile already shows). Bank
 * details fill in only where the contractor has none.
 */
export async function moveCandidateToContractor(candidateId: string, contractorId: string): Promise<void> {
  const [candidate, contractor, docs, contracts] = await Promise.all([
    prisma.candidateApplication.findUnique({
      where: { id: candidateId },
      select: { responses: true, bankAccountType: true, bankAccountNumber: true, bankRoutingNumber: true },
    }),
    prisma.contractor.findUnique({
      where: { id: contractorId },
      select: { manualApplicationInfo: true, bankAccountType: true, bankAccountNumber: true, bankRoutingNumber: true },
    }),
    prisma.candidateDocument.findMany({ where: { candidateApplicationId: candidateId } }),
    prisma.candidateContract.findMany({ where: { candidateId }, select: CONTRACT_FIELDS }),
  ]);
  if (!candidate || !contractor) throw new Error("Candidate or contractor not found");
  // The profile reads saved answers as text, so lists (checkboxes) become "a, b".
  const answers =
    candidate.responses && typeof candidate.responses === "object" && !Array.isArray(candidate.responses)
      ? Object.fromEntries(
          Object.entries(candidate.responses as Prisma.JsonObject)
            .filter(([, v]) => v != null && v !== "")
            .map(([k, v]) => [k, Array.isArray(v) ? v.join(", ") : typeof v === "object" ? JSON.stringify(v) : String(v)]),
        )
      : null;
  const kept = contractor.manualApplicationInfo && typeof contractor.manualApplicationInfo === "object" ? (contractor.manualApplicationInfo as Prisma.JsonObject) : {};
  await prisma.$transaction(async (tx) => {
    if (docs.length) {
      await tx.contractorDocument.createMany({
        data: docs.map((d) => ({ contractorId, label: d.label, filename: d.filename, mimeType: d.mimeType, size: d.size, data: d.data })),
      });
    }
    if (contracts.length) await tx.contractorContract.createMany({ data: contracts.map((c) => ({ ...c, contractorId })) });
    await tx.contractor.update({
      where: { id: contractorId },
      data: {
        // Anything already typed on the contractor wins over the application's answer.
        ...(answers ? { manualApplicationInfo: { ...answers, ...kept } } : {}),
        bankAccountType: contractor.bankAccountType ?? candidate.bankAccountType,
        bankAccountNumber: contractor.bankAccountNumber ?? candidate.bankAccountNumber,
        bankRoutingNumber: contractor.bankRoutingNumber ?? candidate.bankRoutingNumber,
        candidateApplicationId: null,
      },
    });
    await tx.candidateApplication.delete({ where: { id: candidateId } });
  }, { timeout: 60_000 });
}
