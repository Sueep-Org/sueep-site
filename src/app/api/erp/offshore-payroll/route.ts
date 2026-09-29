import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canSeePayroll } from "@/lib/erpAuth";
import { loadPayHistories, payRateOn } from "@/lib/erp/payRates";
import { todayEasternKey } from "@/lib/erp/dates";

function firstOfMonth(iso: string): Date | null {
  const d = new Date(`${iso}-01T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(req: Request) {
  const auth = await getErpAuth();
  if (!auth || !canSeePayroll(auth.role)) {
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
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.offshorePayrollPayment.findMany({ where: { periodStart } }),
  ]);

  const paidByEmployeeId = new Map(payments.map((p) => [p.employeeId, p.paidAt]));

  // The rate for this month comes from pay history (the rate in effect on the
  // month's last day, or today for the month in progress), so an old month
  // still shows what it paid after a raise.
  const lastDay = new Date(Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, 0));
  const todayKey = todayEasternKey();
  const rateDay = lastDay.toISOString().slice(0, 10) < todayKey ? lastDay.toISOString().slice(0, 10) : todayKey;
  const histories = await loadPayHistories(employees.map((e) => e.id));

  const rows = employees.map((e) => {
    const rate = payRateOn(histories.get(e.id), rateDay);
    return {
      employeeId: e.id,
      name: `${e.firstName} ${e.lastName}`.trim(),
      monthlyRateCents: (rate?.isOffshore ? rate.offshoreMonthlyRateCents : e.offshoreMonthlyRateCents) ?? 0,
      paidAt: paidByEmployeeId.get(e.id)?.toISOString() ?? null,
    };
  });

  return NextResponse.json({ periodStart: periodStart.toISOString(), rows });
}
