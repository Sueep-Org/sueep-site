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
    prisma.laborEntry.findMany({ select: { projectId: true, workDate: true } }),
    prisma.projectChangeOrder.findMany({
      where: { status: { notIn: CO_STATUS_EXCLUDED } },
      select: { id: true, projectId: true, title: true, status: true, startDate: true },
    }),
    prisma.projectChangeOrderLaborer.findMany({ select: { changeOrderId: true, workDate: true } }),
    prisma.projectDayAssignment.findMany({ select: { id: true, projectId: true, date: true, supervisorUserId: true } }),
  ]);

  const dayAssignments: ScheduleDayAssignment[] = dayAssignmentRows.map((a) => ({
    id: a.id,
    projectId: a.projectId,
    dateKey: dayKey(a.date),
    supervisorUserId: a.supervisorUserId,
  }));

  // Calendar day cells are driven by actual logged work, not a project's full
  // start/end span — a project spanning two weeks isn't worked every day.
  const workDayKeysByProject = new Map<string, Set<string>>();
  for (const le of laborEntryRows) {
    const set = workDayKeysByProject.get(le.projectId) ?? new Set<string>();
    set.add(dayKey(le.workDate));
    workDayKeysByProject.set(le.projectId, set);
  }

  const workDayKeysByChangeOrder = new Map<string, Set<string>>();
  for (const cl of coLaborerRows) {
    const set = workDayKeysByChangeOrder.get(cl.changeOrderId) ?? new Set<string>();
    set.add(dayKey(cl.workDate));
    workDayKeysByChangeOrder.set(cl.changeOrderId, set);
  }

  const changeOrders: ScheduleChangeOrder[] = changeOrderRows
    .map((co) => {
      const days = workDayKeysByChangeOrder.get(co.id) ?? new Set<string>();
      if (co.startDate) days.add(dayKey(co.startDate));
      return {
        id: co.id,
        projectId: co.projectId,
        title: co.title,
        status: co.status,
        workDayKeys: Array.from(days),
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

  const projects: ScheduleProject[] = projectRows.map((r) => ({
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
  }));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-pink-600">Schedule & Labor</h1>
        </div>
      </div>

      <hr className="border-pink-200" />

      {/* Project Schedule */}
      <SchedulePlanner
        projects={projects}
        supervisors={supervisors}
        changeOrders={changeOrders}
        initialDayAssignments={dayAssignments}
        canFilterBySupervisor={canFilterBySupervisor}
      />
    </div>
  );
}
