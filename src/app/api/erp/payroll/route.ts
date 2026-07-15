import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

function mondayOf(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export async function GET(req: Request) {
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
        employee: { select: { id: true, firstName: true, lastName: true, hourlyPayCents: true, payType: true } },
        project: { select: { id: true, jobTitle: true } },
      },
      orderBy: { workDate: "asc" },
    }),
    prisma.projectChangeOrderLaborer.findMany({
      where: { workDate: { gte: periodStart, lte: periodEnd } },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, hourlyPayCents: true, payType: true } },
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
    payType: string;
    hourlyRateCents: number;
    weeklyHours: Map<WeekKey, number>;
    projects: Set<string>;
    entries: { date: string; hours: number; project: string; rateCents: number }[];
  }>();

  for (const entry of entries) {
    const key: EmployeeKey = entry.employeeId ?? `adhoc:${entry.workerName}`;
    const name = entry.employee
      ? `${entry.employee.firstName} ${entry.employee.lastName}`.trim()
      : entry.workerName;

    if (!employeeMap.has(key)) {
      employeeMap.set(key, {
        employeeId: entry.employeeId,
        name,
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
    const key: EmployeeKey = entry.employeeId ?? `adhoc:${entry.name}`;
    const name = entry.employee
      ? `${entry.employee.firstName} ${entry.employee.lastName}`.trim()
      : entry.name;
    const projectTitle = entry.changeOrder.project?.jobTitle ?? "—";

    if (!employeeMap.has(key)) {
      employeeMap.set(key, {
        employeeId: entry.employeeId,
        name,
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
    payType: "CONTRACTOR",
    hourlyRateCents: 0,
    totalHours: 0,
    regHours: 0,
    otHours: 0,
    grossPayCents: c.costCents,
    projects: Array.from(c.projects).join(", "),
    entries: [],
  }));

  function lastName(name: string) {
    const parts = name.trim().split(/\s+/);
    return parts[parts.length - 1] ?? name;
  }

  const rows = [...employeeRows, ...contractorRows].sort((a, b) =>
    lastName(a.name).localeCompare(lastName(b.name))
  );

  return NextResponse.json({ periodStart: startParam, periodEnd: endParam, rows });
}
