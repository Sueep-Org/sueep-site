import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canSeeFinancials } from "@/lib/erpAuth";

function firstOfMonth(iso: string): Date | null {
  const d = new Date(`${iso}-01T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(req: Request) {
  const auth = await getErpAuth();
  if (!auth || !canSeeFinancials(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const monthParam = searchParams.get("month");
  const periodStart = monthParam ? firstOfMonth(monthParam) : null;
  if (!periodStart) {
    return NextResponse.json({ error: "month query param required (YYYY-MM)" }, { status: 400 });
  }

  const [employees, payments] = await Promise.all([
    prisma.employee.findMany({
      where: { isOffshore: true, status: "ACTIVE" },
      select: { id: true, firstName: true, lastName: true, offshoreMonthlyRateCents: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    }),
    prisma.offshorePayrollPayment.findMany({ where: { periodStart } }),
  ]);

  const paidByEmployeeId = new Map(payments.map((p) => [p.employeeId, p.paidAt]));

  const rows = employees.map((e) => ({
    employeeId: e.id,
    name: `${e.firstName} ${e.lastName}`.trim(),
    monthlyRateCents: e.offshoreMonthlyRateCents ?? 0,
    paidAt: paidByEmployeeId.get(e.id)?.toISOString() ?? null,
  }));

  return NextResponse.json({ periodStart: periodStart.toISOString(), rows });
}
