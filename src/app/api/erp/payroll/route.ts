import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { timeOffEntryHours } from "@/lib/erp/timeOff";
import { getErpAuth, canSeePayroll } from "@/lib/erpAuth";

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

function lastNameOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] ?? name;
}

type PayrollEmployeeRef = { payType: string; status: string; isOffshore: boolean; isJanitorialContract: boolean } | null;

/** Offshore/Janitorial Contract are always excluded from the hours-driven
 * bucket (paid via their own fixed calcs below, regardless of status).
 * Salary is only excluded once INACTIVE — an active salary employee's
 * logged hours still show for reference (see the flat-pay override below),
 * but an inactive one shouldn't appear in payroll at all, unlike an hourly
 * employee who's still owed pay for hours actually worked before leaving. */
function isExcludedFromHoursDrivenPay(employee: PayrollEmployeeRef): boolean {
  if (!employee) return false;
  if (employee.isOffshore || employee.isJanitorialContract) return true;
  if (employee.payType === "SALARY" && employee.status !== "ACTIVE") return true;
  return false;
}

function fmtVacationHours(h: number): string {
  return h % 1 === 0 ? String(h) : h.toFixed(2);
}

function mondayOf(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export async function GET(req: Request) {
  // This route previously had no auth/role check at all — any authenticated
  // ERP session (any role) could fetch full payroll data, including every
  // employee's hourlyRateCents/grossPayCents. canSeePayroll excludes FINANCE
  // and SALES specifically, matching the /erp/payroll page's tab split.
  const auth = await getErpAuth();
  if (!auth || !canSeePayroll(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const startParam = searchParams.get("start");
  const endParam = searchParams.get("end");

  if (!startParam || !endParam) {
    return NextResponse.json({ error: "start and end query params required (YYYY-MM-DD)" }, { status: 400 });
  }

  const periodStart = startOfDay(new Date(startParam));
  const periodEnd = endOfDay(new Date(endParam));

  if (isNaN(periodStart.getTime()) || isNaN(periodEnd.getTime())) {
    return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
  }

  const [entries, changeOrderEntries, contractorAssignments] = await Promise.all([
    prisma.laborEntry.findMany({
      where: { workDate: { gte: periodStart, lte: periodEnd } },
      include: {
        employee: {
          select: { id: true, firstName: true, lastName: true, hourlyPayCents: true, payType: true, status: true, isOffshore: true, isJanitorialContract: true },
        },
        project: { select: { id: true, jobTitle: true } },
      },
      orderBy: { workDate: "asc" },
    }),
    prisma.projectChangeOrderLaborer.findMany({
      where: { workDate: { gte: periodStart, lte: periodEnd } },
      include: {
        employee: {
          select: { id: true, firstName: true, lastName: true, hourlyPayCents: true, payType: true, status: true, isOffshore: true, isJanitorialContract: true },
        },
        changeOrder: { select: { project: { select: { jobTitle: true } } } },
      },
      orderBy: { workDate: "asc" },
    }),
    prisma.contractorAssignment.findMany({
      where: {
        costCents: { not: null },
        OR: [
          // Assignment starts within period
          { startDate: { gte: periodStart, lte: periodEnd } },
          // Assignment ends within period
          { endDate: { gte: periodStart, lte: periodEnd } },
          // Assignment spans the entire period
          { AND: [{ startDate: { lte: periodStart } }, { endDate: { gte: periodEnd } }] },
          // No dates set — include if assignedDate is within period
          { AND: [{ startDate: null }, { endDate: null }, { assignedDate: { gte: periodStart, lte: periodEnd } }] },
        ],
      },
      include: {
        contractor: { select: { id: true, name: true } },
        project: { select: { jobTitle: true } },
      },
    }),
  ]);

  // ── Employee rows ──────────────────────────────────────────────────────
  type EmployeeKey = string;
  type WeekKey = string;

  const employeeMap = new Map<EmployeeKey, {
    employeeId: string | null;
    name: string;
    lastName: string;
    payType: string;
    hourlyRateCents: number;
    weeklyHours: Map<WeekKey, number>;
    projects: Set<string>;
    entries: { date: string; hours: number; project: string; rateCents: number }[];
  }>();

  for (const entry of entries) {
    // Offshore and Janitorial Contract employees are paid through their own
    // fixed calcs below, entirely independent of logged hours — any
    // LaborEntry they have is job-costing only and must never feed a
    // biweekly payroll gross-pay number. An INACTIVE salary employee is
    // excluded entirely too — the flat salary calc below only pays ACTIVE
    // salary employees, but without this check a former salary employee
    // with leftover/backdated LaborEntry rows would still show up here,
    // priced by the old hours-based formula instead of just disappearing.
    // (Hourly employees keep showing for hours actually worked before
    // going inactive — only salary's fixed, employment-status-based payout
    // needs this exclusion.)
    if (isExcludedFromHoursDrivenPay(entry.employee)) continue;
    const key: EmployeeKey = entry.employeeId ?? `adhoc:${entry.workerName}`;
    const name = entry.employee
      ? `${entry.employee.firstName} ${entry.employee.lastName}`.trim()
      : entry.workerName;
    const rowLastName = entry.employee ? entry.employee.lastName : lastNameOf(entry.workerName);

    if (!employeeMap.has(key)) {
      employeeMap.set(key, {
        employeeId: entry.employeeId,
        name,
        lastName: rowLastName,
        payType: entry.employee?.payType ?? "HOURLY",
        hourlyRateCents: entry.hourlyRateCents,
        weeklyHours: new Map(),
        projects: new Set(),
        entries: [],
      });
    }

    const emp = employeeMap.get(key)!;
    const weekStart = mondayOf(entry.workDate).toISOString().slice(0, 10);
    emp.weeklyHours.set(weekStart, (emp.weeklyHours.get(weekStart) ?? 0) + entry.hours);
    emp.projects.add(entry.project?.jobTitle ?? "—");
    emp.entries.push({
      date: entry.workDate.toISOString().slice(0, 10),
      hours: entry.hours,
      project: entry.project?.jobTitle ?? "—",
      rateCents: entry.hourlyRateCents,
    });
  }

  for (const entry of changeOrderEntries) {
    if (!entry.hours || !entry.hourlyRateCents) continue;
    if (isExcludedFromHoursDrivenPay(entry.employee)) continue;
    const key: EmployeeKey = entry.employeeId ?? `adhoc:${entry.name}`;
    const name = entry.employee
      ? `${entry.employee.firstName} ${entry.employee.lastName}`.trim()
      : entry.name;
    const rowLastName = entry.employee ? entry.employee.lastName : lastNameOf(entry.name);
    const projectTitle = entry.changeOrder.project?.jobTitle ?? "—";

    if (!employeeMap.has(key)) {
      employeeMap.set(key, {
        employeeId: entry.employeeId,
        name,
        lastName: rowLastName,
        payType: entry.employee?.payType ?? "HOURLY",
        hourlyRateCents: entry.hourlyRateCents,
        weeklyHours: new Map(),
        projects: new Set(),
        entries: [],
      });
    }

    const emp = employeeMap.get(key)!;
    const weekStart = mondayOf(entry.workDate).toISOString().slice(0, 10);
    emp.weeklyHours.set(weekStart, (emp.weeklyHours.get(weekStart) ?? 0) + entry.hours);
    emp.projects.add(projectTitle);
    emp.entries.push({
      date: entry.workDate.toISOString().slice(0, 10),
      hours: entry.hours,
      project: projectTitle,
      rateCents: entry.hourlyRateCents,
    });
  }

  const OT_THRESHOLD = 40;
  const OT_MULTIPLIER = 1.5;

  const employeeRows = Array.from(employeeMap.values()).map((emp) => {
    let regHours = 0;
    let otHours = 0;
    for (const weekHours of emp.weeklyHours.values()) {
      if (emp.payType === "SALARY") {
        // Salaried employees don't earn OT — hours past 40/week are still
        // logged elsewhere but don't add to gross pay here.
        regHours += Math.min(weekHours, OT_THRESHOLD);
      } else if (weekHours <= OT_THRESHOLD) {
        regHours += weekHours;
      } else {
        regHours += OT_THRESHOLD;
        otHours += weekHours - OT_THRESHOLD;
      }
    }
    const totalHours = regHours + otHours;
    const grossPayCents = Math.round(
      regHours * emp.hourlyRateCents + otHours * emp.hourlyRateCents * OT_MULTIPLIER
    );

    return {
      isContractor: false as const,
      employeeId: emp.employeeId,
      name: emp.name,
      lastName: emp.lastName,
      payType: emp.payType,
      hourlyRateCents: emp.hourlyRateCents,
      totalHours,
      regHours,
      otHours,
      grossPayCents,
      projects: Array.from(emp.projects).join(", "),
      entries: emp.entries,
    };
  });

  // ── Salary employees are paid a fixed amount per period ─────────────────
  // annualSalaryCents/26, regardless of logged hours — overrides whatever
  // the hours-driven formula above produced (logged hours above stay on the
  // row for reference only), and pulls in any ACTIVE salary employee who
  // logged nothing at all this period (the loop above would otherwise have
  // silently omitted them).
  const salaryEmployees = await prisma.employee.findMany({
    where: { status: "ACTIVE", payType: "SALARY", isOffshore: false, isJanitorialContract: false },
    select: { id: true, firstName: true, lastName: true, hourlyPayCents: true, annualSalaryCents: true },
  });
  const salaryById = new Map(salaryEmployees.map((e) => [e.id, e]));

  for (const row of employeeRows) {
    if (row.employeeId && salaryById.has(row.employeeId)) {
      const sal = salaryById.get(row.employeeId)!;
      row.grossPayCents = Math.round((sal.annualSalaryCents ?? 0) / 26);
    }
  }
  const rowedSalaryIds = new Set(employeeRows.map((r) => r.employeeId).filter((id): id is string => !!id));
  const zeroHourSalaryRows = salaryEmployees
    .filter((e) => !rowedSalaryIds.has(e.id))
    .map((e) => ({
      isContractor: false as const,
      employeeId: e.id,
      name: `${e.firstName} ${e.lastName}`.trim(),
      lastName: e.lastName,
      payType: "SALARY",
      hourlyRateCents: e.hourlyPayCents ?? 0,
      totalHours: 0,
      regHours: 0,
      otHours: 0,
      grossPayCents: Math.round((e.annualSalaryCents ?? 0) / 26),
      projects: "—",
      entries: [] as { date: string; hours: number; project: string; rateCents: number }[],
    }));
  employeeRows.push(...zeroHourSalaryRows);

  // ── Janitorial Contract employees are paid a flat 40 hrs/week ──────────
  // minus logged vacation, entirely independent of hours logged on projects
  // (excluded from the hours-driven loop above). periodEndMidnight mirrors
  // the midnight-UTC convention EmployeeTimeOff itself uses (periodEnd is
  // end-of-day, 23:59:59.999, which would off-by-one the day math below).
  const periodEndMidnight = startOfDay(periodEnd);
  const FIXED_WEEKLY_HOURS = 40;
  const periodDays = Math.round((periodEndMidnight.getTime() - periodStart.getTime()) / 86_400_000) + 1;
  const weeksInPeriod = periodDays / 7;

  const janitorialEmployees = await prisma.employee.findMany({
    where: { status: "ACTIVE", isJanitorialContract: true },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      hourlyPayCents: true,
      timeOff: {
        where: { startDate: { lte: periodEndMidnight }, endDate: { gte: periodStart } },
        select: { startDate: true, endDate: true, type: true },
      },
    },
  });

  const janitorialRows = janitorialEmployees.map((e) => {
    const vacationHours = e.timeOff.reduce(
      (sum, t) => sum + timeOffEntryHours(t, { clipStart: periodStart, clipEnd: periodEndMidnight }),
      0
    );
    const baseHours = Math.max(0, FIXED_WEEKLY_HOURS * weeksInPeriod - vacationHours);
    const rateCents = e.hourlyPayCents ?? 0;
    return {
      isContractor: false as const,
      employeeId: e.id,
      name: `${e.firstName} ${e.lastName}`.trim(),
      lastName: e.lastName,
      payType: "JANITORIAL",
      hourlyRateCents: rateCents,
      totalHours: baseHours,
      regHours: baseHours,
      otHours: 0,
      grossPayCents: Math.round(baseHours * rateCents),
      projects: vacationHours > 0 ? `${fmtVacationHours(vacationHours)} vacation hrs deducted` : "—",
      entries: [] as { date: string; hours: number; project: string; rateCents: number }[],
    };
  });
  employeeRows.push(...janitorialRows);

  // ── Contractor rows — group by contractor, sum costCents ───────────────
  const contractorMap = new Map<string, { name: string; costCents: number; projects: Set<string> }>();

  for (const a of contractorAssignments) {
    const key = a.contractorId;
    if (!contractorMap.has(key)) {
      contractorMap.set(key, { name: a.contractor.name, costCents: 0, projects: new Set() });
    }
    const c = contractorMap.get(key)!;
    c.costCents += a.costCents ?? 0;
    if (a.project?.jobTitle) c.projects.add(a.project.jobTitle);
  }

  const contractorRows = Array.from(contractorMap.values()).map((c) => ({
    isContractor: true as const,
    employeeId: null,
    name: c.name,
    lastName: lastNameOf(c.name),
    payType: "CONTRACTOR",
    hourlyRateCents: 0,
    totalHours: 0,
    regHours: 0,
    otHours: 0,
    grossPayCents: c.costCents,
    projects: Array.from(c.projects).join(", "),
    entries: [],
  }));

  const rows = [...employeeRows, ...contractorRows].sort(
    (a, b) => a.lastName.localeCompare(b.lastName) || a.name.localeCompare(b.name)
  );

  return NextResponse.json({ periodStart: startParam, periodEnd: endParam, rows });
}
