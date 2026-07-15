import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canViewEmployeeSsn } from "@/lib/erpAuth";

type Ctx = { params: Promise<{ id: string }> };

const STATUSES = ["ACTIVE", "INACTIVE"] as const;
const BACKGROUND_CHECK_STATUSES = ["PASSED", "FAILED", "PENDING", "NOT_DONE"] as const;

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
  // ssn is only ever exposed via the dedicated, role-gated reveal endpoint.
  const { ssn: _ssn, ...safeEmployee } = employee;
  return NextResponse.json(safeEmployee);
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
  if (body.payType !== undefined) {
    const pt = String(body.payType || "").toUpperCase();
    if (pt !== "HOURLY" && pt !== "SALARY") return NextResponse.json({ error: "Invalid payType" }, { status: 400 });
    data.payType = pt;
  }
  if (body.hourlyPay !== undefined) {
    const cents = parseHourlyPayCents(body.hourlyPay);
    if (cents === undefined) return NextResponse.json({ error: "Invalid hourlyPay" }, { status: 400 });
    data.hourlyPayCents = cents;
  }
  if (body.annualSalary !== undefined) {
    const cents = parseHourlyPayCents(body.annualSalary);
    if (cents === undefined) return NextResponse.json({ error: "Invalid annualSalary" }, { status: 400 });
    data.annualSalaryCents = cents;
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
  if (body.bankAccountType !== undefined) data.bankAccountType = body.bankAccountType ? String(body.bankAccountType).trim() : null;
  if (body.bankAccountNumber !== undefined) data.bankAccountNumber = body.bankAccountNumber ? String(body.bankAccountNumber).trim() : null;
  if (body.bankRoutingNumber !== undefined) data.bankRoutingNumber = body.bankRoutingNumber ? String(body.bankRoutingNumber).trim() : null;
  if (body.ssn !== undefined) {
    const auth = await getErpAuth();
    if (!auth || !canViewEmployeeSsn(auth.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    data.ssn = body.ssn ? String(body.ssn).trim() : null;
  }
  if (body.requiredDocuments !== undefined) {
    if (!Array.isArray(body.requiredDocuments)) {
      return NextResponse.json({ error: "requiredDocuments must be an array" }, { status: 400 });
    }
    data.requiredDocuments = (body.requiredDocuments as unknown[]).filter((v): v is string => typeof v === "string");
  }
  if (body.backgroundCheckStatus !== undefined) {
    const bcs = String(body.backgroundCheckStatus || "").toUpperCase();
    if (!BACKGROUND_CHECK_STATUSES.includes(bcs as (typeof BACKGROUND_CHECK_STATUSES)[number])) {
      return NextResponse.json({ error: "Invalid backgroundCheckStatus" }, { status: 400 });
    }
    data.backgroundCheckStatus = bcs;
  }

  try {
    const employee = await prisma.employee.update({ where: { id }, data });
    const { ssn: _ssn, ...safeEmployee } = employee;
    return NextResponse.json(safeEmployee);
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