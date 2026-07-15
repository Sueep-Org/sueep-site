import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canSeeFinancials } from "@/lib/erpAuth";

function firstOfMonth(iso: string): Date | null {
  const d = new Date(`${iso}-01T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function PATCH(req: Request) {
  const auth = await getErpAuth();
  if (!auth || !canSeeFinancials(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const employeeId = String(body.employeeId || "").trim();
  const periodStart = typeof body.month === "string" ? firstOfMonth(body.month) : null;
  if (!employeeId) return NextResponse.json({ error: "employeeId is required" }, { status: 400 });
  if (!periodStart) return NextResponse.json({ error: "month is required (YYYY-MM)" }, { status: 400 });
  if (body.paid === undefined) return NextResponse.json({ error: "paid is required" }, { status: 400 });

  const paidAt = body.paid ? new Date() : null;

  try {
    const payment = await prisma.offshorePayrollPayment.upsert({
      where: { employeeId_periodStart: { employeeId, periodStart } },
      create: { employeeId, periodStart, paidAt },
      update: { paidAt },
    });
    return NextResponse.json(payment);
  } catch (e) {
    console.error("PATCH /api/erp/offshore-payroll/payment", e);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
