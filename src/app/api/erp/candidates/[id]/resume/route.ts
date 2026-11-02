import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { officeCandidateGuard } from "@/lib/erp/officeHiringAccess";
import { RESUME_LABEL } from "@/lib/erp/candidateResume";

export const runtime = "nodejs";

const MAX_SIZE = 4 * 1024 * 1024; // 4 MB
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
]);

type Ctx = { params: Promise<{ id: string }> };

/** Staff upload a resume. Stored as a CandidateDocument, so it moves to the employee/contractor on handoff. */
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const blocked = await officeCandidateGuard(id);
  if (blocked) return blocked;

  const exists = await prisma.candidateApplication.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "file is required" }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: "File too large (max 4 MB)" }, { status: 413 });
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Only PDF, Word, JPEG, PNG and WEBP files are accepted" }, { status: 415 });
  }

  const doc = await prisma.candidateDocument.create({
    data: {
      candidateApplicationId: id,
      label: RESUME_LABEL,
      filename: file.name,
      mimeType: file.type,
      size: file.size,
      data: Buffer.from(await file.arrayBuffer()),
    },
    select: { id: true },
  });
  return NextResponse.json({ ok: true, docId: doc.id });
}
