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
  const day = d.getUTCDay(); // 0=Sun
  const diff = (day === 0 ? -6 : 1 - day);
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

  const entries = await prisma.laborEntry.findMany({
    where: { workDate: { gte: periodStart, lte: periodEnd } },
    include: {
      employee: { select: { id: true, firstName: true, lastName: true, adpFileNumber: true, hourlyPayCents: true, payType: true } },
      project: { select: { id: true, jobTitle: true } },
    },
    orderBy: { workDate: "asc" },
  });

  // Group by employee (keyed by employeeId or workerName for ad-hoc entries)
  type EmployeeKey = string;
  type WeekKey = string; // ISO week start YYYY-MM-DD

  const employeeMap = new Map<EmployeeKey, {
    employeeId: string | null;
    adpFileNumber: string | null;
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
        adpFileNumber: entry.employee?.adpFileNumber ?? null,
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

  const rows = Array.from(employeeMap.values()).map((emp) => {
    let regHours = 0;
    let otHours = 0;
    for (const weekHours of emp.weeklyHours.values()) {
      if (weekHours <= 40) {
        regHours += weekHours;
      } else {
        regHours += 40;
        otHours += weekHours - 40;
      }
    }
    const totalHours = regHours + otHours;
    const regPay = regHours * emp.hourlyRateCents;
    const otPay = otHours * emp.hourlyRateCents * 1.5;
    const grossPayCents = Math.round(regPay + otPay);

    return {
      employeeId: emp.employeeId,
      adpFileNumber: emp.adpFileNumber,
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

  rows.sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ periodStart: startParam, periodEnd: endParam, rows });
}
