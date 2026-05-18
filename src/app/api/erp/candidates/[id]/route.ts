import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const VALID_STATUSES = ["APPLIED", "INTERVIEWING", "ONBOARDING", "DENIED", "HIRED"];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await req.json()) as Record<string, unknown>;

  const data: Record<string, unknown> = {};

  if (body.status !== undefined) {
    const status = String(body.status).trim();
    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    data.status = status;
  }

  if (body.internalNotes !== undefined) {
    data.internalNotes = String(body.internalNotes).trim() || null;
  }

  if (body.paperwork !== undefined) {
    if (!Array.isArray(body.paperwork)) {
      return NextResponse.json({ error: "paperwork must be an array" }, { status: 400 });
    }
    data.paperwork = body.paperwork;
  }

  if (body.bankAccountRequired !== undefined) {
    data.bankAccountRequired = Boolean(body.bankAccountRequired);
  }

  if (body.paperworkInstructions !== undefined) {
    data.paperworkInstructions = body.paperworkInstructions ? String(body.paperworkInstructions).trim() : null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const candidate = await prisma.candidateApplication.update({
    where: { id },
    data,
    select: { id: true, status: true },
  });

  return NextResponse.json(candidate);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.candidateApplication.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}