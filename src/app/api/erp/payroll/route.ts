import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canSeePayroll } from "@/lib/erpAuth";
import { computePayrollRows, endOfDay, startOfDay, type PayrollRow } from "@/lib/erp/payrollRows";
import { diffPayrollRows } from "@/lib/erp/payrollClose";

export async function GET(req: Request) {
  // This route previously had no auth/role check at all — any authenticated
  // ERP session (any role) could fetch full payroll data, including every
  // employee's hourlyRateCents/grossPayCents. canSeePayroll excludes FINANCE
  // and SALES specifically, matching the /erp/payroll page's tab split.
  const auth = await getErpAuth();
  if (!auth || !canSeePayroll(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const startParam = searchParams.get("start");
  const endParam = searchParams.get("end");

  if (!startParam || !endParam) {
    return NextResponse.json({ error: "start and end query params required (YYYY-MM-DD)" }, { status: 400 });
  }

  const periodStart = startOfDay(new Date(startParam));
  const periodEnd = endOfDay(new Date(endParam));

  if (isNaN(periodStart.getTime()) || isNaN(periodEnd.getTime())) {
    return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
  }

  const [rows, close] = await Promise.all([
    computePayrollRows(periodStart, periodEnd),
    prisma.payrollPeriodClose.findUnique({ where: { periodStart } }),
  ]);

  // A closed period shows what was actually paid, plus anything that has
  // changed in the records since it was closed.
  if (close) {
    const saved = close.rows as unknown as PayrollRow[];
    return NextResponse.json({
      periodStart: startParam,
      periodEnd: endParam,
      rows: saved,
      closed: { closedAt: close.createdAt.toISOString(), closedBy: close.closedBy, totalGrossCents: close.totalGrossCents },
      changes: diffPayrollRows(saved, rows),
    });
  }
  return NextResponse.json({ periodStart: startParam, periodEnd: endParam, rows, closed: null, changes: [] });
}
