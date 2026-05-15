import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { evaluateEmployeeCompliance } from "@/lib/erp/employees";

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

export async function GET() {
  const employees = await prisma.employee.findMany({
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    include: {
      documents: { orderBy: [{ expiresAt: "asc" }, { createdAt: "desc" }] },
    },
  });

  const rows = employees.map((e) => {
    const requiredDocs = Array.isArray(e.requiredDocuments)
      ? (e.requiredDocuments as unknown[]).filter((v): v is string => typeof v === "string")
      : [];
    return { ...e, compliance: evaluateEmployeeCompliance(e.status, requiredDocs, e.documents) };
  });
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const firstName = String(body.firstName || "").trim();
  const lastName = String(body.lastName || "").trim();
  if (!firstName || !lastName) {
    return NextResponse.json({ error: "firstName and lastName are required" }, { status: 400 });
  }

  const statusRaw = String(body.status || "ACTIVE").toUpperCase();
  const status = STATUSES.includes(statusRaw as (typeof STATUSES)[number]) ? statusRaw : "ACTIVE";

  const hireDate = parseDate(body.hireDate);
  if (body.hireDate !== undefined && hireDate === undefined) {
    return NextResponse.json({ error: "Invalid hireDate" }, { status: 400 });
  }
  const hourlyPayCents = parseHourlyPayCents(body.hourlyPay);
  if (body.hourlyPay !== undefined && hourlyPayCents === undefined) {
    return NextResponse.json({ error: "Invalid hourlyPay" }, { status: 400 });
  }

  try {
    const employee = await prisma.employee.create({
      data: {
        firstName,
        lastName,
        email: body.email ? String(body.email).trim().toLowerCase() : null,
        phone: body.phone ? String(body.phone).trim() : null,
        role: body.role ? String(body.role).trim() : null,
        hourlyPayCents: hourlyPayCents ?? null,
        defaultProject: body.defaultProject ? String(body.defaultProject).trim() : null,
        status,
        hireDate: hireDate ?? null,
        notes: body.notes ? String(body.notes).trim() : null,
      },
    });
    return NextResponse.json(employee);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "Email already exists" }, { status: 409 });
    }
    console.error("POST /api/erp/employees", e);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}