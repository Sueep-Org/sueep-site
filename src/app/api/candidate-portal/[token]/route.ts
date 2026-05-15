import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type PaperworkItem = { label: string; url: string };

type Ctx = { params: Promise<{ token: string }> };

async function resolveCandidate(token: string) {
  const candidate = await prisma.candidateApplication.findUnique({
    where: { paperworkUploadToken: token },
    select: {
      id: true,
      fullName: true,
      email: true,
      status: true,
      paperwork: true,
      paperworkUploadTokenExpiry: true,
    },
  });
  if (!candidate) return null;
  if (
    !candidate.paperworkUploadTokenExpiry ||
    candidate.paperworkUploadTokenExpiry < new Date()
  ) {
    return null;
  }
  return candidate;
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { token } = await params;
  const candidate = await resolveCandidate(token);
  if (!candidate) {
    return NextResponse.json({ error: "Link not found or expired" }, { status: 404 });
  }

  const paperwork = (candidate.paperwork ?? []) as PaperworkItem[];
  return NextResponse.json({
    fullName: candidate.fullName,
    paperwork,
    expiry: candidate.paperworkUploadTokenExpiry!.toISOString(),
  });
}

// Called by the portal client after a file is uploaded to Firebase Storage.
// Body: { label: string; url: string }
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { token } = await params;
  const candidate = await resolveCandidate(token);
  if (!candidate) {
    return NextResponse.json({ error: "Link not found or expired" }, { status: 404 });
  }

  let body: { label?: unknown; url?: unknown };
  try {
    body = (await req.json()) as { label?: unknown; url?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const label = typeof body.label === "string" ? body.label.trim() : "";
  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!label || !url) {
    return NextResponse.json({ error: "label and url are required" }, { status: 400 });
  }

  // Only allow https:// URLs pointing to Firebase Storage or known safe hosts
  if (!url.startsWith("https://")) {
    return NextResponse.json({ error: "url must be https" }, { status: 400 });
  }

  const paperwork = (candidate.paperwork ?? []) as PaperworkItem[];
  const exists = paperwork.some((p) => p.label === label);
  if (!exists) {
    return NextResponse.json({ error: "Document label not found" }, { status: 400 });
  }

  const updated = paperwork.map((p) => (p.label === label ? { ...p, url } : p));
  await prisma.candidateApplication.update({
    where: { id: candidate.id },
    data: { paperwork: updated },
  });

  return NextResponse.json({ ok: true });
}
