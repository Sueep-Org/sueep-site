import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

type Ctx = { params: Promise<{ id: string }> };

const STATUSES = ["ACTIVE", "INACTIVE"] as const;

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

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  try {
    const updated = await prisma.contractor.update({ where: { id }, data });
    return NextResponse.json(updated);
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
