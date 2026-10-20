import { cache } from "react";
import { prisma } from "@/lib/prisma";
import type { CardRow, DashboardCardData } from "@/app/erp/(shell)/_dashboard/DashboardCard";
import { todayEasternAsUtcMidnight, todayEasternKey, utcDateKey } from "./dates";
import { findCrewConflicts, type CrewConflict, type ScheduledDay, type TimeOffSpan } from "./crewConflicts";
import { confirmationIssues } from "./scheduleConfirmations";

/**
 * Jobs tab (DASHBOARDS_PLAN.md Phase 7): Waiting on others, and Crew
 * conflicts in the next 14 days.
 */

/** A change order sitting in Draft or Submitted this long is waiting on someone. */
const CO_STALE_DAYS = 3;
/** How far ahead the sub insurance and crew checks look. */
const LOOKAHEAD_DAYS = 14;
const DAY_MS = 86_400_000;

function shortDate(key: string): string {
  return new Date(`${key}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

function daysAgo(d: Date, todayKey: string): number {
  return Math.round((Date.parse(`${todayKey}T00:00:00Z`) - Date.parse(`${todayEasternKey(d)}T00:00:00Z`)) / DAY_MS);
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function lookahead(): { todayKey: string; start: Date; end: Date } {
  const start = todayEasternAsUtcMidnight();
  return { todayKey: utcDateKey(start), start, end: new Date(start.getTime() + LOOKAHEAD_DAYS * DAY_MS - 1) };
}

/** Every person-day on the schedule in the window: project and change order worker assignments. */
async function loadScheduledWork(start: Date, end: Date) {
  const [projectDays, coDays] = await Promise.all([
    prisma.projectWorkerDayAssignment.findMany({
      where: { date: { gte: start, lte: end }, project: { status: { notIn: ["COMPLETE", "ARCHIVED", "CANCELLED"] } } },
      select: {
        date: true, employeeId: true, contractorId: true,
        project: { select: { id: true, jobTitle: true } },
        employee: { select: { firstName: true, lastName: true } },
        contractor: { select: { name: true } },
      },
    }),
    prisma.changeOrderWorkerDayAssignment.findMany({
      where: { date: { gte: start, lte: end }, changeOrder: { status: { notIn: ["VOID", "REJECTED", "COMPLETED"] } } },
      select: {
        date: true, employeeId: true, contractorId: true,
        changeOrder: { select: { id: true, title: true, project: { select: { id: true, jobTitle: true } } } },
        employee: { select: { firstName: true, lastName: true } },
        contractor: { select: { name: true } },
      },
    }),
  ]);
  return [
    ...projectDays.map((a) => ({ ...a, dayKey: utcDateKey(a.date), projectId: a.project.id, jobTitle: a.project.jobTitle, href: `/erp/projects/${a.project.id}` })),
    ...coDays.map((a) => ({
      ...a,
      dayKey: utcDateKey(a.date),
      projectId: a.changeOrder.project.id,
      jobTitle: `${a.changeOrder.project.jobTitle} (CO: ${a.changeOrder.title})`,
      href: `/erp/projects/${a.changeOrder.project.id}/change-orders/${a.changeOrder.id}`,
    })),
  ];
}

// ── Waiting on others ──────────────────────────────────────────────────────

export async function loadWaitingOnOthers(): Promise<DashboardCardData> {
  const { todayKey, start, end } = lookahead();
  const staleCutoff = new Date(start.getTime() - CO_STALE_DAYS * DAY_MS);

  const [pmRequests, pmChanges, changeOrders, work] = await Promise.all([
    prisma.propertyManagerRequest.findMany({
      where: { status: "REQUESTED" },
      select: { id: true, createdAt: true, requesterName: true, unitNumber: true, requestedStartDate: true, building: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.propertyManagerChange.findMany({
      where: { status: "OPEN" },
      select: { id: true, createdAt: true, kind: true, requesterName: true, newStartDate: true, building: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.projectChangeOrder.findMany({
      where: { status: { in: ["DRAFT", "SUBMITTED"] }, createdAt: { lte: staleCutoff } },
      select: { id: true, title: true, status: true, createdAt: true, requestedBy: true, project: { select: { id: true, jobTitle: true } } },
      orderBy: { createdAt: "asc" },
    }),
    loadScheduledWork(start, end),
  ]);

  const pmRows: CardRow[] = [
    ...pmRequests.map((r) => ({
      id: `req-${r.id}`,
      href: "/erp/property-managers/requests",
      title: `${r.building.name} - Unit ${r.unitNumber}`,
      note: `New turnover from ${r.requesterName} · wants ${shortDate(utcDateKey(r.requestedStartDate))}`,
      value: `${plural(daysAgo(r.createdAt, todayKey), "day")} waiting`,
    })),
    ...pmChanges.map((c) => ({
      id: `chg-${c.id}`,
      href: "/erp/property-managers/requests",
      title: c.building.name,
      note: `${c.kind === "CANCEL" ? "Cancel" : "New date"} asked by ${c.requesterName}${c.newStartDate ? ` · ${shortDate(utcDateKey(c.newStartDate))}` : ""}`,
      value: `${plural(daysAgo(c.createdAt, todayKey), "day")} waiting`,
    })),
  ];

  const coRows: CardRow[] = changeOrders.map((co) => ({
    id: co.id,
    href: `/erp/projects/${co.project.id}/change-orders/${co.id}`,
    title: co.title,
    note: `${co.project.jobTitle} · ${co.status === "DRAFT" ? "Draft" : "Submitted, not approved"}${co.requestedBy ? ` · asked by ${co.requestedBy}` : ""}`,
    value: `${plural(daysAgo(co.createdAt, todayKey), "day")} old`,
  }));

  // Subs on the schedule whose insurance is missing, or will have lapsed by the day they work.
  const subIds = [...new Set(work.flatMap((w) => w.contractorId ?? []))];
  const subs = await prisma.contractor.findMany({
    where: { id: { in: subIds } },
    select: { id: true, name: true, workersCompExempt: true, workersCompExpiresAt: true, glExpiresAt: true },
  });
  const firstDay = new Map<string, { dayKey: string; jobTitle: string; href: string }>();
  for (const w of work.filter((x) => x.contractorId).sort((a, b) => a.dayKey.localeCompare(b.dayKey))) {
    if (!firstDay.has(w.contractorId!)) firstDay.set(w.contractorId!, { dayKey: w.dayKey, jobTitle: w.jobTitle, href: w.href });
  }
  const subRows: CardRow[] = subs.flatMap((s) => {
    const first = firstDay.get(s.id);
    if (!first) return [];
    const issues: string[] = [];
    if (!s.workersCompExempt) {
      if (!s.workersCompExpiresAt) issues.push("WC not on file");
      else if (utcDateKey(s.workersCompExpiresAt) < first.dayKey) issues.push(`WC expired ${shortDate(utcDateKey(s.workersCompExpiresAt))}`);
    }
    if (s.glExpiresAt && utcDateKey(s.glExpiresAt) < first.dayKey) issues.push(`GL expired ${shortDate(utcDateKey(s.glExpiresAt))}`);
    if (!issues.length) return [];
    return [{
      id: s.id,
      href: `/erp/contractors/${s.id}`,
      title: s.name,
      note: `${issues.join(", ")} · first on ${first.jobTitle}`,
      value: shortDate(first.dayKey),
      negative: true,
    }];
  });

  return {
    sections: [
      { key: "pm", label: "Property managers", rows: pmRows, empty: "No requests or changes waiting for an answer.", href: "/erp/property-managers/requests" },
      { key: "co", label: "Change orders", rows: coRows, empty: `No change order has sat in Draft or Submitted over ${CO_STALE_DAYS} days.` },
      { key: "subs", label: "Subs", rows: subRows, alertCount: subRows.length, empty: `Every sub on the schedule in the next ${LOOKAHEAD_DAYS} days has insurance on file.`, href: "/erp/contractors" },
    ],
    alertCount: subRows.length,
  };
}

// ── Crew conflicts ─────────────────────────────────────────────────────────

const loadConflicts = cache(async (): Promise<{ double: CrewConflict[]; timeOff: CrewConflict[] }> => {
  const { start, end } = lookahead();
  const [work, employeeOff, contractorOff] = await Promise.all([
    loadScheduledWork(start, end),
    prisma.employeeTimeOff.findMany({
      where: { status: { in: ["APPROVED", "PENDING"] }, startDate: { lte: end }, endDate: { gte: start } },
      select: { employeeId: true, startDate: true, endDate: true, type: true, status: true },
    }),
    prisma.contractorTimeOff.findMany({
      where: { status: { in: ["APPROVED", "PENDING"] }, startDate: { lte: end }, endDate: { gte: start } },
      select: { contractorId: true, startDate: true, endDate: true, type: true, status: true },
    }),
  ]);
  const span = (personId: string, t: { startDate: Date; endDate: Date; type: string; status: string }): TimeOffSpan => ({
    personId, startKey: utcDateKey(t.startDate), endKey: utcDateKey(t.endDate), type: t.type, status: t.status,
  });
  const supervising = await loadSupervisorDays(start, end);
  return findCrewConflicts(
    [
      ...work.map((w) => ({
        dayKey: w.dayKey, employeeId: w.employeeId, contractorId: w.contractorId, projectId: w.projectId, jobTitle: w.jobTitle, href: w.href,
        personName: w.employee ? `${w.employee.firstName} ${w.employee.lastName}`.trim() : w.contractor?.name ?? "Someone",
        role: "crew" as const,
      })),
      ...supervising,
    ],
    employeeOff.map((t) => span(t.employeeId, t)),
    contractorOff.map((t) => span(t.contractorId, t)),
  );
});

/** Supervisor days (an ERP login or a sub), matched to the supervisor's employee record by email for time off. */
async function loadSupervisorDays(start: Date, end: Date): Promise<ScheduledDay[]> {
  const days = await prisma.projectDayAssignment.findMany({
    where: { date: { gte: start, lte: end }, project: { status: { notIn: ["COMPLETE", "ARCHIVED", "CANCELLED"] } } },
    select: {
      date: true, supervisorContractorId: true,
      supervisorUser: { select: { email: true } },
      supervisorContractor: { select: { name: true } },
      project: { select: { id: true, jobTitle: true } },
    },
  });
  const emails = [...new Set(days.flatMap((d) => d.supervisorUser?.email.toLowerCase() ?? []))];
  const employees = emails.length
    ? await prisma.employee.findMany({
        where: { OR: emails.map((e) => ({ email: { equals: e, mode: "insensitive" as const } })) },
        select: { id: true, email: true, firstName: true, lastName: true },
      })
    : [];
  const byEmail = new Map(employees.map((e) => [e.email!.toLowerCase(), e]));
  return days.flatMap((d): ScheduledDay[] => {
    const base = { dayKey: utcDateKey(d.date), projectId: d.project.id, jobTitle: d.project.jobTitle, href: `/erp/projects/${d.project.id}`, role: "supervisor" as const };
    const emp = d.supervisorUser ? byEmail.get(d.supervisorUser.email.toLowerCase()) : undefined;
    if (emp) return [{ ...base, employeeId: emp.id, contractorId: null, personName: `${emp.firstName} ${emp.lastName}`.trim() }];
    if (d.supervisorContractorId) return [{ ...base, employeeId: null, contractorId: d.supervisorContractorId, personName: d.supervisorContractor?.name ?? "Sub" }];
    return [];
  });
}

function conflictRow(c: CrewConflict): CardRow {
  return { id: c.id, href: c.href, title: c.personName, note: c.detail, value: shortDate(c.dayKey), negative: c.firm };
}

export async function loadCrewConflicts(): Promise<DashboardCardData> {
  const [{ double, timeOff }, answers] = await Promise.all([loadConflicts(), confirmationIssues(LOOKAHEAD_DAYS)]);
  const approvedOff = timeOff.filter((c) => c.firm).length;
  // People who clicked Can't make it, or haven't answered their invite yet (scheduleConfirmations.ts).
  const answerRow = (r: (typeof answers.declined)[number]): CardRow => ({
    id: `answer-${r.uid}`,
    href: r.link ?? "/erp/schedule",
    title: r.personName,
    note: r.status === "DECLINED" ? `${r.title}${r.reason ? `. Reason: ${r.reason}` : ""}` : r.title,
    value: shortDate(r.dateKey),
    negative: r.status === "DECLINED",
  });
  return {
    alertCount: double.length + approvedOff + answers.declined.length,
    sections: [
      { key: "double", label: "Double-booked", rows: double.map(conflictRow), alertCount: double.length, empty: `Nobody is on two jobs the same day in the next ${LOOKAHEAD_DAYS} days.`, href: "/erp/schedule" },
      { key: "time-off", label: "Time off", rows: timeOff.map(conflictRow), alertCount: approvedOff, empty: `Nobody is scheduled on a day off in the next ${LOOKAHEAD_DAYS} days.`, href: "/erp/schedule" },
      { key: "declined", label: "Declined", rows: answers.declined.map(answerRow), alertCount: answers.declined.length, empty: `Nobody has said they can't make it in the next ${LOOKAHEAD_DAYS} days.`, href: "/erp/schedule" },
      { key: "no-answer", label: "No answer", rows: answers.pending.map(answerRow), empty: `Everyone scheduled in the next ${LOOKAHEAD_DAYS} days has answered.`, href: "/erp/schedule" },
    ],
  };
}

/** Red number for the Jobs tab: double bookings plus people scheduled on approved time off. */
export async function countCrewConflicts(): Promise<number> {
  const { double, timeOff } = await loadConflicts();
  return double.length + timeOff.filter((c) => c.firm).length;
}
