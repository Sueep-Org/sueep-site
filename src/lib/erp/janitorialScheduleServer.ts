import { prisma } from "@/lib/prisma";
import { expandJanitorialShifts, shiftHours, type JanitorialShift } from "@/lib/erp/janitorialSchedule";

/** Loads everything needed for [start, end] and expands it. */
export async function loadJanitorialShifts(start: Date, end: Date): Promise<JanitorialShift[]> {
  const [patterns, exceptions, contracts, timeOff] = await Promise.all([
    prisma.janitorialShiftPattern.findMany({
      where: {
        effectiveFrom: { lte: end },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: start } }],
      },
    }),
    prisma.janitorialShiftException.findMany({ where: { date: { gte: start, lte: end } } }),
    prisma.recurringContract.findMany({
      select: { id: true, status: true, startDate: true, endDate: true, building: { select: { name: true } } },
    }),
    prisma.employeeTimeOff.findMany({
      where: { startDate: { lte: end }, endDate: { gte: start } },
      select: { employeeId: true, startDate: true, endDate: true, type: true },
    }),
  ]);

  const employeeIds = new Set<string>([
    ...patterns.map((p) => p.employeeId),
    ...exceptions.map((e) => e.employeeId).filter((id): id is string => Boolean(id)),
  ]);
  const employees = await prisma.employee.findMany({
    where: { id: { in: Array.from(employeeIds) } },
    select: { id: true, firstName: true, lastName: true },
  });

  return expandJanitorialShifts({
    start,
    end,
    patterns,
    exceptions,
    contracts: new Map(
      contracts.map((c) => [c.id, { name: c.building.name, status: c.status, startDate: c.startDate, endDate: c.endDate }])
    ),
    employeeNames: new Map(employees.map((e) => [e.id, `${e.firstName} ${e.lastName}`.trim()])),
    timeOff,
  });
}

/**
 * Each janitor's main building: the contract they're scheduled for the most
 * hours per week right now (current and upcoming weekly shifts). Used to
 * pre-fill the building when scheduling them and on their clock page.
 */
export async function mainBuildingByEmployee(employeeIds?: string[]): Promise<Map<string, string>> {
  const today = new Date(`${new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" })}T00:00:00.000Z`);
  const patterns = await prisma.janitorialShiftPattern.findMany({
    where: {
      ...(employeeIds ? { employeeId: { in: employeeIds } } : {}),
      OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: today } }],
      recurringContract: { status: { not: "ENDED" } },
    },
    select: { employeeId: true, recurringContractId: true, daysOfWeek: true, startTime: true, endTime: true },
  });
  const weight = new Map<string, Map<string, number>>();
  for (const p of patterns) {
    const byContract = weight.get(p.employeeId) ?? new Map<string, number>();
    byContract.set(p.recurringContractId, (byContract.get(p.recurringContractId) ?? 0) + p.daysOfWeek.length * shiftHours(p.startTime, p.endTime));
    weight.set(p.employeeId, byContract);
  }
  const main = new Map<string, string>();
  for (const [employeeId, byContract] of weight) {
    const [top] = Array.from(byContract.entries()).sort((a, b) => b[1] - a[1]);
    if (top) main.set(employeeId, top[0]);
  }
  return main;
}
