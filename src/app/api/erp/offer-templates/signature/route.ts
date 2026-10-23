import { NextResponse } from "next/server";
import { canEditOfferTemplates } from "@/lib/erpAuth";
import { requireOfficeHiring } from "@/lib/erp/officeHiringAccess";
import { SIGNATURE_MAX_BYTES, SIGNATURE_TYPES, deleteOfferSignature, getOfferSignature, saveOfferSignature } from "@/lib/erp/offerSignature";

export const runtime = "nodejs";

async function editor() {
  const { auth, error } = await requireOfficeHiring();
  if (error) return { auth: null, error };
  if (!canEditOfferTemplates(auth.role)) return { auth: null, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { auth, error: null };
}

/** GET: the saved signature image, for the Offer templates page. */
export async function GET() {
  const { error } = await requireOfficeHiring();
  if (error) return error;
  const sig = await getOfferSignature();
  if (!sig) return NextResponse.json({ error: "No signature saved" }, { status: 404 });
  return new NextResponse(Buffer.from(sig.base64, "base64"), {
    headers: { "Content-Type": sig.mimeType, "Cache-Control": "private, no-store" },
  });
}

/** POST (form data: file, name): save or replace the signature. */
export async function POST(req: Request) {
  const { auth, error } = await editor();
  if (error) return error;
  const fd = await req.formData().catch(() => null);
  const file = fd?.get("file");
  const name = String(fd?.get("name") ?? "").trim().slice(0, 120);
  if (!name) return NextResponse.json({ error: "Whose signature is it?" }, { status: 400 });
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "No image" }, { status: 400 });
  if (!SIGNATURE_TYPES.includes(file.type as (typeof SIGNATURE_TYPES)[number])) {
    return NextResponse.json({ error: "Use a PNG or JPG image" }, { status: 415 });
  }
  if (file.size > SIGNATURE_MAX_BYTES) return NextResponse.json({ error: "Image must be 1 MB or smaller" }, { status: 413 });
  await saveOfferSignature({
    name,
    mimeType: file.type as (typeof SIGNATURE_TYPES)[number],
    base64: Buffer.from(await file.arrayBuffer()).toString("base64"),
    updatedBy: auth.email,
    updatedAt: new Date().toISOString(),
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const { error } = await editor();
  if (error) return error;
  await deleteOfferSignature();
  return NextResponse.json({ ok: true });
}
