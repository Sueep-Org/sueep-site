import { NextResponse } from "next/server";
import { getErpAuth, canSeePayroll } from "@/lib/erpAuth";
import { computePayrollRows, endOfDay, startOfDay, type PayrollRow } from "@/lib/erp/payrollRows";
import { withEmployerTax } from "@/lib/erp/employerTaxRows";
import { withHealthCost } from "@/lib/erp/healthCostServer";

/** Company costs on top of pay: employer payroll tax and Sueep's share of health insurance. */
async function withCompanyCosts(rows: PayrollRow[], periodStart: Date, periodEnd: Date) {
  return withHealthCost(await withEmployerTax(rows, periodStart, periodEnd), periodStart, periodEnd);
}

export async function GET(req: Request) {
  // This route previously had no auth/role check at all — any authenticated
  // ERP session (any role) could fetch full payroll data, including every
  // employee's hourlyRateCents/grossPayCents. canSeePayroll excludes SALES
  // specifically, matching the /erp/payroll page's tab split.
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

  const rows = await computePayrollRows(periodStart, periodEnd);
  return NextResponse.json({ periodStart: startParam, periodEnd: endParam, rows: await withCompanyCosts(rows, periodStart, periodEnd) });
}
