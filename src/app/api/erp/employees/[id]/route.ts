import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

const STATUSES = ["ACTIVE", "INACTIVE"] as const;

function parseDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function parseHourlyPayCents(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const raw = String(value).replace(/[$,\s]/g, "");
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n * 100);
}

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const employee = await prisma.employee.findUnique({
    where: { id },
    include: { documents: { orderBy: [{ expiresAt: "asc" }, { createdAt: "desc" }] } },
  });
  if (!employee) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(employee);
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const existing = await prisma.employee.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (body.firstName !== undefined) {
    const v = String(body.firstName || "").trim();
    if (!v) return NextResponse.json({ error: "firstName is required" }, { status: 400 });
    data.firstName = v;
  }
  if (body.lastName !== undefined) {
    const v = String(body.lastName || "").trim();
    if (!v) return NextResponse.json({ error: "lastName is required" }, { status: 400 });
    data.lastName = v;
  }
  if (body.email !== undefined) data.email = body.email ? String(body.email).trim().toLowerCase() : null;
  if (body.phone !== undefined) data.phone = body.phone ? String(body.phone).trim() : null;
  if (body.role !== undefined) data.role = body.role ? String(body.role).trim() : null;
  if (body.hourlyPay !== undefined) {
    const cents = parseHourlyPayCents(body.hourlyPay);
    if (cents === undefined) return NextResponse.json({ error: "Invalid hourlyPay" }, { status: 400 });
    data.hourlyPayCents = cents;
  }
  if (body.defaultProject !== undefined) data.defaultProject = body.defaultProject ? String(body.defaultProject).trim() : null;
  if (body.status !== undefined) {
    const statusRaw = String(body.status || "").toUpperCase();
    if (!STATUSES.includes(statusRaw as (typeof STATUSES)[number])) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    data.status = statusRaw;
  }
  if (body.hireDate !== undefined) {
    const d = parseDate(body.hireDate);
    if (d === undefined) return NextResponse.json({ error: "Invalid hireDate" }, { status: 400 });
    data.hireDate = d;
  }
  if (body.notes !== undefined) data.notes = body.notes ? String(body.notes).trim() : null;

  try {
    const employee = await prisma.employee.update({ where: { id }, data });
    return NextResponse.json(employee);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "Email already exists" }, { status: 409 });
    }
    console.error("PATCH /api/erp/employees/[id]", e);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    await prisma.employee.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}