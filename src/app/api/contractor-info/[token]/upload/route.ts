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

const WORKERS_COMP_LABEL = "Workers Comp COI";

type Ctx = { params: Promise<{ token: string }> };

async function resolveContractor(token: string) {
  const contractor = await prisma.contractor.findUnique({
    where: { infoToken: token },
    select: { id: true, infoTokenExpiry: true },
  });
  if (!contractor) return null;
  if (!contractor.infoTokenExpiry || contractor.infoTokenExpiry < new Date()) return null;
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

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
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
      label: WORKERS_COMP_LABEL,
      filename: file.name,
      mimeType: file.type,
      size: file.size,
      data: buffer,
    },
    select: { id: true },
  });

  return NextResponse.json({
    ok: true,
    docId: doc.id,
    downloadUrl: `/api/erp/contractors/${contractor.id}/documents/${doc.id}`,
  });
}
