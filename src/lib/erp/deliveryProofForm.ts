import type { DeliveryDoneDetails } from "./invoiceDelivery";

// Vercel caps request bodies at about 4.5 MB.
const MAX_SIZE = 4 * 1024 * 1024;
const ALLOWED = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

/** Reads the portal number, note and proof file sent by Mark uploaded, Mark sent and Resubmit. */
export async function readDeliveryProofForm(req: Request): Promise<{ details: DeliveryDoneDetails } | { error: string; status: number }> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return { error: "Invalid form data", status: 400 };
  }
  const text = (key: string, max: number) => String(form.get(key) ?? "").trim().slice(0, max) || null;
  const file = form.get("file");
  let proof: DeliveryDoneDetails["proof"] = null;
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_SIZE) return { error: "File too large (max 4 MB)", status: 413 };
    if (!ALLOWED.has(file.type)) return { error: "PDF or photo only (PDF, JPG, PNG, WEBP, HEIC)", status: 415 };
    proof = { filename: file.name.slice(0, 200) || "proof", mimeType: file.type, data: Buffer.from(await file.arrayBuffer()) };
  }
  return { details: { portalReference: text("reference", 100), note: text("note", 1000), proof } };
}
