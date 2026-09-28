import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageJanitorial } from "@/lib/erpAuth";
import { parseDateKey } from "@/lib/erp/janitorialSchedule";
import { loadJanitorialShifts, mainBuildingByEmployee } from "@/lib/erp/janitorialScheduleServer";

const MAX_RANGE_DAYS = 62;

/** Calendar feed for the Schedule page's Janitorial tab. Readable by anyone
 * who can see Schedule; `canEdit` tells the client whether to offer changes. */
export async function GET(req: Request) {
  const auth = await getErpAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const start = parseDateKey(searchParams.get("start"));
  const end = parseDateKey(searchParams.get("end"));
  if (!start || !end || end < start) {
    return NextResponse.json({ error: "start and end are required (YYYY-MM-DD)" }, { status: 400 });
  }
  if ((end.getTime() - start.getTime()) / 86_400_000 > MAX_RANGE_DAYS) {
    return NextResponse.json({ error: `Range can't be longer than ${MAX_RANGE_DAYS} days` }, { status: 400 });
  }

  const canEdit = canManageJanitorial(auth.role);
  const [shifts, contracts, employees] = await Promise.all([
    loadJanitorialShifts(start, end),
    prisma.recurringContract.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, building: { select: { name: true } } },
      orderBy: { building: { name: "asc" } },
    }),
    canEdit
      ? prisma.employee.findMany({
          where: { status: "ACTIVE" },
          orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
          select: { id: true, firstName: true, lastName: true, clockToken: true },
        })
      : Promise.resolve([]),
  ]);
  const mainBuilding = canEdit ? await mainBuildingByEmployee(employees.map((e) => e.id)) : new Map<string, string>();

  return NextResponse.json({
    shifts,
    canEdit,
    contracts: contracts.map((c) => ({ id: c.id, name: c.building.name })),
    // Only whether a link exists, never the link itself (it's the janitor's credential).
    employees: employees.map((e) => ({
      id: e.id,
      name: `${e.firstName} ${e.lastName}`.trim(),
      hasClockLink: !!e.clockToken,
      // Their main building (most scheduled hours), for pre-filling new shifts.
      defaultContractId: mainBuilding.get(e.id) ?? null,
    })),
  });
}
