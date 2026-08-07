import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getErpAuth } from "@/lib/erpAuth";

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
  return NextResponse.json(contractor);
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
  if (body.paperwork !== undefined) {
    if (!Array.isArray(body.paperwork)) {
      return NextResponse.json({ error: "paperwork must be an array" }, { status: 400 });
    }
    data.paperwork = body.paperwork;
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
    "ssn",
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
  if (body.hasInsurance !== undefined) {
    data.hasInsurance = typeof body.hasInsurance === "boolean" ? body.hasInsurance : null;
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
    return NextResponse.json({ ...contractor, backgroundCheckEvent });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "Email already exists" }, { status: 409 });
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
