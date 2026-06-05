import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const MAX_SIZE = 4 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
]);

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;

  const contractor = await prisma.contractor.findUnique({
    where: { id },
    select: { id: true, paperwork: true },
  });
  if (!contractor) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const label = String(formData.get("label") ?? "").trim();
  const file = formData.get("file");

  if (!label || !(file instanceof File)) {
    return NextResponse.json({ error: "label and file are required" }, { status: 400 });
  }

  const paperwork = (contractor.paperwork ?? []) as { label: string; url: string }[];
  if (!paperwork.some((p) => p.label === label)) {
    return NextResponse.json({ error: "Document label not found" }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File too large (max 4 MB)" }, { status: 413 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Only PDF, JPEG, PNG, and WEBP files are accepted" }, { status: 415 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  const doc = await prisma.contractorDocument.create({
    data: {
      contractorId: contractor.id,
      label,
      filename: file.name,
      mimeType: file.type,
      size: file.size,
      data: buffer,
    },
    select: { id: true },
  });

  const downloadUrl = `/api/erp/contractors/${contractor.id}/documents/${doc.id}`;
  const updated = paperwork.map((p) => (p.label === label ? { ...p, url: downloadUrl } : p));
  await prisma.contractor.update({
    where: { id: contractor.id },
    data: { paperwork: updated },
  });

  return NextResponse.json({ ok: true, docId: doc.id });
}
