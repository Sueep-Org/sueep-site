import { prisma } from "@/lib/prisma";
import { utcDateKey } from "@/lib/erp/dates";
import { loadJanitorialShifts } from "@/lib/erp/janitorialScheduleServer";
import { distanceMeters, resolveJanitorialHours, type ResolvedShiftHours } from "@/lib/erp/janitorialHours";
import { ensureBuildingCoordinates } from "@/lib/erp/geocode";

/** Buildings looked up per load at most, so a page never waits on many geocoder calls. */
const MAX_GEOCODES_PER_LOAD = 5;

/** Every janitorial shift in [start, end] (UTC-midnight labels, inclusive) with its resolved hours. */
export async function loadJanitorialHours(start: Date, end: Date): Promise<ResolvedShiftHours[]> {
  const [shifts, entries, contracts] = await Promise.all([
    loadJanitorialShifts(start, end),
    prisma.janitorialTimeEntry.findMany({ where: { date: { gte: start, lte: end } } }),
    prisma.recurringContract.findMany({
      select: {
        id: true,
        building: { select: { id: true, name: true, latitude: true, longitude: true, geocodeStatus: true } },
      },
    }),
  ]);

  // Buildings that have clock-ins with GPS but no coordinates yet (normally
  // looked up right after the first clock-in, see /api/clock) get one try here.
  const coordsByContract = new Map<string, { latitude: number; longitude: number }>();
  const needLookup = new Set<string>();
  const contractIdsWithGps = new Set(entries.filter((e) => e.clockInLatitude != null || e.clockOutLatitude != null).map((e) => e.recurringContractId));
  for (const c of contracts) {
    if (c.building.latitude != null && c.building.longitude != null) {
      coordsByContract.set(c.id, { latitude: c.building.latitude, longitude: c.building.longitude });
    } else if (contractIdsWithGps.has(c.id) && c.building.geocodeStatus == null) {
      needLookup.add(c.id);
    }
  }
  for (const contractId of Array.from(needLookup).slice(0, MAX_GEOCODES_PER_LOAD)) {
    const buildingId = contracts.find((c) => c.id === contractId)!.building.id;
    const coords = await ensureBuildingCoordinates(buildingId);
    if (coords) coordsByContract.set(contractId, coords);
  }

  const employeeIds = Array.from(new Set(entries.map((e) => e.employeeId)));
  const employees = employeeIds.length
    ? await prisma.employee.findMany({ where: { id: { in: employeeIds } }, select: { id: true, firstName: true, lastName: true } })
    : [];

  const distance = (building: { latitude: number; longitude: number } | undefined, lat: number | null, lng: number | null, accuracy: number | null) =>
    building && lat != null && lng != null ? { meters: distanceMeters(building, { latitude: lat, longitude: lng }), accuracy } : null;

  return resolveJanitorialHours({
    shifts,
    entries: entries.map((e) => {
      const building = coordsByContract.get(e.recurringContractId);
      return {
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
        clockInDistance: distance(building, e.clockInLatitude, e.clockInLongitude, e.clockInAccuracy),
        clockOutDistance: distance(building, e.clockOutLatitude, e.clockOutLongitude, e.clockOutAccuracy),
      };
    }),
    contractNames: new Map(contracts.map((c) => [c.id, c.building.name])),
    employeeNames: new Map(employees.map((e) => [e.id, `${e.firstName} ${e.lastName}`.trim()])),
  });
}
