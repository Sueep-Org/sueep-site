import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import {
  dayKey,
  type ScheduleChangeOrder,
  type ScheduleDayAssignment,
  type ScheduleProject,
  type ScheduleSovRequest,
  type ScheduleWorkerAssignment,
} from "@/lib/erp/schedule";
import { contractedTurnoverScope } from "@/lib/erp/turnoverScope";
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

  const [
    projectRows,
    supervisorUsers,
    projectManagerUsers,
    laborEntryRows,
    changeOrderRows,
    coLaborerRows,
    sovRequestRows,
    dayAssignmentRows,
    workerAssignmentRows,
    employeeRows,
    contractorRows,
  ] = await Promise.all([
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
        sov: { select: { items: { select: { id: true, description: true, completed: true } } } },
        turnoverRequest: {
          select: {
            fullClean: true,
            fullPaint: true,
            touchUpPaint: true,
            carpetCleaning: true,
            ceilingPaint: true,
            materialsAdditional: true,
            otherWork: true,
          },
        },
      },
    }),
    prisma.erpUser.findMany({
      where: { role: "SUPERVISOR" },
      select: { id: true, email: true },
      orderBy: { email: "asc" },
    }),
    // PMs, for the rare "no supervisor, only PM" day assignment, same shape
    // as supervisorUsers, resolved to display names the same way below.
    prisma.erpUser.findMany({
      where: { role: "PROJECT_MANAGER" },
      select: { id: true, email: true },
      orderBy: { email: "asc" },
    }),
    prisma.laborEntry.findMany({ select: { projectId: true, workDate: true, workerName: true, hours: true, employeeId: true, clockIn: true } }),
    prisma.projectChangeOrder.findMany({
      where: { status: { notIn: CO_STATUS_EXCLUDED } },
      select: { id: true, projectId: true, title: true, status: true, startDate: true, requestedDate: true },
    }),
    prisma.projectChangeOrderLaborer.findMany({ select: { changeOrderId: true, workDate: true, name: true, hours: true } }),
    prisma.projectSovScheduleRequest.findMany({
      select: { id: true, projectId: true, requestedBy: true, requestedDate: true, sovItem: { select: { description: true } } },
    }),
    prisma.projectDayAssignment.findMany({
      select: {
        id: true,
        projectId: true,
        date: true,
        supervisorUserId: true,
        projectManagerUserId: true,
        startTime: true,
        endTime: true,
        seriesId: true,
        scopeItems: true,
        sovItems: { select: { id: true } },
      },
    }),
    prisma.projectWorkerDayAssignment.findMany({
      select: { id: true, projectId: true, employeeId: true, contractorId: true, date: true, seriesId: true },
    }),
    prisma.employee.findMany({
      where: { status: { not: "INACTIVE" } },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    }),
    prisma.contractor.findMany({
      where: { status: { not: "INACTIVE" } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const workerAssignments: ScheduleWorkerAssignment[] = workerAssignmentRows.map((a) => ({
    id: a.id,
    projectId: a.projectId,
    employeeId: a.employeeId,
    contractorId: a.contractorId,
    dateKey: dayKey(a.date),
    seriesId: a.seriesId,
  }));

  const employees = employeeRows.map((e) => ({
    id: e.id,
    displayName: `${e.firstName} ${e.lastName}`.trim(),
  }));
  const employeeNameById = new Map(employees.map((e) => [e.id, e.displayName]));

  const contractors = contractorRows.map((c) => ({ id: c.id, displayName: c.name }));
  const contractorNameById = new Map(contractors.map((c) => [c.id, c.displayName]));

  // Planned (not-yet-logged) worker names per project/day — surfaced in the
  // chip tooltip alongside actual logged hours/workers when a chip already
  // exists for that day (confirmed or planned-supervisor).
  const plannedWorkersByProject = new Map<string, Map<string, string[]>>();
  for (const a of workerAssignmentRows) {
    const byDay = plannedWorkersByProject.get(a.projectId) ?? new Map<string, string[]>();
    const list = byDay.get(dayKey(a.date)) ?? [];
    const name = a.employeeId ? employeeNameById.get(a.employeeId) : a.contractorId ? contractorNameById.get(a.contractorId) : null;
    if (name) list.push(name);
    byDay.set(dayKey(a.date), list);
    plannedWorkersByProject.set(a.projectId, byDay);
  }

  const dayAssignments: ScheduleDayAssignment[] = dayAssignmentRows.map((a) => ({
    id: a.id,
    projectId: a.projectId,
    dateKey: dayKey(a.date),
    supervisorUserId: a.supervisorUserId,
    projectManagerUserId: a.projectManagerUserId,
    startTime: a.startTime,
    endTime: a.endTime,
    seriesId: a.seriesId,
    sovItemIds: a.sovItems.map((s) => s.id),
    scopeItems: a.scopeItems,
  }));

  // Calendar day cells are driven by actual logged work, not a project's full
  // start/end span — a project spanning two weeks isn't worked every day.
  const workDayKeysByProject = new Map<string, Set<string>>();
  // Per-project, per-day breakdown of hours/workers — powers the richer
  // tooltip on confirmed calendar chips.
  const laborSummaryByProject = new Map<string, Map<string, { hours: number; workers: Set<string> }>>();
  // Per-project, per-day list of individual LaborEntry rows (worker, hours,
  // clock-in) — powers the read-only labor detail card. Kept separate from
  // the aggregate above since a calendar day can have several workers each
  // with their own hours/clock-in, not just a combined total.
  const laborEntriesByProject = new Map<string, Map<string, { workerName: string; hours: number; clockIn: string | null }[]>>();
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

    const entriesByDay = laborEntriesByProject.get(le.projectId) ?? new Map<string, { workerName: string; hours: number; clockIn: string | null }[]>();
    const entries = entriesByDay.get(k) ?? [];
    entries.push({ workerName: le.workerName, hours: le.hours, clockIn: le.clockIn });
    entriesByDay.set(k, entries);
    laborEntriesByProject.set(le.projectId, entriesByDay);
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
      // startDate is the real scheduled date once set; requestedDate is only
      // a placeholder fallback for COs from before startDate was required.
      const scheduledDate = co.startDate ?? co.requestedDate;
      if (scheduledDate) days.add(dayKey(scheduledDate));
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
        scheduledDateKey: scheduledDate ? dayKey(scheduledDate) : null,
      };
    })
    .filter((co) => co.workDayKeys.length > 0);

  const sovRequests: ScheduleSovRequest[] = sovRequestRows.map((r) => ({
    id: r.id,
    projectId: r.projectId,
    title: r.sovItem.description,
    requestedBy: r.requestedBy,
    workDayKeys: [dayKey(r.requestedDate)],
  }));

  // Resolve display names for ERP supervisors and PMs from employee records,
  // same as the per-project setup editor does.
  const scheduleErpEmails = [...supervisorUsers, ...projectManagerUsers].map((u) => u.email);
  const scheduleEmployees = await prisma.employee.findMany({
    where: { email: { in: scheduleErpEmails, mode: "insensitive" } },
    select: { email: true, firstName: true, lastName: true },
  });
  const employeeNameByEmail = new Map(
    scheduleEmployees
      .filter((e): e is typeof e & { email: string } => e.email != null)
      .map((e) => [e.email.toLowerCase(), `${e.firstName} ${e.lastName}`.trim()]),
  );
  const supervisors = supervisorUsers.map((u) => ({
    id: u.id,
    displayName: employeeNameByEmail.get(u.email.toLowerCase()) || u.email.split("@")[0]!,
  }));
  const projectManagers = projectManagerUsers.map((u) => ({
    id: u.id,
    displayName: employeeNameByEmail.get(u.email.toLowerCase()) || u.email.split("@")[0]!,
  }));

  const projects: ScheduleProject[] = projectRows.map((r) => {
    const laborByDay: Record<string, { hours: number; workers: string[] }> = {};
    for (const [k, entry] of laborSummaryByProject.get(r.id) ?? []) {
      laborByDay[k] = { hours: entry.hours, workers: Array.from(entry.workers) };
    }
    const laborEntriesByDay: Record<string, { workerName: string; hours: number; clockIn: string | null }[]> = {};
    for (const [k, entries] of laborEntriesByProject.get(r.id) ?? []) {
      laborEntriesByDay[k] = entries;
    }
    const plannedWorkersByDay: Record<string, string[]> = {};
    for (const [k, names] of plannedWorkersByProject.get(r.id) ?? []) {
      plannedWorkersByDay[k] = names;
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
      laborEntriesByDay,
      plannedWorkersByDay,
      sovItems: r.sov?.items ?? [],
      contractedScopeItems: r.turnoverRequest ? contractedTurnoverScope(r.turnoverRequest) : null,
    };
  });

  // Supervisors only see projects they're assigned to (project-level or a
  // specific day) or have personally logged labor on — everyone else (PM,
  // admin, etc.) sees the full calendar.
  let visibleProjects = projects;
  let visibleChangeOrders = changeOrders;
  let visibleSovRequests = sovRequests;
  let visibleDayAssignments = dayAssignments;
  let visibleWorkerAssignments = workerAssignments;
  if (auth?.role === "SUPERVISOR") {
    // auth.uid is the Firebase UID (from the session token), not the
    // ErpUser.id that Project.supervisorUserId / ProjectDayAssignment.supervisorUserId
    // actually reference — has to be resolved first, same as the dashboard does.
    const [supervisorErpUser, supervisorEmployee] = await Promise.all([
      auth.uid ? prisma.erpUser.findUnique({ where: { firebaseUid: auth.uid }, select: { id: true } }) : null,
      prisma.employee.findFirst({
        where: { email: { equals: auth.email, mode: "insensitive" } },
        select: { id: true, firstName: true, lastName: true },
      }),
    ]);
    const supervisorFullName = supervisorEmployee
      ? `${supervisorEmployee.firstName} ${supervisorEmployee.lastName}`.trim().toLowerCase()
      : null;

    const allowedProjectIds = new Set<string>();
    if (supervisorErpUser) {
      for (const p of projects) {
        if (p.supervisorUserId === supervisorErpUser.id) allowedProjectIds.add(p.id);
      }
      for (const a of dayAssignments) {
        if (a.supervisorUserId === supervisorErpUser.id) allowedProjectIds.add(a.projectId);
      }
    }
    for (const le of laborEntryRows) {
      const matchesEmployee = supervisorEmployee != null && le.employeeId === supervisorEmployee.id;
      const matchesName = supervisorFullName != null && le.workerName.trim().toLowerCase() === supervisorFullName;
      if (matchesEmployee || matchesName) allowedProjectIds.add(le.projectId);
    }

    visibleProjects = projects.filter((p) => allowedProjectIds.has(p.id));
    visibleChangeOrders = changeOrders.filter((co) => allowedProjectIds.has(co.projectId));
    visibleSovRequests = sovRequests.filter((r) => allowedProjectIds.has(r.projectId));
    visibleDayAssignments = dayAssignments.filter((a) => allowedProjectIds.has(a.projectId));
    visibleWorkerAssignments = workerAssignments.filter((a) => allowedProjectIds.has(a.projectId));
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
        projectManagers={projectManagers}
        changeOrders={visibleChangeOrders}
        sovRequests={visibleSovRequests}
        initialDayAssignments={visibleDayAssignments}
        canFilterBySupervisor={canFilterBySupervisor}
        employees={employees}
        contractors={contractors}
        initialWorkerAssignments={visibleWorkerAssignments}
      />
    </div>
  );
}
