import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

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
    where: { email: { equals: email, mode: "insensitive" } },
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
