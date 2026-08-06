import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

const TYPES = ["VACATION", "SICK", "HALF_DAY", "UNPAID", "OTHER"] as const;

function parseDate(value: unknown): Date | null {
  if (value === undefined || value === null || value === "") return null;
  const d = new Date(`${String(value)}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const employee = await prisma.employee.findUnique({ where: { id }, select: { id: true } });
  if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const startDate = parseDate(body.startDate);
  const endDate = parseDate(body.endDate);
  if (!startDate) return NextResponse.json({ error: "startDate is required" }, { status: 400 });
  if (!endDate) return NextResponse.json({ error: "endDate is required" }, { status: 400 });
  if (endDate.getTime() < startDate.getTime()) {
    return NextResponse.json({ error: "endDate must be on or after startDate" }, { status: 400 });
  }

  const typeRaw = String(body.type || "VACATION").toUpperCase();
  const type = TYPES.includes(typeRaw as (typeof TYPES)[number]) ? typeRaw : "VACATION";

  try {
    const row = await prisma.employeeTimeOff.create({
      data: {
        employeeId: id,
        startDate,
        endDate,
        type,
        notes: body.notes ? String(body.notes).trim() : null,
      },
    });
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    console.error("POST /api/erp/employees/[id]/time-off", e);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}
