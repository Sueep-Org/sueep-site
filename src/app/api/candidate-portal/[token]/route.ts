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
      bankAccountRequired: true,
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
    bankAccountRequired: candidate.bankAccountRequired,
  });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { token } = await params;
  const candidate = await resolveCandidate(token);
  if (!candidate) {
    return NextResponse.json({ error: "Link not found or expired" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Bank account info update
  if (body.bankAccountType !== undefined || body.bankAccountNumber !== undefined || body.bankRoutingNumber !== undefined) {
    if (!candidate.bankAccountRequired) {
      return NextResponse.json({ error: "Bank account info not required for this candidate" }, { status: 400 });
    }
    const accountType = typeof body.bankAccountType === "string" ? body.bankAccountType.trim() : null;
    const accountNumber = typeof body.bankAccountNumber === "string" ? body.bankAccountNumber.trim() : null;
    const routingNumber = typeof body.bankRoutingNumber === "string" ? body.bankRoutingNumber.trim() : null;

    if (!accountNumber || !routingNumber) {
      return NextResponse.json({ error: "Account number and routing number are required" }, { status: 400 });
    }

    await prisma.candidateApplication.update({
      where: { id: candidate.id },
      data: {
        bankAccountType: accountType,
        bankAccountNumber: accountNumber,
        bankRoutingNumber: routingNumber,
      },
    });
    return NextResponse.json({ ok: true });
  }

  // File upload URL update (legacy / Firebase Storage flow)
  const label = typeof body.label === "string" ? body.label.trim() : "";
  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!label || !url) {
    return NextResponse.json({ error: "label and url are required" }, { status: 400 });
  }

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
