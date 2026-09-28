import { prisma } from "@/lib/prisma";
import { expandJanitorialShifts, type JanitorialShift } from "@/lib/erp/janitorialSchedule";

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
