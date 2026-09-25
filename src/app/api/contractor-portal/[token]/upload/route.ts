import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  CONTRACTOR_DOC_MAX_SIZE,
  attachContractorDocument,
  resolveContractorDocMimeType,
} from "@/lib/erp/contractorDocuments";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ token: string }> };

async function resolveContractor(token: string) {
  const contractor = await prisma.contractor.findUnique({
    where: { paperworkUploadToken: token },
    select: { id: true, paperwork: true, paperworkUploadTokenExpiry: true },
  });
  if (!contractor) return null;
  if (!contractor.paperworkUploadTokenExpiry || contractor.paperworkUploadTokenExpiry < new Date()) {
    return null;
  }
  return contractor;
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { token } = await params;
  const contractor = await resolveContractor(token);
  if (!contractor) return NextResponse.json({ error: "Link not found or expired" }, { status: 404 });

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

  if (file.size > CONTRACTOR_DOC_MAX_SIZE) {
    return NextResponse.json({ error: "File too large (max 4 MB)" }, { status: 413 });
  }
  const mimeType = resolveContractorDocMimeType(file);
  if (!mimeType) {
    return NextResponse.json({ error: "Only PDF, JPEG, PNG, WEBP, and HEIC files are accepted" }, { status: 415 });
  }

  const result = await attachContractorDocument(contractor.id, label, file, mimeType);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json({ ok: true, docId: result.docId, url: result.url });
}
