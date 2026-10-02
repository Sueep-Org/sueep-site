import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CONTRACTOR_DOC_MAX_SIZE, resolveContractorDocMimeType } from "@/lib/erp/contractorDocuments";

export const runtime = "nodejs";

/** Same label the contractor info portal saves its certificate under, so the
 * Insurance section finds it whichever side uploaded it. */
const COI_LABEL = "Workers Comp COI";

type Ctx = { params: Promise<{ id: string }> };

/** Attaches the sub's certificate of insurance from the Insurance section. Multipart: file. */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const contractor = await prisma.contractor.findUnique({ where: { id }, select: { id: true } });
  if (!contractor) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Choose a file" }, { status: 400 });
  if (file.size > CONTRACTOR_DOC_MAX_SIZE) return NextResponse.json({ error: "File too large (max 4 MB)" }, { status: 413 });
  const mimeType = resolveContractorDocMimeType(file);
  if (!mimeType) return NextResponse.json({ error: "Only PDF, JPEG, PNG, WEBP, and HEIC files are accepted" }, { status: 415 });

  const doc = await prisma.contractorDocument.create({
    data: { contractorId: id, label: COI_LABEL, filename: file.name, mimeType, size: file.size, data: Buffer.from(await file.arrayBuffer()) },
    select: { id: true, filename: true },
  });
  return NextResponse.json({ id: doc.id, filename: doc.filename });
}
