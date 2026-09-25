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

  const [entries, changeOrderEntries, contractorAssignments, coContractorAssignments] = await Promise.all([
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
    // A contractor's work lives in two tables, same split as Employee's
    // LaborEntry vs ProjectChangeOrderLaborer (see contractors/[id]/page.tsx
    // for the same split): ContractorAssignment for project/building-level
    // work, ChangeOrderContractorAssignment for CO work. Payroll previously
    // only queried the former, so any contractor cost billed through a
    // change order never made it into a payroll run at all.
    prisma.changeOrderContractorAssignment.findMany({
      where: {
        costCents: { not: null },
        OR: [
          { startDate: { gte: periodStart, lte: periodEnd } },
          { endDate: { gte: periodStart, lte: periodEnd } },
          { AND: [{ startDate: { lte: periodStart } }, { endDate: { gte: periodEnd } }] },
          { AND: [{ startDate: null }, { endDate: null }, { assignedDate: { gte: periodStart, lte: periodEnd } }] },
        ],
      },
      include: {
        contractor: { select: { id: true, name: true } },
        changeOrder: { select: { project: { select: { jobTitle: true } } } },
      },
    }),
  ]);

  // ── Employee rows ──────────────────────────────────────────────────────
  type EmployeeKey = string;
  type WeekKey = string;

  // Each labor log is paid at its own rate: rates legitimately differ per
  // job (and change after a raise), so one rate per person, which is what
  // this used to take from their first log, over- or underpaid anyone with
  // more than one. Hours and straight-time pay are tracked per work week so
  // overtime can be computed per week, see weekPay below.
  const employeeMap = new Map<EmployeeKey, {
    employeeId: string | null;
    name: string;
    lastName: string;
    payType: string;
    weeks: Map<WeekKey, { hours: number; straightCents: number }>;
    rates: Set<number>;
    /** Hours logged with no rate ($0) for someone paid by the hour. */
    missingRateHours: number;
    projects: Set<string>;
    entries: { date: string; hours: number; project: string; rateCents: number }[];
  }>();

  function addHours(
    key: EmployeeKey,
    init: { employeeId: string | null; name: string; lastName: string; payType: string },
    workDate: Date,
    hours: number,
    rateCents: number,
    project: string,
  ) {
    if (!employeeMap.has(key)) {
      employeeMap.set(key, { ...init, weeks: new Map(), rates: new Set(), missingRateHours: 0, projects: new Set(), entries: [] });
    }
    const emp = employeeMap.get(key)!;
    const weekStart = mondayOf(workDate).toISOString().slice(0, 10);
    const week = emp.weeks.get(weekStart) ?? { hours: 0, straightCents: 0 };
    week.hours += hours;
    week.straightCents += hours * rateCents;
    emp.weeks.set(weekStart, week);
    emp.rates.add(rateCents);
    if (rateCents === 0 && emp.payType !== "SALARY") emp.missingRateHours += hours;
    emp.projects.add(project);
    emp.entries.push({ date: workDate.toISOString().slice(0, 10), hours, project, rateCents });
  }

  for (const entry of entries) {
    // Offshore and Janitorial Contract employees are paid through their own
    // fixed calcs below, entirely independent of logged hours; any
    // LaborEntry they have is job-costing only and must never feed a
    // biweekly payroll gross-pay number. An INACTIVE salary employee is
    // excluded entirely too: the flat salary calc below only pays ACTIVE
    // salary employees, but without this check a former salary employee
    // with leftover/backdated LaborEntry rows would still show up here,
    // priced by the hours-based formula instead of just disappearing.
    // (Hourly employees keep showing for hours actually worked before
    // going inactive; only salary's fixed, employment-status-based payout
    // needs this exclusion.)
    if (isExcludedFromHoursDrivenPay(entry.employee)) continue;
    addHours(
      entry.employeeId ?? `adhoc:${entry.workerName}`,
      {
        employeeId: entry.employeeId,
        name: entry.employee ? `${entry.employee.firstName} ${entry.employee.lastName}`.trim() : entry.workerName,
        lastName: entry.employee ? entry.employee.lastName : lastNameOf(entry.workerName),
        payType: entry.employee?.payType ?? "HOURLY",
      },
      entry.workDate,
      entry.hours,
      entry.hourlyRateCents,
      entry.project?.jobTitle ?? "—",
    );
  }

  for (const entry of changeOrderEntries) {
    // $0 change order hours are kept (not skipped) so they still count
    // toward the week's overtime threshold and get flagged as missing a rate.
    if (!entry.hours) continue;
    if (isExcludedFromHoursDrivenPay(entry.employee)) continue;
    addHours(
      entry.employeeId ?? `adhoc:${entry.name}`,
      {
        employeeId: entry.employeeId,
        name: entry.employee ? `${entry.employee.firstName} ${entry.employee.lastName}`.trim() : entry.name,
        lastName: entry.employee ? entry.employee.lastName : lastNameOf(entry.name),
        payType: entry.employee?.payType ?? "HOURLY",
      },
      entry.workDate,
      entry.hours,
      entry.hourlyRateCents,
      entry.changeOrder.project?.jobTitle ?? "—",
    );
  }

  const OT_THRESHOLD = 40;
  const OT_PREMIUM = 0.5;

  // One work week's pay. Straight time is every log at its own rate. Hours
  // past 40 get an extra half of the week's weighted-average rate (the
  // "regular rate" rule for someone paid different rates in one week), so
  // with a single rate this is the familiar 1.5x.
  function weekPay(week: { hours: number; straightCents: number }, payType: string) {
    if (payType === "SALARY") {
      // Salaried employees don't earn OT; their gross is replaced by the
      // flat salary below anyway, hours here are for reference only.
      return { regHours: Math.min(week.hours, OT_THRESHOLD), otHours: 0, payCents: week.straightCents };
    }
    if (week.hours <= OT_THRESHOLD) return { regHours: week.hours, otHours: 0, payCents: week.straightCents };
    const otHours = week.hours - OT_THRESHOLD;
    const averageRateCents = week.straightCents / week.hours;
    return { regHours: OT_THRESHOLD, otHours, payCents: week.straightCents + otHours * averageRateCents * OT_PREMIUM };
  }

  const employeeRows = Array.from(employeeMap.values()).map((emp) => {
    let regHours = 0;
    let otHours = 0;
    let payCents = 0;
    let straightCents = 0;
    for (const week of emp.weeks.values()) {
      const w = weekPay(week, emp.payType);
      regHours += w.regHours;
      otHours += w.otHours;
      payCents += w.payCents;
      straightCents += week.straightCents;
    }
    const loggedHours = Array.from(emp.weeks.values()).reduce((sum, w) => sum + w.hours, 0);

    return {
      isContractor: false as const,
      employeeId: emp.employeeId,
      name: emp.name,
      lastName: emp.lastName,
      payType: emp.payType,
      // Average straight-time rate, for display and the CSV. Pay itself is
      // computed per log above, not from this.
      hourlyRateCents: loggedHours > 0 ? Math.round(straightCents / loggedHours) : 0,
      mixedRates: emp.rates.size > 1,
      missingRateHours: emp.missingRateHours,
      totalHours: regHours + otHours,
      regHours,
      otHours,
      grossPayCents: Math.round(payCents),
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
      mixedRates: false,
      missingRateHours: 0,
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
      mixedRates: false,
      missingRateHours: 0,
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

  for (const a of coContractorAssignments) {
    const key = a.contractorId;
    if (!contractorMap.has(key)) {
      contractorMap.set(key, { name: a.contractor.name, costCents: 0, projects: new Set() });
    }
    const c = contractorMap.get(key)!;
    c.costCents += a.costCents ?? 0;
    if (a.changeOrder.project?.jobTitle) c.projects.add(a.changeOrder.project.jobTitle);
  }

  const contractorRows = Array.from(contractorMap.values()).map((c) => ({
    isContractor: true as const,
    employeeId: null,
    name: c.name,
    lastName: lastNameOf(c.name),
    payType: "CONTRACTOR",
    hourlyRateCents: 0,
    mixedRates: false,
    missingRateHours: 0,
    totalHours: 0,
    regHours: 0,
    otHours: 0,
    grossPayCents: c.costCents,
    projects: Array.from(c.projects).join(", "),
    entries: [],
  }));

  // ── Commission earned this period ───────────────────────────────────────
  // Keyed by paidAt (when the deal/period was marked paid), not by the
  // underlying deal's own date — a rep gets credited in whichever pay period
  // Finance actually marked their commission paid in, matching how their
  // base pay is period-bound too.
  const commissionPayouts = await prisma.commissionPayout.findMany({
    where: { paidAt: { gte: periodStart, lte: periodEnd } },
    select: { employeeId: true, amountCents: true, sourceLabel: true },
  });
  const commissionByEmployee = new Map<string, { totalCents: number; breakdown: { label: string; amountCents: number }[] }>();
  for (const payout of commissionPayouts) {
    const entry = commissionByEmployee.get(payout.employeeId) ?? { totalCents: 0, breakdown: [] };
    entry.totalCents += payout.amountCents;
    entry.breakdown.push({ label: payout.sourceLabel, amountCents: payout.amountCents });
    commissionByEmployee.set(payout.employeeId, entry);
  }

  const rowsWithCommission = [...employeeRows, ...contractorRows].map((row) => {
    const commission = row.employeeId ? commissionByEmployee.get(row.employeeId) : undefined;
    return {
      ...row,
      commissionCents: commission?.totalCents ?? 0,
      commissionBreakdown: commission?.breakdown ?? [],
    };
  });

  // A rep who earned commission this period but has no other payroll
  // activity (e.g. SALES with no logged hours) still needs a row, otherwise
  // their commission has nowhere to show up in Payroll — same reasoning as
  // the zero-hour salary rows above.
  const rowedEmployeeIds = new Set(rowsWithCommission.map((r) => r.employeeId).filter((id): id is string => !!id));
  const commissionOnlyIds = Array.from(commissionByEmployee.keys()).filter((id) => !rowedEmployeeIds.has(id));
  const commissionOnlyEmployees = commissionOnlyIds.length
    ? await prisma.employee.findMany({
        where: { id: { in: commissionOnlyIds } },
        select: { id: true, firstName: true, lastName: true, payType: true, hourlyPayCents: true },
      })
    : [];
  const commissionOnlyRows = commissionOnlyEmployees.map((e) => {
    const commission = commissionByEmployee.get(e.id)!;
    return {
      isContractor: false as const,
      employeeId: e.id,
      name: `${e.firstName} ${e.lastName}`.trim(),
      lastName: e.lastName,
      payType: e.payType,
      hourlyRateCents: e.hourlyPayCents ?? 0,
      mixedRates: false,
      missingRateHours: 0,
      totalHours: 0,
      regHours: 0,
      otHours: 0,
      grossPayCents: 0,
      projects: "—",
      entries: [] as { date: string; hours: number; project: string; rateCents: number }[],
      commissionCents: commission.totalCents,
      commissionBreakdown: commission.breakdown,
    };
  });

  const rows = [...rowsWithCommission, ...commissionOnlyRows].sort(
    (a, b) => a.lastName.localeCompare(b.lastName) || a.name.localeCompare(b.name)
  );

  return NextResponse.json({ periodStart: startParam, periodEnd: endParam, rows });
}
