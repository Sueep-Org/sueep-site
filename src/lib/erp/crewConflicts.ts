/**
 * Crew conflicts on the schedule, worked out from plain rows so the rules
 * can be tested without a database (dashboardJobsWaiting.ts loads the rows).
 */

export type ScheduledDay = {
  dayKey: string;
  employeeId: string | null;
  contractorId: string | null;
  /** The job; a change order carries its project's id, so it isn't a second job. */
  projectId: string;
  jobTitle: string;
  href: string;
  personName: string;
  /** Supervisors often cover more than one site a day, so only crew counts for double-booking. */
  role: "crew" | "supervisor";
};

export type TimeOffSpan = { personId: string; startKey: string; endKey: string; type: string; status: string };

export type CrewConflict = {
  id: string;
  dayKey: string;
  href: string;
  personName: string;
  detail: string;
  /** Approved time off or a double booking. False for time off that's only been asked for. */
  firm: boolean;
};

/**
 * Double-booked: an employee on two different jobs' crews the same day. A
 * sub is a company that can run more than one crew, and a supervisor often
 * covers more than one site, so neither is flagged for it.
 * Time off: anyone (employee or sub, crew or supervisor) scheduled on a day inside their time
 * off, approved or still pending. Denied time off should be filtered out
 * before calling this.
 */
export function findCrewConflicts(
  work: ScheduledDay[],
  employeeOff: TimeOffSpan[],
  contractorOff: TimeOffSpan[],
): { double: CrewConflict[]; timeOff: CrewConflict[] } {
  const byPersonDay = new Map<string, ScheduledDay[]>();
  for (const w of work) {
    if (!w.employeeId || w.role !== "crew") continue;
    const key = `${w.employeeId}::${w.dayKey}`;
    byPersonDay.set(key, [...(byPersonDay.get(key) ?? []), w]);
  }
  const double: CrewConflict[] = [];
  for (const [key, list] of byPersonDay) {
    const jobs = new Map(list.map((w) => [w.projectId, w]));
    if (jobs.size < 2) continue;
    double.push({
      id: `double-${key}`,
      dayKey: list[0].dayKey,
      href: list[0].href,
      personName: list[0].personName,
      detail: `On ${jobs.size} jobs: ${[...jobs.values()].map((w) => w.jobTitle).join(" and ")}`,
      firm: true,
    });
  }

  const timeOff: CrewConflict[] = [];
  const seen = new Set<string>();
  for (const w of work) {
    const personId = w.employeeId ?? w.contractorId;
    if (!personId) continue;
    const spans = w.employeeId ? employeeOff : contractorOff;
    const off = spans.find((t) => t.personId === personId && t.startKey <= w.dayKey && t.endKey >= w.dayKey);
    if (!off) continue;
    const key = `${personId}::${w.dayKey}::${w.projectId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const pending = off.status === "PENDING";
    const what = off.type === "HALF_DAY" ? "a half day off" : "time off";
    timeOff.push({
      id: `off-${key}`,
      dayKey: w.dayKey,
      href: w.href,
      personName: w.personName,
      detail: `${pending ? "Asked for" : "Has"} ${what}, scheduled${w.role === "supervisor" ? " to supervise" : ""} on ${w.jobTitle}`,
      firm: !pending,
    });
  }

  const byDay = (a: CrewConflict, b: CrewConflict) => a.dayKey.localeCompare(b.dayKey) || a.personName.localeCompare(b.personName);
  return { double: double.sort(byDay), timeOff: timeOff.sort(byDay) };
}
