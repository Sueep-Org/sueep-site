import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getErpAuth, canViewSsn } from "@/lib/erpAuth";

type Ctx = { params: Promise<{ id: string }> };

const STATUSES = ["ACTIVE", "INACTIVE"] as const;
const BACKGROUND_CHECK_STATUSES = ["PASSED", "FAILED", "PENDING", "NOT_DONE"] as const;

function parseDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const contractor = await prisma.contractor.findUnique({ where: { id } });
  if (!contractor) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // ssn is only ever exposed via the dedicated, role-gated reveal endpoint —
  // same pattern as Employee, see /api/erp/employees/[id]/route.ts.
  const { ssn: _ssn, ...safeContractor } = contractor;
  return NextResponse.json(safeContractor);
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const existing = await prisma.contractor.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const v = String(body.name || "").trim();
    if (!v) return NextResponse.json({ error: "name is required" }, { status: 400 });
    data.name = v;
  }
  if (body.email !== undefined) {
    data.email = body.email ? String(body.email).trim().toLowerCase() : null;
  }
  if (body.role !== undefined) {
    data.role = body.role ? String(body.role).trim() || null : null;
  }
  if (body.paperwork !== undefined) {
    if (!Array.isArray(body.paperwork)) {
      return NextResponse.json({ error: "paperwork must be an array" }, { status: 400 });
    }
    data.paperwork = body.paperwork;
  }
  if (body.manualApplicationInfo !== undefined) {
    const v = body.manualApplicationInfo;
    if (v !== null && (typeof v !== "object" || Array.isArray(v))) {
      return NextResponse.json({ error: "manualApplicationInfo must be an object" }, { status: 400 });
    }
    // The profile now saves this from several independent cards (Company
    // profile, Insurance, Licensing), each PATCHing only its own subset of
    // sub_* keys — merge into the existing blob instead of replacing it
    // wholesale, or saving one card would wipe out what the others already saved.
    const existingInfo =
      existing.manualApplicationInfo && typeof existing.manualApplicationInfo === "object" && !Array.isArray(existing.manualApplicationInfo)
        ? (existing.manualApplicationInfo as Record<string, unknown>)
        : {};
    data.manualApplicationInfo = v === null ? null : { ...existingInfo, ...v };
  }
  if (body.status !== undefined) {
    const v = String(body.status).toUpperCase();
    if (!STATUSES.includes(v as (typeof STATUSES)[number])) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    data.status = v;
  }

  const INFO_FIELDS = [
    "contractorFullName",
    "address",
    "dateOfBirth",
    "bankAccountType",
    "bankAccountNumber",
    "bankRoutingNumber",
    "phone",
  ] as const;
  for (const field of INFO_FIELDS) {
    if (body[field] !== undefined) {
      data[field] = typeof body[field] === "string" ? (body[field] as string).trim() || null : null;
    }
  }
  // Gated separately from the generic INFO_FIELDS loop above, same as Employee's
  // ssn handling — only a role allowed to view SSNs can write one either.
  if (body.ssn !== undefined) {
    const ssnAuth = await getErpAuth();
    if (!ssnAuth || !canViewSsn(ssnAuth.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    data.ssn = body.ssn ? String(body.ssn).trim() || null : null;
  }
  if (body.hasInsurance !== undefined) {
    data.hasInsurance = typeof body.hasInsurance === "boolean" ? body.hasInsurance : null;
  }
  if (body.workersCompCarrier !== undefined) {
    data.workersCompCarrier = body.workersCompCarrier ? String(body.workersCompCarrier).trim() || null : null;
  }
  if (body.workersCompPolicyNumber !== undefined) {
    data.workersCompPolicyNumber = body.workersCompPolicyNumber ? String(body.workersCompPolicyNumber).trim() || null : null;
  }
  if (body.workersCompExpiresAt !== undefined) {
    const d = parseDate(body.workersCompExpiresAt);
    if (d === undefined) return NextResponse.json({ error: "Invalid workersCompExpiresAt" }, { status: 400 });
    data.workersCompExpiresAt = d;
  }

  if (body.backgroundCheckStatus !== undefined) {
    const bcs = String(body.backgroundCheckStatus || "").toUpperCase();
    if (!BACKGROUND_CHECK_STATUSES.includes(bcs as (typeof BACKGROUND_CHECK_STATUSES)[number])) {
      return NextResponse.json({ error: "Invalid backgroundCheckStatus" }, { status: 400 });
    }
    data.backgroundCheckStatus = bcs;
  }
  if (body.backgroundCheckedAt !== undefined) {
    const d = parseDate(body.backgroundCheckedAt);
    if (d === undefined) return NextResponse.json({ error: "Invalid backgroundCheckedAt" }, { status: 400 });
    data.backgroundCheckedAt = d;
  }
  if (body.backgroundCheckExpiresAt !== undefined) {
    const d = parseDate(body.backgroundCheckExpiresAt);
    if (d === undefined) return NextResponse.json({ error: "Invalid backgroundCheckExpiresAt" }, { status: 400 });
    data.backgroundCheckExpiresAt = d;
  }
  if (body.backgroundCheckProvider !== undefined) {
    data.backgroundCheckProvider = body.backgroundCheckProvider ? String(body.backgroundCheckProvider).trim() : null;
  }
  if (body.backgroundCheckNotes !== undefined) {
    data.backgroundCheckNotes = body.backgroundCheckNotes ? String(body.backgroundCheckNotes).trim() : null;
  }
  if (body.backgroundCheckConsentAt !== undefined) {
    const d = parseDate(body.backgroundCheckConsentAt);
    if (d === undefined) return NextResponse.json({ error: "Invalid backgroundCheckConsentAt" }, { status: 400 });
    data.backgroundCheckConsentAt = d;
  }

  if (body.candidateApplicationId !== undefined) {
    const v = body.candidateApplicationId ? String(body.candidateApplicationId).trim() : null;
    if (v) {
      const application = await prisma.candidateApplication.findUnique({ where: { id: v }, select: { id: true } });
      if (!application) return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }
    data.candidateApplicationId = v;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  // Record a history event whenever the background check status actually
  // changes, same reasoning as EmployeeBackgroundCheckEvent.
  const statusChanged =
    typeof data.backgroundCheckStatus === "string" && data.backgroundCheckStatus !== existing.backgroundCheckStatus;

  try {
    const auth = await getErpAuth();
    const { contractor, backgroundCheckEvent } = await prisma.$transaction(async (tx) => {
      const updated = await tx.contractor.update({ where: { id }, data });
      const event = statusChanged
        ? await tx.contractorBackgroundCheckEvent.create({
            data: {
              contractorId: id,
              previousStatus: existing.backgroundCheckStatus,
              newStatus: data.backgroundCheckStatus as string,
              changedBy: auth?.email ?? null,
            },
          })
        : null;
      return { contractor: updated, backgroundCheckEvent: event };
    });
    const { ssn: _ssn, ...safeContractor } = contractor;
    return NextResponse.json({ ...safeContractor, backgroundCheckEvent });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const target = Array.isArray(e.meta?.target) ? (e.meta.target as string[]) : [];
      const message = target.some((t) => t.toLowerCase().includes("candidateapplication"))
        ? "This application is already linked to another contractor"
        : "Email already exists";
      return NextResponse.json({ error: message }, { status: 409 });
    }
    console.error("PATCH /api/erp/contractors/[id]", e);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    await prisma.contractor.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
