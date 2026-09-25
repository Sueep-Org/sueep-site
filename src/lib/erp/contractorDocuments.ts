import { prisma } from "@/lib/prisma";

export type PaperworkItem = { label: string; url: string };

export const CONTRACTOR_DOC_MAX_SIZE = 4 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

// Some browsers (notably Chrome/Windows for iPhone HEIC files) send an empty
// file.type, so fall back to the extension.
const TYPE_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};

export function resolveContractorDocMimeType(file: File): string | null {
  const type = file.type || TYPE_BY_EXTENSION[file.name.split(".").pop()?.toLowerCase() ?? ""] || "";
  return ALLOWED_TYPES.has(type) ? type : null;
}

/**
 * Stores the file and points the matching paperwork row at it.
 *
 * The contractor row is locked for the read-modify-write of `paperwork`.
 * Without the lock, uploading several documents at once had each request
 * read the same starting list and write back only its own link, so the
 * last one to finish wiped out the others (the files were stored, but
 * their rows went back to "not uploaded").
 */
export async function attachContractorDocument(
  contractorId: string,
  label: string,
  file: File,
  mimeType: string,
): Promise<{ docId: string; url: string } | { error: string }> {
  const buffer = Buffer.from(await file.arrayBuffer());

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Contractor" WHERE id = ${contractorId} FOR UPDATE`;
    const contractor = await tx.contractor.findUnique({
      where: { id: contractorId },
      select: { paperwork: true },
    });
    const paperwork = (contractor?.paperwork ?? []) as PaperworkItem[];
    if (!paperwork.some((p) => p.label === label)) return { error: "Document label not found" };

    const doc = await tx.contractorDocument.create({
      data: { contractorId, label, filename: file.name, mimeType, size: file.size, data: buffer },
      select: { id: true },
    });
    const url = `/api/erp/contractors/${contractorId}/documents/${doc.id}`;
    await tx.contractor.update({
      where: { id: contractorId },
      data: { paperwork: paperwork.map((p) => (p.label === label ? { ...p, url } : p)) },
    });
    return { docId: doc.id, url };
  }, { timeout: 20_000 });
}
