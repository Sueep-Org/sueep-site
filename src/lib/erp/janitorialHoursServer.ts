import { prisma } from "@/lib/prisma";
import { utcDateKey } from "@/lib/erp/dates";
import { loadJanitorialShifts } from "@/lib/erp/janitorialScheduleServer";
import { resolveJanitorialHours, type ResolvedShiftHours } from "@/lib/erp/janitorialHours";

/** Every janitorial shift in [start, end] (UTC-midnight labels, inclusive) with its resolved hours. */
export async function loadJanitorialHours(start: Date, end: Date): Promise<ResolvedShiftHours[]> {
  const [shifts, entries, contracts] = await Promise.all([
    loadJanitorialShifts(start, end),
    prisma.janitorialTimeEntry.findMany({ where: { date: { gte: start, lte: end } } }),
    prisma.recurringContract.findMany({ select: { id: true, building: { select: { name: true } } } }),
  ]);

  const employeeIds = Array.from(new Set(entries.map((e) => e.employeeId)));
  const employees = employeeIds.length
    ? await prisma.employee.findMany({ where: { id: { in: employeeIds } }, select: { id: true, firstName: true, lastName: true } })
    : [];

  return resolveJanitorialHours({
    shifts,
    entries: entries.map((e) => ({
      id: e.id,
      employeeId: e.employeeId,
      contractId: e.recurringContractId,
      shiftKey: e.shiftKey,
      date: utcDateKey(e.date),
      clockInAt: e.clockInAt,
      clockOutAt: e.clockOutAt,
      manualStartTime: e.manualStartTime,
      manualEndTime: e.manualEndTime,
      manualNoShow: e.manualNoShow,
      notes: e.notes,
      hasLocation: e.clockInLatitude != null || e.clockOutLatitude != null,
    })),
    contractNames: new Map(contracts.map((c) => [c.id, c.building.name])),
    employeeNames: new Map(employees.map((e) => [e.id, `${e.firstName} ${e.lastName}`.trim()])),
  });
}
