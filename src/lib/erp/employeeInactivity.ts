import { prisma } from "@/lib/prisma";

/** No logged labor (LaborEntry.workDate — an actual worked shift, not just
 * a calendar assignment) in this many months auto-flags an employee
 * Inactive. See flagInactiveEmployees. */
export const INACTIVITY_THRESHOLD_MONTHS = 6;

function monthsAgo(months: number): Date {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
}

export type FlagInactiveEmployeesResult = {
  flaggedCount: number;
  flagged: { id: string; name: string }[];
};

/**
 * Runs on a schedule (see /api/cron/employee-inactivity-check + vercel.json).
 * Any HOURLY, non-offshore employee currently Active whose most recent
 * logged labor (or who has never logged any) is older than
 * INACTIVITY_THRESHOLD_MONTHS gets switched to Inactive, tagged
 * statusSource "AUTO" — distinct from a person manually setting Inactive,
 * so createLaborEntryForProject knows it's safe to flip this specific
 * employee back to Active automatically the moment they log labor again (a
 * manual Inactive is never auto-reversed).
 *
 * Salary and offshore employees are skipped entirely — they're not paid
 * per logged shift (salary) or tracked via LaborEntry at all (offshore, paid
 * a fixed monthly rate via the Offshore Payroll tab), so "no recent labor
 * log" isn't a meaningful signal for either and would misflag people who are
 * actually still working.
 *
 * No notification email — the profile page's own "Auto-flagged inactive on
 * [date]" note (see EmployeeProfileEditor) and the Employees list's Activity
 * status column are the visibility here, not a digest.
 */
export async function flagInactiveEmployees(): Promise<FlagInactiveEmployeesResult> {
  const cutoff = monthsAgo(INACTIVITY_THRESHOLD_MONTHS);

  const activeEmployees = await prisma.employee.findMany({
    where: { status: "ACTIVE", isOffshore: false, payType: { not: "SALARY" } },
    select: { id: true, firstName: true, lastName: true },
  });
  if (activeEmployees.length === 0) {
    return { flaggedCount: 0, flagged: [] };
  }

  const lastWorked = await prisma.laborEntry.groupBy({
    by: ["employeeId"],
    where: { employeeId: { in: activeEmployees.map((e) => e.id) } },
    _max: { workDate: true },
  });
  const lastWorkedById = new Map(lastWorked.map((r) => [r.employeeId, r._max.workDate] as const));

  const toFlag = activeEmployees.filter((e) => {
    const last = lastWorkedById.get(e.id);
    return !last || last < cutoff;
  });
  if (toFlag.length === 0) {
    return { flaggedCount: 0, flagged: [] };
  }

  const now = new Date();
  await prisma.employee.updateMany({
    where: { id: { in: toFlag.map((e) => e.id) } },
    data: { status: "INACTIVE", statusSource: "AUTO", statusChangedAt: now },
  });

  const flagged = toFlag.map((e) => ({ id: e.id, name: `${e.firstName} ${e.lastName}`.trim() }));
  return { flaggedCount: flagged.length, flagged };
}
