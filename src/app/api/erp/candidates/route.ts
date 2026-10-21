import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { canSeeOfficeHiring, getErpAuth } from "@/lib/erpAuth";
import { HIRING_SOURCES, isOfficeStage, isValidEmail, phoneKey, statusForStage } from "@/lib/erp/officeHiring";

const VALID_STATUSES = ["APPLIED", "INTERVIEWING", "ONBOARDING", "DENIED"];

/**
 * POST /api/erp/candidates
 * Manual candidate entry from the ERP (e.g. a walk-in or phone applicant) —
 * same underlying CandidateApplication row the public /careers form creates,
 * just entered by staff instead of the applicant. Kept intentionally lean
 * (name/email/phone/location/position/status/notes); experience and vehicle
 * questions are only ever collected through the public application.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const fullName = String(body.fullName || "").trim();
  if (!fullName) return NextResponse.json({ error: "fullName is required" }, { status: 400 });

  if (body.track === "OFFICE") return createOfficeCandidate(body, fullName);

  const email = String(body.email || "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }

  const phone = body.phone ? String(body.phone).trim() : null;
  const location = body.location ? String(body.location).trim() : "";
  const internalNotes = body.internalNotes ? String(body.internalNotes).trim() : null;

  // Same Cleaner/Painter/Supervisor checkbox convention as the public
  // application (see RoleAndExperienceFields) and the same join order
  // /api/candidate-applications uses for positionInterest.
  const rolesRaw = Array.isArray(body.roles) ? body.roles.map((r) => String(r).trim().toLowerCase()) : [];
  const positionParts: string[] = [];
  if (rolesRaw.includes("cleaner")) positionParts.push("Cleaner");
  if (rolesRaw.includes("painter")) positionParts.push("Painter");
  if (rolesRaw.includes("supervisor")) positionParts.push("Supervisor");
  const positionInterest = positionParts.length > 0 ? positionParts.join(", ") : null;

  const statusRaw = String(body.status || "APPLIED").toUpperCase();
  const status = VALID_STATUSES.includes(statusRaw) ? statusRaw : "APPLIED";

  // Same duplicate-email guard the public /careers intake uses (see
  // /api/candidate-applications) — CandidateApplication.email has no DB
  // unique constraint, so this has to be checked here, not caught via P2002.
  const existing = await prisma.candidateApplication.findFirst({
    where: { track: "FIELD", email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      { error: "A candidate with this email already exists", id: existing.id },
      { status: 409 }
    );
  }

  const candidate = await prisma.candidateApplication.create({
    data: {
      fullName,
      email,
      phone,
      positionInterest,
      status,
      internalNotes,
      ...(location ? { responses: { location } as Prisma.InputJsonValue } : {}),
    },
    select: { id: true },
  });

  return NextResponse.json({ id: candidate.id }, { status: 201 });
}

/**
 * Office candidate (Office tab): tied to a job opening, email optional since
 * many come in with just a phone number. Duplicates are checked within the
 * same opening only, by email or phone, so the same person can be a
 * candidate for two different openings.
 */
async function createOfficeCandidate(body: Record<string, unknown>, fullName: string) {
  const auth = await getErpAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSeeOfficeHiring(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const jobOpeningId = String(body.jobOpeningId || "").trim();
  if (!jobOpeningId) return NextResponse.json({ error: "Pick an opening" }, { status: 400 });
  const opening = await prisma.jobOpening.findUnique({ where: { id: jobOpeningId }, select: { id: true } });
  if (!opening) return NextResponse.json({ error: "Opening not found" }, { status: 400 });

  const email = String(body.email || "").trim().toLowerCase();
  if (email && !isValidEmail(email)) return NextResponse.json({ error: "That email doesn't look right" }, { status: 400 });
  const phone = String(body.phone || "").trim();
  if (phone && phoneKey(phone).length < 7) return NextResponse.json({ error: "That phone number looks too short" }, { status: 400 });
  if (!email && !phone) return NextResponse.json({ error: "Add a phone number or an email" }, { status: 400 });

  const location = String(body.location || "").trim();
  const expectedSalary = String(body.expectedSalary || "").trim() || null;
  const internalNotes = String(body.internalNotes || "").trim() || null;
  const sourceRaw = String(body.source || "").trim().toUpperCase();
  const source = HIRING_SOURCES.some((s) => s.value === sourceRaw) ? sourceRaw : null;
  const stage = isOfficeStage(body.stage) ? body.stage : "NEW";

  const sameOpening = await prisma.candidateApplication.findMany({
    where: { track: "OFFICE", jobOpeningId },
    select: { id: true, email: true, phone: true },
  });
  const key = phoneKey(phone);
  const dup = sameOpening.find(
    (c) => (email && c.email?.toLowerCase() === email) || (key && phoneKey(c.phone) === key),
  );
  if (dup) {
    return NextResponse.json(
      { error: "This person is already a candidate for this opening", id: dup.id },
      { status: 409 },
    );
  }

  const candidate = await prisma.candidateApplication.create({
    data: {
      track: "OFFICE",
      jobOpeningId,
      fullName,
      email: email || null,
      phone: phone || null,
      stage,
      status: statusForStage(stage),
      expectedSalary,
      source,
      shortlisted: Boolean(body.shortlisted),
      internalNotes,
      // Office candidates are entered by staff, never through the multi-step
      // public form, so they are complete from the start (no Incomplete badge).
      applicationCompletedAt: new Date(),
      ...(location ? { responses: { location } as Prisma.InputJsonValue } : {}),
    },
    select: { id: true },
  });

  return NextResponse.json({ id: candidate.id }, { status: 201 });
}
