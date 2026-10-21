import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { officeCandidateGuard } from "@/lib/erp/officeHiringAccess";
import { isOfficeStage, isValidEmail, phoneKey, statusForStage } from "@/lib/erp/officeHiring";
import type { Prisma } from "@prisma/client";

const VALID_STATUSES = ["APPLIED", "INTERVIEWING", "ONBOARDING", "DENIED", "HIRED"];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const blocked = await officeCandidateGuard(id);
  if (blocked) return blocked;
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

  // Office-only fields. `stage` drives `status` for office candidates (see
  // statusForStage) so a stage change never leaves the two out of step.
  const officeKeys = ["stage", "fullName", "email", "phone", "location", "expectedSalary", "shortlisted", "source", "jobOpeningId"];
  if (officeKeys.some((k) => body[k] !== undefined)) {
    const current = await prisma.candidateApplication.findUnique({
      where: { id },
      select: { track: true, responses: true },
    });
    if (!current) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    if (current.track !== "OFFICE") {
      return NextResponse.json({ error: "These fields are for office candidates only" }, { status: 400 });
    }

    if (body.stage !== undefined) {
      if (!isOfficeStage(body.stage)) return NextResponse.json({ error: "Invalid stage" }, { status: 400 });
      data.stage = body.stage;
      data.status = statusForStage(body.stage);
    }
    if (body.fullName !== undefined) {
      const fullName = String(body.fullName).trim();
      if (!fullName) return NextResponse.json({ error: "Name is required" }, { status: 400 });
      data.fullName = fullName;
    }
    if (body.email !== undefined) {
      const email = String(body.email ?? "").trim().toLowerCase();
      if (email && !isValidEmail(email)) return NextResponse.json({ error: "That email doesn't look right" }, { status: 400 });
      data.email = email || null;
    }
    if (body.phone !== undefined) {
      const phone = String(body.phone ?? "").trim();
      if (phone && phoneKey(phone).length < 7) return NextResponse.json({ error: "That phone number looks too short" }, { status: 400 });
      data.phone = phone || null;
    }
    if (body.location !== undefined) {
      const responses = { ...((current.responses as Record<string, unknown> | null) ?? {}) };
      const location = String(body.location ?? "").trim();
      if (location) responses.location = location;
      else delete responses.location;
      data.responses = responses as Prisma.InputJsonValue;
    }
    if (body.expectedSalary !== undefined) data.expectedSalary = String(body.expectedSalary ?? "").trim() || null;
    if (body.shortlisted !== undefined) data.shortlisted = Boolean(body.shortlisted);
    if (body.source !== undefined) data.source = String(body.source ?? "").trim() || null;
    if (body.jobOpeningId !== undefined) {
      const jobOpeningId = body.jobOpeningId ? String(body.jobOpeningId) : null;
      if (jobOpeningId && !(await prisma.jobOpening.findUnique({ where: { id: jobOpeningId }, select: { id: true } }))) {
        return NextResponse.json({ error: "Opening not found" }, { status: 400 });
      }
      data.jobOpeningId = jobOpeningId;
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const candidate = await prisma.candidateApplication.update({
    where: { id },
    data,
    select: { id: true, status: true, stage: true },
  });

  return NextResponse.json(candidate);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const blocked = await officeCandidateGuard(id);
  if (blocked) return blocked;
  await prisma.candidateApplication.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}