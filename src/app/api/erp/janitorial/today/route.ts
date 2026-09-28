import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageJanitorial } from "@/lib/erpAuth";
import { easternDateKey } from "@/lib/erp/janitorialHours";
import { loadJanitorialHours } from "@/lib/erp/janitorialHoursServer";
import { classifyToday } from "@/lib/erp/janitorialToday";

/** Live status of today's janitorial shifts for the Janitorial > Today panel. */
export async function GET() {
  const auth = await getErpAuth();
  if (!auth || !canManageJanitorial(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date();
  const todayKey = easternDateKey(now);
  const today = new Date(`${todayKey}T00:00:00.000Z`);
  // Yesterday too, for overnight shifts still running this morning.
  const rows = await loadJanitorialHours(new Date(today.getTime() - 86_400_000), today);
  const items = classifyToday(rows, todayKey, now);

  const employeeIds = Array.from(new Set(items.map((i) => i.employeeId)));
  const employees = employeeIds.length
    ? await prisma.employee.findMany({ where: { id: { in: employeeIds } }, select: { id: true, phone: true } })
    : [];
  const phoneById = new Map(employees.map((e) => [e.id, e.phone]));

  return NextResponse.json({
    todayKey,
    generatedAt: now.toISOString(),
    items: items.map((i) => ({ ...i, phone: phoneById.get(i.employeeId) ?? null })),
  });
}
