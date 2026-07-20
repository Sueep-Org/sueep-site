import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { deriveProjectLifecycle } from "@/lib/erp/projectLifecycle";
import { utcDateKey } from "@/lib/erp/dates";
import { evaluateEmployeeCompliance } from "@/lib/erp/employees";
import { projectSegmentLabel } from "@/lib/erp/projectSegments";
import { getErpAuth, canSeeFinancials } from "@/lib/erpAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseRequiredDocuments(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

function centsToDollarsShort(cents: number | null): string {
  if (cents == null) return "—";
  const dollars = cents / 100;
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
  if (dollars >= 1_000) return `$${(dollars / 1_000).toFixed(0)}k`;
  return `$${dollars.toFixed(0)}`;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function timeAgo(date: Date): string {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

type ActivityProject = {
  status: string;
  billingStatus: string | null;
  percentDone: number;
  percentInvoiced: number;
  projectDate: Date | null;
};

/**
 * There's no per-field change history on Project, so "recent activity" can't
 * say what changed from what — only what's true about it right now. This
 * picks the single most relevant current fact (in priority order) so the
 * feed reads as "this project was touched because X" instead of a bare
 * status label that doesn't explain anything.
 */
function describeProjectActivity(p: ActivityProject): { text: string; dot: string } {
  const status = p.status.toUpperCase();
  const billing = p.billingStatus?.toUpperCase() ?? null;
  const isPaid = billing === "PAID" || billing === "INVOICE_PAID";

  if (status === "ARCHIVED") return { text: "Archived", dot: "bg-gray-300" };
  if (status === "ON_HOLD") return { text: "Put on hold", dot: "bg-amber-400" };
  if (status === "COMPLETE") return { text: isPaid ? "Completed · invoice paid" : "Completed", dot: "bg-emerald-400" };
  if (isPaid) return { text: "Invoice paid", dot: "bg-emerald-400" };
  if (billing === "BILLING") return { text: "Sent to billing", dot: "bg-blue-400" };
  if (p.percentInvoiced > 0) return { text: `${Math.round(p.percentInvoiced)}% invoiced`, dot: "bg-sky-400" };
  if (p.percentDone > 0) return { text: `${Math.round(p.percentDone)}% done`, dot: "bg-violet-400" };
  if (deriveProjectLifecycle(status, p.projectDate?.toISOString() ?? null) === "UPCOMING") {
    return { text: "Scheduled to start", dot: "bg-violet-400" };
  }
  return { text: "In progress", dot: "bg-emerald-400" };
}

// Monday-anchored week bucket, matching the OT week convention in calcOtSplits.ts.
function mondayOf(d: Date): string {
  const date = new Date(d);
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString().slice(0, 10);
}

const SEGMENT_DOT: Record<string, string> = {
  JANITORIAL_TURNOVER_REQUESTS: "bg-teal-400",
  COMMERCIAL_CLEANING: "bg-teal-400",
  POST_CONSTRUCTION: "bg-amber-400",
  COMMERCIAL: "bg-violet-400",
};

export default async function ErpDashboardPage() {
  try {
    const auth = await getErpAuth();
    const role = auth?.role ?? "EMPLOYEE";
    const email = auth?.email ?? "";
    const showFinancials = canSeeFinancials(role);

    // Try to match logged-in user to an employee record for their name
    const employeeRecord = email
      ? await prisma.employee.findFirst({
          where: { email: { equals: email, mode: "insensitive" } },
          select: { firstName: true, lastName: true },
        })
      : null;

    const displayName = employeeRecord
      ? `${employeeRecord.firstName} ${employeeRecord.lastName}`.trim()
      : email.split("@")[0];

    const today = new Date().toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", year: "numeric",
    });

    // ── Employee: just a greeting ──────────────────────────────────────────
    if (role === "EMPLOYEE") {
      return (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-sm text-gray-400">{today}</p>
          <h1 className="mt-3 text-4xl font-bold text-gray-900">{greeting()}, {displayName}.</h1>
          <p className="mt-2 text-gray-500">Welcome to the Sueep ERP.</p>
          <Link
            href="/erp/schedule"
            className="mt-8 rounded-md bg-pink-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-pink-700"
          >
            View Schedule
          </Link>
        </div>
      );
    }

    // ── Finance ────────────────────────────────────────────────────────────
    if (role === "FINANCE") {
      return (
        <div className="space-y-6">
          <div>
            <p className="text-sm text-gray-400">{today}</p>
            <h1 className="mt-1 text-2xl font-bold text-pink-600">{greeting()}, {displayName}.</h1>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { href: "/erp/billing", label: "Billing", title: "Project Billing", dot: "bg-emerald-400" },
              { href: "/erp/payroll", label: "Payroll", title: "Payroll Export", dot: "bg-violet-400" },
              { href: "/erp/employees", label: "Employees", title: "Employee Records", dot: "bg-blue-400" },
              { href: "/erp/projects", label: "Projects", title: "All Projects", dot: "bg-sky-400" },
              { href: "/erp/candidates", label: "Hiring", title: "Candidates", dot: "bg-amber-400" },
              { href: "/erp/contractors", label: "Hiring", title: "Contractor Verification", dot: "bg-teal-400" },
            ].map((c) => (
              <Link key={c.title} href={c.href} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition hover:shadow-md">
                <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${c.dot}`} />
                  {c.label}
                </p>
                <p className="mt-0.5 text-base font-semibold text-gray-900">{c.title}</p>
              </Link>
            ))}
          </div>
        </div>
      );
    }

    // ── Estimation ─────────────────────────────────────────────────────────
    if (role === "ESTIMATION") {
      const [missingEstimates, recentChangeOrders] = await Promise.all([
        prisma.project.findMany({
          where: {
            OR: [{ estLaborCents: null }, { estMaterialCents: null }],
            NOT: { status: { in: ["COMPLETED", "ARCHIVED", "CANCELLED"] } },
          },
          select: { id: true, jobTitle: true, estLaborCents: true, estMaterialCents: true, segment: true, status: true },
          orderBy: { updatedAt: "desc" },
          take: 20,
        }),
        prisma.projectChangeOrder.findMany({
          orderBy: { updatedAt: "desc" },
          take: 10,
          select: {
            id: true, title: true, status: true, updatedAt: true,
            project: { select: { id: true, jobTitle: true } },
          },
        }),
      ]);

      return (
        <div className="space-y-6">
          <div>
            <p className="text-sm text-gray-400">{today}</p>
            <h1 className="mt-1 text-2xl font-bold text-pink-600">{greeting()}, {displayName}.</h1>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Projects needing estimates */}
            <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                <h2 className="text-sm font-semibold text-gray-900" title="Need est. labor or material">Projects missing estimates</h2>
                <span className="rounded-full bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-600">{missingEstimates.length}</span>
              </div>
              {missingEstimates.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-gray-400">All projects have estimates.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {missingEstimates.map((p) => (
                    <li key={p.id}>
                      <Link href={`/erp/projects/${p.id}`} className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-gray-900">{p.jobTitle}</p>
                          <div className="mt-0.5 flex gap-1.5">
                            {p.estLaborCents == null && <span className="text-[10px] font-medium text-orange-500">Missing labor est.</span>}
                            {p.estMaterialCents == null && <span className="text-[10px] font-medium text-orange-500">Missing material est.</span>}
                          </div>
                        </div>
                        <span className="ml-3 shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                          {projectSegmentLabel(p.segment)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Recent change orders */}
            <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                <h2 className="text-sm font-semibold text-gray-900">Recent change orders</h2>
              </div>
              {recentChangeOrders.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-gray-400">No change orders yet.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {recentChangeOrders.map((co) => (
                    <li key={co.id}>
                      <Link href={`/erp/projects/${co.project.id}/change-orders/${co.id}`} className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-gray-900">{co.title}</p>
                          <p className="truncate text-xs text-gray-400">{co.project.jobTitle}</p>
                        </div>
                        <div className="ml-3 shrink-0 text-right">
                          <span className="text-xs font-medium text-gray-600">{co.status}</span>
                          <p className="text-[11px] text-gray-400">{timeAgo(co.updatedAt)}</p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      );
    }

    // ── Supervisor ─────────────────────────────────────────────────────────
    if (role === "SUPERVISOR") {
      // auth.uid is the Firebase UID from the session token, not the
      // ErpUser.id that Project.supervisorUserId actually references.
      const supervisorUser = auth?.uid
        ? await prisma.erpUser.findUnique({ where: { firebaseUid: auth.uid }, select: { id: true } })
        : null;
      const supervisorEmployee = auth?.email
        ? await prisma.employee.findFirst({
            where: { email: { equals: auth.email, mode: "insensitive" } },
            select: { id: true, firstName: true, lastName: true },
          })
        : null;
      const supervisorFullName = supervisorEmployee
        ? `${supervisorEmployee.firstName} ${supervisorEmployee.lastName}`.trim()
        : null;

      // "My projects" = assigned to (project-level or a specific scheduled
      // day) or personally logged labor on — same rule as the schedule page.
      const assignmentOr: Prisma.ProjectWhereInput[] = [];
      if (supervisorUser) {
        assignmentOr.push({ supervisorUserId: supervisorUser.id });
        assignmentOr.push({ dayAssignments: { some: { supervisorUserId: supervisorUser.id } } });
      }
      if (supervisorEmployee) {
        assignmentOr.push({ laborEntries: { some: { employeeId: supervisorEmployee.id } } });
      }
      if (supervisorFullName) {
        assignmentOr.push({ laborEntries: { some: { workerName: { equals: supervisorFullName, mode: "insensitive" } } } });
      }

      const _now = new Date();
      const todayStart = new Date(Date.UTC(_now.getUTCFullYear(), _now.getUTCMonth(), _now.getUTCDate(), 0, 0, 0, 0));
      const todayEnd = new Date(Date.UTC(_now.getUTCFullYear(), _now.getUTCMonth(), _now.getUTCDate(), 23, 59, 59, 999));

      const [myProjects, openIncidents] = await Promise.all([
        prisma.project.findMany({
          where: assignmentOr.length > 0
            ? { OR: assignmentOr, NOT: { status: { in: ["COMPLETED", "ARCHIVED"] } } }
            : { NOT: { status: { in: ["COMPLETED", "ARCHIVED"] } } },
          select: {
            id: true, jobTitle: true, status: true, projectDate: true, segment: true,
            dailySafetyChecks: {
              where: { checkDate: { gte: todayStart, lte: todayEnd } },
              include: { workers: { select: { passed: true } } },
              take: 1,
            },
          },
          orderBy: [{ projectDate: "asc" }, { updatedAt: "desc" }],
        }),
        prisma.safetyIncident.findMany({
          where: assignmentOr.length > 0
            ? { status: { in: ["OPEN", "ESCALATED"] }, project: { OR: assignmentOr } }
            : { status: { in: ["OPEN", "ESCALATED"] } },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true, workerName: true, violationCount: true, status: true, checkDate: true, createdAt: true,
            project: { select: { id: true, jobTitle: true } },
          },
        }),
      ]);

      // Today's crew: who's actually working (logged hours) or planned
      // (ProjectWorkerDayAssignment, not yet logged) on each of my projects
      // today — scoped to the same myProjects set as everything else on this
      // dashboard, which already includes projects I'm assigned to (project-
      // level or a specific day) OR have personally logged labor on, same
      // rule the schedule calendar uses for what a supervisor can see.
      const myProjectIds = myProjects.map((p) => p.id);
      const [todayWorkerAssignments, todayLaborEntries] = myProjectIds.length > 0
        ? await Promise.all([
            prisma.projectWorkerDayAssignment.findMany({
              where: { projectId: { in: myProjectIds }, date: { gte: todayStart, lte: todayEnd } },
              select: { projectId: true, employee: { select: { firstName: true, lastName: true } } },
            }),
            prisma.laborEntry.findMany({
              where: { projectId: { in: myProjectIds }, workDate: { gte: todayStart, lte: todayEnd } },
              select: { projectId: true, workerName: true, hours: true },
            }),
          ])
        : [[], []];

      type CrewMember = { name: string; hours: number | null };
      const crewByProject = new Map<string, CrewMember[]>();
      const loggedNamesByProject = new Map<string, Set<string>>();
      for (const entry of todayLaborEntries) {
        const list = crewByProject.get(entry.projectId) ?? [];
        const existing = list.find((c) => c.name === entry.workerName);
        if (existing) existing.hours = (existing.hours ?? 0) + entry.hours;
        else list.push({ name: entry.workerName, hours: entry.hours });
        crewByProject.set(entry.projectId, list);
        const names = loggedNamesByProject.get(entry.projectId) ?? new Set<string>();
        names.add(entry.workerName);
        loggedNamesByProject.set(entry.projectId, names);
      }
      for (const a of todayWorkerAssignments) {
        const name = `${a.employee.firstName} ${a.employee.lastName}`.trim();
        if (loggedNamesByProject.get(a.projectId)?.has(name)) continue; // already counted as logged
        const list = crewByProject.get(a.projectId) ?? [];
        if (!list.some((c) => c.name === name)) list.push({ name, hours: null });
        crewByProject.set(a.projectId, list);
      }
      const projectsWithCrew = myProjects.filter((p) => (crewByProject.get(p.id)?.length ?? 0) > 0);

      // "My projects" as a list version of the schedule calendar: same three
      // states as the calendar's chips — solid (logged), dashed/gray
      // (planned for today-or-later, not yet logged), dashed/red (planned
      // day already passed with nothing ever logged, i.e. missed) — instead
      // of one flat row per project with no day-level detail. Window is
      // yesterday through 5 days out, matching the calendar's rolling
      // "recent + upcoming" feel without pulling in a whole month.
      const feedWindowStart = new Date(todayStart);
      feedWindowStart.setUTCDate(feedWindowStart.getUTCDate() - 1);
      const feedWindowEnd = new Date(todayEnd);
      feedWindowEnd.setUTCDate(feedWindowEnd.getUTCDate() + 5);

      const [feedDayAssignments, feedWorkerAssignments, feedLaborEntries] = myProjectIds.length > 0
        ? await Promise.all([
            prisma.projectDayAssignment.findMany({
              where: { projectId: { in: myProjectIds }, date: { gte: feedWindowStart, lte: feedWindowEnd } },
              select: { projectId: true, date: true },
            }),
            prisma.projectWorkerDayAssignment.findMany({
              where: { projectId: { in: myProjectIds }, date: { gte: feedWindowStart, lte: feedWindowEnd } },
              select: { projectId: true, date: true },
            }),
            prisma.laborEntry.findMany({
              where: { projectId: { in: myProjectIds }, workDate: { gte: feedWindowStart, lte: feedWindowEnd } },
              select: { projectId: true, workDate: true, hours: true, workerName: true },
            }),
          ])
        : [[], [], []];

      type DayEntry = { projectId: string; jobTitle: string; dayKey: string; kind: "logged" | "planned" | "missed"; hours?: number; workers?: string[] };
      const jobTitleByProjectId = new Map(myProjects.map((p) => [p.id, p.jobTitle]));

      const loggedByKey = new Map<string, { hours: number; workers: Set<string> }>();
      for (const e of feedLaborEntries) {
        const key = `${e.projectId}::${utcDateKey(e.workDate)}`;
        const cur = loggedByKey.get(key) ?? { hours: 0, workers: new Set<string>() };
        cur.hours += e.hours;
        cur.workers.add(e.workerName);
        loggedByKey.set(key, cur);
      }
      const plannedKeys = new Set<string>();
      for (const a of feedDayAssignments) plannedKeys.add(`${a.projectId}::${utcDateKey(a.date)}`);
      for (const a of feedWorkerAssignments) plannedKeys.add(`${a.projectId}::${utcDateKey(a.date)}`);

      const todayKeyStr = utcDateKey(todayStart);
      const dayEntries: DayEntry[] = [];
      for (const [key, logged] of loggedByKey) {
        const [projectId, dayKey] = key.split("::");
        dayEntries.push({ projectId, jobTitle: jobTitleByProjectId.get(projectId) ?? "", dayKey, kind: "logged", hours: logged.hours, workers: [...logged.workers] });
      }
      for (const key of plannedKeys) {
        if (loggedByKey.has(key)) continue; // already showing as logged for that day
        const [projectId, dayKey] = key.split("::");
        dayEntries.push({ projectId, jobTitle: jobTitleByProjectId.get(projectId) ?? "", dayKey, kind: dayKey < todayKeyStr ? "missed" : "planned" });
      }
      dayEntries.sort((a, b) => {
        if ((a.kind === "missed") !== (b.kind === "missed")) return a.kind === "missed" ? -1 : 1;
        return a.dayKey.localeCompare(b.dayKey);
      });
      const visibleDayEntries = dayEntries.slice(0, 20);

      // KPIs across all my projects today
      const allWorkers = myProjects.flatMap((p) => p.dailySafetyChecks.flatMap((c) => c.workers));
      const totalWorkers = allWorkers.length;
      const passedWorkers = allWorkers.filter((w) => w.passed).length;
      const complianceRate = totalWorkers > 0 ? Math.round((passedWorkers / totalWorkers) * 100) : null;
      const projectsWithCheck = myProjects.filter((p) => p.dailySafetyChecks.length > 0).length;
      const projectsMissingCheck = myProjects.filter(
        (p) => p.segment === "POST_CONSTRUCTION" && p.dailySafetyChecks.length === 0
      ).length;

      return (
        <div className="space-y-6">
          <div>
            <p className="text-sm text-gray-400">{today}</p>
            <h1 className="mt-1 text-2xl font-bold text-pink-600">{greeting()}, {displayName}.</h1>
          </div>

          {/* Stat strip */}
          <div className="grid grid-cols-2 divide-x divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm sm:grid-cols-4 sm:divide-y-0">
            {[
              { label: "My Projects", value: myProjects.length, dot: "bg-blue-400", val: "text-blue-700", alert: false },
              { label: "Checks Today", value: `${projectsWithCheck}/${myProjects.length}`, dot: "bg-teal-400", val: "text-teal-700", alert: projectsMissingCheck > 0 },
              { label: "Compliance", value: complianceRate !== null ? `${complianceRate}%` : "—", dot: "bg-emerald-400", val: "text-emerald-700", alert: complianceRate !== null && complianceRate < 100 },
              { label: "Open Incidents", value: openIncidents.length, dot: "bg-red-400", val: "text-gray-900", alert: openIncidents.length > 0 },
            ].map((k) => (
              <div key={k.label} className="px-4 py-3">
                <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-gray-400">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${k.dot}`} />
                  {k.label}
                </p>
                <p className={`mt-0.5 text-lg font-semibold ${k.alert ? "text-red-600" : k.val}`}>{k.value}</p>
              </div>
            ))}
          </div>

          {/* Today's crew */}
          <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
            <div className="border-b border-gray-100 bg-gray-50 px-4 py-3">
              <h2 className="text-sm font-semibold text-gray-900" title="Logged hours today, plus anyone planned but not yet logged">Today&apos;s crew</h2>
            </div>
            {projectsWithCrew.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-gray-400">No one logged or scheduled today yet.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {projectsWithCrew.map((p) => {
                  const crew = crewByProject.get(p.id) ?? [];
                  return (
                    <li key={p.id}>
                      <Link href={`/erp/projects/${p.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-gray-50 transition">
                        <p className="truncate text-sm font-medium text-gray-900">{p.jobTitle}</p>
                        <p className="shrink-0 text-right text-xs text-gray-500">
                          {crew.map((c) => (c.hours != null ? `${c.name} (${c.hours.toFixed(1)}h)` : `${c.name} (planned)`)).join(", ")}
                        </p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* My projects — a list version of the schedule calendar: solid
                (logged), dashed/gray (planned, not yet logged), dashed/red
                (planned day already passed and never logged) */}
            <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
              <div className="border-b border-gray-100 px-4 py-3">
                <h2 className="text-sm font-semibold text-gray-900" title="Yesterday through 5 days out">My projects</h2>
                {assignmentOr.length === 0 && (
                  <p className="mt-0.5 text-xs text-amber-600">Not linked to an ERP supervisor account or employee record — showing all projects. Ask an admin to assign you in the project Setup tab.</p>
                )}
              </div>
              {visibleDayEntries.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-gray-400">Nothing logged or planned in this window.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {visibleDayEntries.map((e) => {
                    const dateLabel = new Date(`${e.dayKey}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
                    return (
                      <li key={`${e.projectId}-${e.dayKey}-${e.kind}`}>
                        <Link href={`/erp/projects/${e.projectId}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition">
                          <span
                            className={`h-2 w-2 shrink-0 rounded-full ${
                              e.kind === "logged"
                                ? "bg-emerald-400"
                                : e.kind === "missed"
                                ? "border border-dashed border-red-400"
                                : "border border-dashed border-gray-400"
                            }`}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-gray-900">{e.jobTitle}</p>
                            <p className="truncate text-xs text-gray-400 mt-0.5">
                              {e.kind === "logged" ? (e.workers ?? []).join(", ") : e.kind === "missed" ? "Planned, never logged" : "Planned"}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className={`text-xs font-semibold ${e.kind === "missed" ? "text-red-600" : "text-gray-700"}`}>
                              {e.kind === "logged" ? `${(e.hours ?? 0).toFixed(1)}h` : e.kind === "missed" ? "Missed" : "Planned"}
                            </p>
                            <p className="text-[11px] text-gray-400">{dateLabel}</p>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Open incidents */}
            <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
              <div className="border-b border-gray-100 px-4 py-3">
                <h2 className="text-sm font-semibold text-gray-900" title="Workers marked non-compliant">Open incidents</h2>
              </div>
              {openIncidents.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-gray-400">No open incidents.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {openIncidents.map((inc) => (
                    <li key={inc.id}>
                      <Link href={`/erp/projects/${inc.project.id}?tab=${encodeURIComponent("Safety Checklist")}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-900">{inc.workerName}</p>
                          <p className="truncate text-xs text-gray-400">{inc.project.jobTitle}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${inc.status === "ESCALATED" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                            {inc.status === "ESCALATED" ? "Escalated" : `#${inc.violationCount}`}
                          </span>
                          <p className="mt-0.5 text-[11px] text-gray-400">
                            {new Date(inc.checkDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      );
    }

    // ── Admin / Project Manager ────────────────────────────────────────────
    const _adminNow = new Date();
    const adminTodayStart = new Date(Date.UTC(_adminNow.getUTCFullYear(), _adminNow.getUTCMonth(), _adminNow.getUTCDate(), 0, 0, 0, 0));
    const adminTodayEnd = new Date(Date.UTC(_adminNow.getUTCFullYear(), _adminNow.getUTCMonth(), _adminNow.getUTCDate(), 23, 59, 59, 999));

    const flagWindowStart = new Date(adminTodayStart);
    flagWindowStart.setUTCDate(flagWindowStart.getUTCDate() - 13);

    const [allProjects, employees, candidates, contractors, recentProjects, recentLabor, laborForFlags, todaySafetyChecks, openIncidentCount, escalatedIncidentCount] = await Promise.all([
      prisma.project.findMany({
        select: { id: true, status: true, projectDate: true, contractValueCents: true, segment: true },
        orderBy: { updatedAt: "desc" },
        take: 500,
      }),
      prisma.employee.findMany({
        select: {
          id: true, firstName: true, lastName: true, status: true, requiredDocuments: true,
          documents: { select: { documentType: true, expiresAt: true } },
        },
      }),
      prisma.candidateApplication.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.contractor.count({ where: { status: "ACTIVE" } }),
      prisma.project.findMany({
        select: {
          id: true, jobTitle: true, status: true, segment: true,
          supervisor: true, updatedAt: true, projectDate: true, billingStatus: true,
          contractValueCents: true, percentDone: true, percentInvoiced: true,
        },
        orderBy: { updatedAt: "desc" },
        take: 15,
      }),
      prisma.laborEntry.findMany({
        orderBy: { workDate: "desc" },
        take: 150,
        select: {
          id: true, workDate: true, workerName: true, hours: true,
          project: { select: { id: true, jobTitle: true, status: true, supervisor: true, segment: true } },
        },
      }),
      prisma.laborEntry.findMany({
        where: { employeeId: { not: null }, workDate: { gte: flagWindowStart, lte: adminTodayEnd } },
        select: {
          employeeId: true, workerName: true, workDate: true, hours: true,
          project: { select: { id: true, jobTitle: true } },
        },
      }),
      prisma.dailySafetyCheck.findMany({
        where: { checkDate: { gte: adminTodayStart, lte: adminTodayEnd } },
        include: { workers: { select: { passed: true } } },
      }),
      prisma.safetyIncident.count({ where: { status: { in: ["OPEN", "ESCALATED"] } } }),
      prisma.safetyIncident.count({ where: { status: "ESCALATED" } }),
    ]);

    // Lifecycle bucketing
    let wipCount = 0, upcomingCount = 0;
    let wipValue = 0;
    for (const p of allProjects) {
      const lc = deriveProjectLifecycle(p.status, p.projectDate?.toISOString() ?? null);
      if (lc === "ACTIVE") { wipCount++; wipValue += p.contractValueCents ?? 0; }
      else if (lc === "UPCOMING") upcomingCount++;
    }

    // Employee compliance
    const activeEmployees = employees.filter((e) => e.status === "ACTIVE");
    const nonCompliant = activeEmployees.filter((e) => {
      const req = parseRequiredDocuments(e.requiredDocuments);
      return evaluateEmployeeCompliance(e.status, req, e.documents) === "NON_COMPLIANT";
    });

    const candidateMap = Object.fromEntries(candidates.map((c) => [c.status, c._count._all]));
    const pendingCandidates = (candidateMap.APPLIED ?? 0) + (candidateMap.INTERVIEWING ?? 0);

    // "Where we are": the most recent labor entry per project — one row per
    // project, not one row per log — so it reads as a live snapshot of where
    // people are working rather than a raw activity feed. recentLabor is
    // already ordered by workDate desc, so the first entry seen per project
    // is that project's latest. ARCHIVED is excluded everywhere (dead work),
    // but COMPLETE only excludes non-turnover projects — turnover units are
    // typically one-day jobs that get marked COMPLETE right after the labor
    // that finished them is logged, so excluding COMPLETE there would hide
    // almost all turnover activity, not just stale projects.
    const whereWeAre: typeof recentLabor = [];
    const seenProjectIds = new Set<string>();
    for (const entry of recentLabor) {
      if (entry.project.status === "ARCHIVED") continue;
      if (entry.project.status === "COMPLETE" && entry.project.segment !== "JANITORIAL_TURNOVER_REQUESTS") continue;
      if (seenProjectIds.has(entry.project.id)) continue;
      seenProjectIds.add(entry.project.id);
      whereWeAre.push(entry);
      if (whereWeAre.length >= 10) break;
    }

    // Labor red flags: hours concentrated on a single project, either in one
    // day or over a week, within the last 14 days (roughly a pay period).
    // Two independent signals merged into one list: a single long shift can
    // be a data-entry error or a burnout risk even if the week overall looks
    // normal; a high weekly total on one project can hide a bad entry spread
    // across several days. Distinct from the payroll OT split in
    // calcOtSplits.ts, which sums a worker's hours across ALL projects for
    // pay — this is specifically about concentration on ONE project.
    const DAY_HOURS_FLAG_THRESHOLD = 12;
    const WEEK_HOURS_FLAG_THRESHOLD = 40;
    type LaborFlag = { kind: "day" | "week"; workerName: string; projectId: string; jobTitle: string; hours: number; label: string };

    const dayFlags: LaborFlag[] = laborForFlags
      .filter((e) => e.hours >= DAY_HOURS_FLAG_THRESHOLD)
      .map((e) => ({
        kind: "day" as const,
        workerName: e.workerName,
        projectId: e.project.id,
        jobTitle: e.project.jobTitle,
        hours: e.hours,
        label: `${new Date(e.workDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · single day`,
      }));

    const weekBuckets = new Map<string, { workerName: string; projectId: string; jobTitle: string; hours: number; weekStart: string }>();
    for (const e of laborForFlags) {
      const weekStart = mondayOf(e.workDate);
      const key = `${e.employeeId}::${e.project.id}::${weekStart}`;
      const bucket = weekBuckets.get(key) ?? { workerName: e.workerName, projectId: e.project.id, jobTitle: e.project.jobTitle, hours: 0, weekStart };
      bucket.hours += e.hours;
      weekBuckets.set(key, bucket);
    }
    const weekFlags: LaborFlag[] = [...weekBuckets.values()]
      .filter((w) => w.hours >= WEEK_HOURS_FLAG_THRESHOLD)
      .map((w) => ({
        kind: "week" as const,
        workerName: w.workerName,
        projectId: w.projectId,
        jobTitle: w.jobTitle,
        hours: w.hours,
        label: `week of ${new Date(`${w.weekStart}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
      }));

    const laborFlags = [...dayFlags, ...weekFlags].sort((a, b) => b.hours - a.hours).slice(0, 8);

    // Safety KPIs
    const safetyWorkers = todaySafetyChecks.flatMap((c) => c.workers);
    const safetyTotal = safetyWorkers.length;
    const safetyPassed = safetyWorkers.filter((w) => w.passed).length;
    const safetyComplianceRate = safetyTotal > 0 ? Math.round((safetyPassed / safetyTotal) * 100) : null;

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm text-gray-400">{today}</p>
            <h1 className="mt-1 text-2xl font-bold text-pink-600">{greeting()}, {displayName}.</h1>
          </div>
          <div className="flex gap-2">
            <Link href="/erp/projects/new" className="rounded-md bg-pink-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-pink-700">
              + New project
            </Link>
            <Link href="/erp/schedule" className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
              Schedule
            </Link>
          </div>
        </div>

        {/* Stat strip — Overview + Safety, one card, thin dividers instead of boxed tiles */}
        <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="grid grid-cols-3 divide-x divide-y divide-gray-100 sm:grid-cols-6 sm:divide-y-0">
            {[
              { label: "WIP", value: wipCount, sub: showFinancials ? centsToDollarsShort(wipValue) : null, href: "/erp/projects", dot: "bg-emerald-400", val: "text-emerald-700" },
              { label: "Upcoming", value: upcomingCount, sub: null, href: "/erp/projects", dot: "bg-violet-400", val: "text-violet-700" },
              { label: "Employees", value: activeEmployees.length, sub: null, href: "/erp/employees", dot: "bg-blue-400", val: "text-blue-700" },
              { label: "Contractors", value: contractors, sub: null, href: "/erp/contractors", dot: "bg-sky-400", val: "text-sky-700" },
              { label: "Non-Compliant", value: nonCompliant.length, sub: null, href: "/erp/employees", dot: "bg-red-400", val: "text-gray-900", alert: nonCompliant.length > 0 },
              { label: "Candidates", value: pendingCandidates, sub: null, href: "/erp/candidates", dot: "bg-amber-400", val: "text-gray-900", alert: pendingCandidates > 0 },
            ].map((k) => (
              <Link key={k.label} href={k.href} className="px-4 py-3 transition hover:bg-gray-50">
                <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-gray-400">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${k.dot}`} />
                  {k.label}
                </p>
                <p className={`mt-0.5 text-lg font-semibold ${k.alert ? "text-red-600" : k.val}`}>{k.value}</p>
                {k.sub && <p className="text-[11px] text-gray-400">{k.sub}</p>}
              </Link>
            ))}
          </div>
          <div className="grid grid-cols-2 divide-x divide-y divide-gray-100 border-t border-gray-100 sm:grid-cols-4 sm:divide-y-0" title="Safety — today">
            {[
              { label: "Checks today", value: todaySafetyChecks.length, dot: "bg-teal-400", val: "text-teal-700", alert: false },
              { label: "Compliance", value: safetyComplianceRate !== null ? `${safetyComplianceRate}%` : "—", dot: "bg-emerald-400", val: "text-emerald-700", alert: safetyComplianceRate !== null && safetyComplianceRate < 100 },
              { label: "Incidents", value: openIncidentCount, dot: "bg-amber-400", val: "text-gray-900", alert: openIncidentCount > 0 },
              { label: "Escalated", value: escalatedIncidentCount, dot: "bg-red-400", val: "text-gray-900", alert: escalatedIncidentCount > 0 },
            ].map((k) => (
              <div key={k.label} className="px-4 py-3">
                <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-gray-400">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${k.dot}`} />
                  {k.label}
                </p>
                <p className={`mt-0.5 text-lg font-semibold ${k.alert ? "text-red-600" : k.val}`}>{k.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Where we are / Labor red flags */}
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
            <div className="border-b border-gray-100 bg-gray-50 px-4 py-3">
              <h2 className="text-sm font-semibold text-gray-900" title="Active projects · most recent labor log each">Where we are</h2>
            </div>
            {whereWeAre.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-gray-400">No labor entries yet.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {whereWeAre.map((e) => (
                  <li key={e.project.id}>
                    <Link href={`/erp/projects/${e.project.id}`} className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-900">{e.project.jobTitle}</p>
                        <p className="truncate text-xs text-gray-400">
                          {e.workerName}{e.project.supervisor ? ` · ${e.project.supervisor}` : ""}
                        </p>
                      </div>
                      <div className="ml-2 shrink-0 text-right">
                        <p className="text-xs font-semibold text-gray-700">{e.hours.toFixed(2)}h</p>
                        <p className="text-[11px] text-gray-400">
                          {new Date(e.workDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-3">
              <h2 className="text-sm font-semibold text-gray-900" title="Last 14 days · 12+ hrs in a day or 40+ hrs in a week, on one project">Labor red flags</h2>
              {laborFlags.length > 0 && (
                <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">{laborFlags.length}</span>
              )}
            </div>
            {laborFlags.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-gray-400">No flagged hours in the last 14 days.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {laborFlags.map((f, i) => (
                  <li key={`${f.kind}-${f.projectId}-${f.workerName}-${i}`}>
                    <Link href={`/erp/projects/${f.projectId}`} className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-900">{f.workerName}</p>
                        <p className="truncate text-xs text-gray-400">{f.jobTitle}</p>
                      </div>
                      <div className="ml-2 shrink-0 text-right">
                        <p className="text-xs font-semibold text-red-600">{f.hours.toFixed(2)}h</p>
                        <p className="text-[11px] text-gray-400">{f.label}</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Activity feed */}
        <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">Recent project activity</h2>
            <Link href="/erp/projects" className="text-xs text-pink-600 hover:underline">See all</Link>
          </div>
          <ul className="divide-y divide-gray-100">
            {recentProjects.map((p) => {
              const activity = describeProjectActivity(p);
              return (
                <li key={p.id}>
                  <Link href={`/erp/projects/${p.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition">
                    <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${activity.dot}`} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">{p.jobTitle}</p>
                      <p className="text-xs text-gray-400">
                        {projectSegmentLabel(p.segment)}{p.supervisor ? ` · ${p.supervisor}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs text-gray-500">{activity.text}</p>
                      <p className="text-[11px] text-gray-400">{timeAgo(p.updatedAt)}</p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return (
      <div className="rounded-lg border border-red-300 bg-red-50 p-6 text-sm text-red-800">
        <h1 className="text-lg font-semibold text-red-900">ERP database unavailable</h1>
        <p className="mt-2 text-red-700">
          The dashboard could not reach PostgreSQL. Set <code className="text-red-900">DATABASE_URL</code> to a hosted database, then redeploy.
        </p>
        <p className="mt-2 text-xs text-red-600">Details: {msg}</p>
      </div>
    );
  }
}
