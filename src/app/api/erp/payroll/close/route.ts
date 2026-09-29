import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canSeePayroll } from "@/lib/erpAuth";
import { computePayrollRows, endOfDay, startOfDay } from "@/lib/erp/payrollRows";
import { totalGrossCents } from "@/lib/erp/payrollClose";

function parseDay(value: unknown): Date | null {
  const s = String(value ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Close (mark paid) a pay period: saves its payroll rows exactly as they are now. */
export async function POST(req: Request) {
  const auth = await getErpAuth();
  if (!auth || !canSeePayroll(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { start?: string; end?: string };
  const start = parseDay(body.start);
  const end = parseDay(body.end);
  if (!start || !end || end < start) return NextResponse.json({ error: "start and end are required (YYYY-MM-DD)" }, { status: 400 });

  const rows = await computePayrollRows(startOfDay(start), endOfDay(end));
  try {
    const close = await prisma.payrollPeriodClose.create({
      data: {
        periodStart: start,
        periodEnd: end,
        rows: rows as unknown as Prisma.InputJsonValue,
        totalGrossCents: totalGrossCents(rows),
        closedBy: auth.email,
      },
    });
    return NextResponse.json({ ok: true, closedAt: close.createdAt.toISOString() });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "This pay period is already closed." }, { status: 409 });
    }
    console.error("POST /api/erp/payroll/close", e);
    return NextResponse.json({ error: "Could not close the period" }, { status: 500 });
  }
}

/** Reopen a closed period (Admin only): drops the saved rows so it shows live numbers again. */
export async function DELETE(req: Request) {
  const auth = await getErpAuth();
  if (!auth || auth.role !== "ADMIN") return NextResponse.json({ error: "Only an Admin can reopen a closed pay period." }, { status: 403 });
  const start = parseDay(new URL(req.url).searchParams.get("start"));
  if (!start) return NextResponse.json({ error: "start is required (YYYY-MM-DD)" }, { status: 400 });
  await prisma.payrollPeriodClose.deleteMany({ where: { periodStart: start } });
  return NextResponse.json({ ok: true });
}
