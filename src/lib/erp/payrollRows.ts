/**
 * Builds the Payroll page's rows for a pay period: hourly pay from every
 * labor log, change order log and janitorial shift (priced by the shared
 * labor cost rule in laborCost.ts), salary for the period from pay history,
 * contractor costs, and commission paid out. Used both to show a period live
 * and to save it when the period is closed (see PayrollPeriodClose).
 */

import { prisma } from "@/lib/prisma";
import { loadJanitorialHours } from "@/lib/erp/janitorialHoursServer";
import { costWorkLines, janitorialWorkLine, type WorkLine } from "@/lib/erp/laborCost";
import { loadPayHistories, payRateOn } from "@/lib/erp/payRates";

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

function lastNameOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] ?? name;
}

type PayrollEmployeeRef = { payType: string; status: string; isOffshore: boolean; isJanitorialContract: boolean } | null;

/** Janitorial Contract employees keep their own pay-type label (drives the
 * Payroll page's filter) even when paid from hours. */
function payrollPayType(employee: PayrollEmployeeRef): string {
  if (!employee) return "HOURLY";
  return employee.isJanitorialContract ? "JANITORIAL" : employee.payType;
}

/** Payroll rows for [periodStart, periodEnd] (start of first day, end of last day). */
export async function computePayrollRows(periodStart: Date, periodEnd: Date) {
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

  // ── Janitorial shift hours ─────────────────────────────────────────────
  // Live, same numbers as Janitorial > Hours: clocked time, admin
  // corrections, or the scheduled hours when a janitor didn't clock in (see
  // src/lib/erp/janitorialHours.ts). Paid at the janitor's hourly pay on that
  // day and pooled with their project hours for the weekly overtime split.
  const periodEndMidnight = startOfDay(periodEnd);
  const janitorialShiftRows = await loadJanitorialHours(periodStart, periodEndMidnight);

  // ── Every line of hourly-style work this period ────────────────────────
  // Priced by the shared labor cost rule (src/lib/erp/laborCost.ts), the same
  // one job costs use, so what payroll pays and what jobs cost always agree.
  type PayLine = WorkLine & { project: string };
  const lines: PayLine[] = [];
  for (const entry of entries) {
    lines.push({
      id: entry.id, source: "project", employeeId: entry.employeeId,
      workerName: entry.employee ? `${entry.employee.firstName} ${entry.employee.lastName}`.trim() : entry.workerName,
      dateKey: entry.workDate.toISOString().slice(0, 10), hours: entry.hours,
      loggedRateCents: entry.hourlyRateCents, createdAtMs: entry.createdAt.getTime(),
      project: entry.project?.jobTitle ?? "-",
    });
  }
  for (const entry of changeOrderEntries) {
    // $0 change order hours are kept (not skipped) so they still count
    // toward the week's overtime threshold and get flagged as missing a rate.
    if (!entry.hours) continue;
    lines.push({
      id: entry.id, source: "changeOrder", employeeId: entry.employeeId,
      workerName: entry.employee ? `${entry.employee.firstName} ${entry.employee.lastName}`.trim() : entry.name,
      dateKey: entry.workDate.toISOString().slice(0, 10), hours: entry.hours,
      loggedRateCents: entry.hourlyRateCents, createdAtMs: entry.createdAt.getTime(),
      project: entry.changeOrder.project?.jobTitle ?? "-",
    });
  }
  for (const shift of janitorialShiftRows) {
    if (shift.hours <= 0) continue;
    lines.push({ ...janitorialWorkLine(shift), project: `${shift.buildingName} (janitorial)` });
  }

  // Salaried candidates: anyone Active paid a salary at some point.
  const salaryCandidates = await prisma.employee.findMany({
    where: {
      status: "ACTIVE", isOffshore: false, isJanitorialContract: false,
      OR: [{ payType: "SALARY" }, { payRates: { some: { payType: "SALARY", isOffshore: false } } }],
    },
    select: { id: true },
  });
  const lineEmployeeIds = lines.map((l) => l.employeeId).filter((id): id is string => !!id);
  const employeeIds = Array.from(new Set([...lineEmployeeIds, ...salaryCandidates.map((e) => e.id)]));
  const [employeesById, histories] = await Promise.all([
    prisma.employee
      .findMany({
        where: { id: { in: employeeIds } },
        select: { id: true, firstName: true, lastName: true, hourlyPayCents: true, payType: true, status: true, isOffshore: true, isJanitorialContract: true },
      })
      .then((list) => new Map(list.map((e) => [e.id, e]))),
    loadPayHistories(employeeIds),
  ]);
  const costs = costWorkLines(lines, histories);

  // ── Employee rows ──────────────────────────────────────────────────────
  type EmployeeKey = string;
  const employeeMap = new Map<EmployeeKey, {
    employeeId: string | null;
    name: string;
    lastName: string;
    hourlyPayCents: number;
    salaryCents: number;
    regHours: number;
    otHours: number;
    straightCents: number;
    straightHours: number;
    rates: Set<number>;
    /** Hours logged with no rate ($0) for someone paid by the hour. */
    missingRateHours: number;
    projects: Set<string>;
    entries: { date: string; hours: number; project: string; rateCents: number }[];
    hasJanitorialHours: boolean;
  }>();

  function rowFor(key: EmployeeKey, employeeId: string | null, name: string, lastName: string) {
    let row = employeeMap.get(key);
    if (!row) {
      row = {
        employeeId, name, lastName, hourlyPayCents: 0, salaryCents: 0, regHours: 0, otHours: 0,
        straightCents: 0, straightHours: 0, rates: new Set(), missingRateHours: 0, projects: new Set(), entries: [], hasJanitorialHours: false,
      };
      employeeMap.set(key, row);
    }
    return row;
  }

  for (const line of lines) {
    const cost = costs.get(line.id);
    if (!cost) continue;
    const employee = line.employeeId ? employeesById.get(line.employeeId) ?? null : null;
    const rate = line.employeeId ? payRateOn(histories.get(line.employeeId), line.dateKey) : null;
    // Offshore days are paid through Offshore Payroll, never here. Salaried
    // days are paid the flat salary below; their hours only show for
    // reference, and only while they're still Active.
    if (rate?.isOffshore) continue;
    if (cost.fixedPay && employee?.status !== "ACTIVE") continue;

    const name = line.workerName ?? "-";
    const key = line.employeeId ?? `adhoc:${name}`;
    const row = rowFor(key, line.employeeId, name, employee ? employee.lastName : lastNameOf(name));
    row.regHours += cost.regHours;
    row.otHours += cost.otHours;
    if (!cost.fixedPay) {
      row.straightCents += cost.straightCents;
      row.straightHours += line.hours;
      row.hourlyPayCents += cost.costCents;
      row.rates.add(cost.rateCents);
      if (cost.rateCents === 0) row.missingRateHours += line.hours;
    }
    row.projects.add(line.project);
    row.entries.push({ date: line.dateKey, hours: line.hours, project: line.project, rateCents: line.loggedRateCents ?? cost.rateCents });
    if (line.source === "janitorial") row.hasJanitorialHours = true;
  }

  // ── Salary: a fixed amount per period ───────────────────────────────────
  // Each day of the period pays 1/364 of the salary in effect that day (so a
  // full two-week period is exactly salary / 26, and a raise or a switch
  // from hourly mid-period is split by day), regardless of logged hours.
  const periodDays: string[] = [];
  for (let d = new Date(periodStart); d <= periodEnd; d.setUTCDate(d.getUTCDate() + 1)) periodDays.push(d.toISOString().slice(0, 10));
  for (const { id } of salaryCandidates) {
    const history = histories.get(id);
    let salaryCents = 0;
    for (const day of periodDays) {
      const rate = payRateOn(history, day);
      if (rate && rate.payType === "SALARY" && !rate.isOffshore) salaryCents += (rate.annualSalaryCents ?? 0) / 364;
    }
    if (salaryCents <= 0) continue;
    const e = employeesById.get(id);
    if (!e) continue;
    rowFor(id, id, `${e.firstName} ${e.lastName}`.trim(), e.lastName).salaryCents = salaryCents;
  }

  const employeeRows = Array.from(employeeMap.values()).map((emp) => {
    const employee = emp.employeeId ? employeesById.get(emp.employeeId) ?? null : null;
    const isSalaryRow = emp.salaryCents > 0;
    return {
      isContractor: false as const,
      employeeId: emp.employeeId,
      name: emp.name,
      lastName: emp.lastName,
      payType: isSalaryRow && emp.hourlyPayCents === 0 ? "SALARY" : payrollPayType(employee),
      // Average straight-time rate, for display and the CSV. Pay itself is
      // computed per line by the shared rule, not from this.
      hourlyRateCents: emp.straightHours > 0 ? Math.round(emp.straightCents / emp.straightHours) : (employee?.hourlyPayCents ?? 0),
      mixedRates: emp.rates.size > 1,
      missingRateHours: emp.missingRateHours,
      totalHours: emp.regHours + emp.otHours,
      regHours: emp.regHours,
      otHours: emp.otHours,
      grossPayCents: Math.round(emp.hourlyPayCents + emp.salaryCents),
      projects: emp.projects.size ? Array.from(emp.projects).join(", ") : "-",
      entries: emp.entries,
      hasJanitorialHours: emp.hasJanitorialHours,
      noJanitorialSchedule: false,
    };
  });

  // ── Janitorial Contract employees with nothing scheduled ────────────────
  // Their janitorial pay comes only from the schedule, so with no shifts this
  // period there are no janitorial hours to pay. Flag it on their row (added
  // at $0 if they have no other hours) instead of paying a made-up number.
  const scheduledJanitorIds = new Set(janitorialShiftRows.map((r) => r.employeeId));
  const unscheduledJanitors = await prisma.employee.findMany({
    where: { status: "ACTIVE", isJanitorialContract: true, id: { notIn: Array.from(scheduledJanitorIds) } },
    select: { id: true, firstName: true, lastName: true, hourlyPayCents: true },
  });
  for (const e of unscheduledJanitors) {
    const existing = employeeRows.find((r) => r.employeeId === e.id);
    if (existing) {
      existing.noJanitorialSchedule = true;
      continue;
    }
    employeeRows.push({
      isContractor: false as const,
      employeeId: e.id,
      name: `${e.firstName} ${e.lastName}`.trim(),
      lastName: e.lastName,
      payType: "JANITORIAL",
      hourlyRateCents: e.hourlyPayCents ?? 0,
      mixedRates: false,
      missingRateHours: 0,
      totalHours: 0,
      regHours: 0,
      otHours: 0,
      grossPayCents: 0,
      projects: "No janitorial schedule set",
      entries: [] as { date: string; hours: number; project: string; rateCents: number }[],
      hasJanitorialHours: false,
      noJanitorialSchedule: true,
    });
  }

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

  return rows;
}

export type PayrollRow = Awaited<ReturnType<typeof computePayrollRows>>[number];
