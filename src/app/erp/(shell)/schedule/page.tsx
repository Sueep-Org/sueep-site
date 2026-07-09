import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { dayKey, type ScheduleChangeOrder, type ScheduleDayAssignment, type ScheduleProject } from "@/lib/erp/schedule";
import { canFilterScheduleBySupervisor, getErpAuth } from "@/lib/erpAuth";
import { SchedulePlanner } from "./SchedulePlanner";

export const metadata: Metadata = {
  title: "Schedule",
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Change orders in these statuses never happened (or won't) — keep them off the calendar.
const CO_STATUS_EXCLUDED = ["REJECTED", "VOID"];

export default async function SchedulePage() {
  const auth = await getErpAuth();
  const canFilterBySupervisor = canFilterScheduleBySupervisor(auth?.role ?? "EMPLOYEE");

  const [projectRows, supervisorUsers, laborEntryRows, changeOrderRows, coLaborerRows, dayAssignmentRows] = await Promise.all([
    prisma.project.findMany({
      orderBy: [{ projectDate: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        jobTitle: true,
        segment: true,
        status: true,
        projectDate: true,
        projectEndDate: true,
        createdAt: true,
        percentDone: true,
        supervisorUserId: true,
      },
    }),
    prisma.erpUser.findMany({
      where: { role: "SUPERVISOR" },
      select: { id: true, email: true },
      orderBy: { email: "asc" },
    }),
    prisma.laborEntry.findMany({ select: { projectId: true, workDate: true, workerName: true, hours: true, employeeId: true } }),
    prisma.projectChangeOrder.findMany({
      where: { status: { notIn: CO_STATUS_EXCLUDED } },
      select: { id: true, projectId: true, title: true, status: true, startDate: true },
    }),
    prisma.projectChangeOrderLaborer.findMany({ select: { changeOrderId: true, workDate: true, name: true, hours: true } }),
    prisma.projectDayAssignment.findMany({
      select: { id: true, projectId: true, date: true, supervisorUserId: true, startTime: true, endTime: true },
    }),
  ]);

  const dayAssignments: ScheduleDayAssignment[] = dayAssignmentRows.map((a) => ({
    id: a.id,
    projectId: a.projectId,
    dateKey: dayKey(a.date),
    supervisorUserId: a.supervisorUserId,
    startTime: a.startTime,
    endTime: a.endTime,
  }));

  // Calendar day cells are driven by actual logged work, not a project's full
  // start/end span — a project spanning two weeks isn't worked every day.
  const workDayKeysByProject = new Map<string, Set<string>>();
  // Per-project, per-day breakdown of hours/workers — powers the richer
  // tooltip on confirmed calendar chips.
  const laborSummaryByProject = new Map<string, Map<string, { hours: number; workers: Set<string> }>>();
  for (const le of laborEntryRows) {
    const k = dayKey(le.workDate);
    const set = workDayKeysByProject.get(le.projectId) ?? new Set<string>();
    set.add(k);
    workDayKeysByProject.set(le.projectId, set);

    const byDay = laborSummaryByProject.get(le.projectId) ?? new Map<string, { hours: number; workers: Set<string> }>();
    const entry = byDay.get(k) ?? { hours: 0, workers: new Set<string>() };
    entry.hours += le.hours;
    if (le.workerName) entry.workers.add(le.workerName);
    byDay.set(k, entry);
    laborSummaryByProject.set(le.projectId, byDay);
  }

  const workDayKeysByChangeOrder = new Map<string, Set<string>>();
  // Per-change-order, per-day breakdown of hours/workers — same tooltip data
  // as projects, sourced from ProjectChangeOrderLaborer instead of LaborEntry.
  const laborSummaryByChangeOrder = new Map<string, Map<string, { hours: number; workers: Set<string> }>>();
  for (const cl of coLaborerRows) {
    const k = dayKey(cl.workDate);
    const set = workDayKeysByChangeOrder.get(cl.changeOrderId) ?? new Set<string>();
    set.add(k);
    workDayKeysByChangeOrder.set(cl.changeOrderId, set);

    const byDay = laborSummaryByChangeOrder.get(cl.changeOrderId) ?? new Map<string, { hours: number; workers: Set<string> }>();
    const entry = byDay.get(k) ?? { hours: 0, workers: new Set<string>() };
    entry.hours += cl.hours;
    if (cl.name) entry.workers.add(cl.name);
    byDay.set(k, entry);
    laborSummaryByChangeOrder.set(cl.changeOrderId, byDay);
  }

  const changeOrders: ScheduleChangeOrder[] = changeOrderRows
    .map((co) => {
      const days = workDayKeysByChangeOrder.get(co.id) ?? new Set<string>();
      if (co.startDate) days.add(dayKey(co.startDate));
      const laborByDay: Record<string, { hours: number; workers: string[] }> = {};
      for (const [k, entry] of laborSummaryByChangeOrder.get(co.id) ?? []) {
        laborByDay[k] = { hours: entry.hours, workers: Array.from(entry.workers) };
      }
      return {
        id: co.id,
        projectId: co.projectId,
        title: co.title,
        status: co.status,
        workDayKeys: Array.from(days),
        laborByDay,
      };
    })
    .filter((co) => co.workDayKeys.length > 0);

  // Resolve display names for ERP supervisors from employee records, same as
  // the per-project setup editor does.
  const supervisorEmployees = await prisma.employee.findMany({
    where: { email: { in: supervisorUsers.map((u) => u.email), mode: "insensitive" } },
    select: { email: true, firstName: true, lastName: true },
  });
  const employeeNameByEmail = new Map(
    supervisorEmployees
      .filter((e): e is typeof e & { email: string } => e.email != null)
      .map((e) => [e.email.toLowerCase(), `${e.firstName} ${e.lastName}`.trim()]),
  );
  const supervisors = supervisorUsers.map((u) => ({
    id: u.id,
    displayName: employeeNameByEmail.get(u.email.toLowerCase()) || u.email.split("@")[0]!,
  }));

  const projects: ScheduleProject[] = projectRows.map((r) => {
    const laborByDay: Record<string, { hours: number; workers: string[] }> = {};
    for (const [k, entry] of laborSummaryByProject.get(r.id) ?? []) {
      laborByDay[k] = { hours: entry.hours, workers: Array.from(entry.workers) };
    }
    return {
      id: r.id,
      jobTitle: r.jobTitle,
      segment: r.segment,
      status: r.status,
      projectDate: r.projectDate ? r.projectDate.toISOString() : null,
      projectEndDate: r.projectEndDate ? r.projectEndDate.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
      percentDone: r.percentDone,
      supervisorUserId: r.supervisorUserId,
      workDayKeys: Array.from(workDayKeysByProject.get(r.id) ?? []),
      laborByDay,
    };
  });

  // Supervisors only see projects they're assigned to (project-level or a
  // specific day) or have personally logged labor on — everyone else (PM,
  // admin, etc.) sees the full calendar.
  let visibleProjects = projects;
  let visibleChangeOrders = changeOrders;
  let visibleDayAssignments = dayAssignments;
  if (auth?.role === "SUPERVISOR") {
    const supervisorEmployee = await prisma.employee.findFirst({
      where: { email: { equals: auth.email, mode: "insensitive" } },
      select: { id: true, firstName: true, lastName: true },
    });
    const supervisorFullName = supervisorEmployee
      ? `${supervisorEmployee.firstName} ${supervisorEmployee.lastName}`.trim().toLowerCase()
      : null;

    const allowedProjectIds = new Set<string>();
    for (const p of projects) {
      if (p.supervisorUserId === auth.uid) allowedProjectIds.add(p.id);
    }
    for (const a of dayAssignments) {
      if (a.supervisorUserId === auth.uid) allowedProjectIds.add(a.projectId);
    }
    for (const le of laborEntryRows) {
      const matchesEmployee = supervisorEmployee != null && le.employeeId === supervisorEmployee.id;
      const matchesName = supervisorFullName != null && le.workerName.trim().toLowerCase() === supervisorFullName;
      if (matchesEmployee || matchesName) allowedProjectIds.add(le.projectId);
    }

    visibleProjects = projects.filter((p) => allowedProjectIds.has(p.id));
    visibleChangeOrders = changeOrders.filter((co) => allowedProjectIds.has(co.projectId));
    visibleDayAssignments = dayAssignments.filter((a) => allowedProjectIds.has(a.projectId));
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-pink-600">Schedule</h1>
        </div>
      </div>

      {/* Project Schedule */}
      <SchedulePlanner
        projects={visibleProjects}
        supervisors={supervisors}
        changeOrders={visibleChangeOrders}
        initialDayAssignments={visibleDayAssignments}
        canFilterBySupervisor={canFilterBySupervisor}
      />
    </div>
  );
}
