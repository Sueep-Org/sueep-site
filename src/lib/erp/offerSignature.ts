import { prisma } from "@/lib/prisma";

/**
 * The company signer's signature image, stamped on offer letters when they're
 * sent. One image, kept in AppSetting with the signer's name, and only used on
 * letters whose template is signed by that same name.
 */

const KEY = "offerLetterSignature";
export const SIGNATURE_TYPES = ["image/png", "image/jpeg"] as const;
export const SIGNATURE_MAX_BYTES = 1024 * 1024;

export type OfferSignature = { name: string; mimeType: (typeof SIGNATURE_TYPES)[number]; base64: string; updatedBy: string | null; updatedAt: string };

export async function getOfferSignature(): Promise<OfferSignature | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  if (!row) return null;
  try {
    const v = JSON.parse(row.value) as Partial<OfferSignature>;
    if (!v.name || !v.base64 || !SIGNATURE_TYPES.includes(v.mimeType as OfferSignature["mimeType"])) return null;
    return v as OfferSignature;
  } catch {
    return null;
  }
}

export async function saveOfferSignature(sig: OfferSignature) {
  const value = JSON.stringify(sig);
  await prisma.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
}

export async function deleteOfferSignature() {
  await prisma.appSetting.deleteMany({ where: { key: KEY } });
}

const sameName = (a: string | null | undefined, b: string) => (a ?? "").trim().toLowerCase() === b.trim().toLowerCase();

/** The image to stamp for a letter signed by `signerName`, or null when there's none for that person. */
export async function signatureFor(signerName: string | null | undefined) {
  const sig = await getOfferSignature();
  if (!sig || !sameName(signerName, sig.name)) return null;
  return { bytes: Buffer.from(sig.base64, "base64"), mimeType: sig.mimeType };
}
