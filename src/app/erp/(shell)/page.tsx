import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { deriveProjectLifecycle, hasActiveChangeOrder } from "@/lib/erp/projectLifecycle";
import { computeProjectActualsWithChangeOrders } from "@/lib/erp/projectMargin";
import { utcDateKey, todayEasternAsUtcMidnight } from "@/lib/erp/dates";
import { evaluateEmployeeCompliance } from "@/lib/erp/employees";
import { projectSegmentLabel } from "@/lib/erp/projectSegments";
import { getErpAuth, canSeeFinancials } from "@/lib/erpAuth";
import { getSupervisorProjectScope } from "@/lib/erp/supervisorScope";
import { turnoverTotalHoursBudget, turnoverImpliedMarginPct, turnoverMarginSeverity, type TurnoverMarginSeverity } from "@/lib/erp/turnoverHoursBudget";

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

/** Same as centsToDollarsShort but puts the minus sign before the $, not after it. */
function signedDollarsShort(cents: number): string {
  return cents < 0 ? `-${centsToDollarsShort(-cents)}` : centsToDollarsShort(cents);
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
  changeOrders: { status: string }[];
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
  if (deriveProjectLifecycle(status, p.projectDate?.toISOString() ?? null, hasActiveChangeOrder(p.changeOrders)) === "UPCOMING") {
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
      const scope = await getSupervisorProjectScope(auth!.uid, auth!.email);

      const todayStart = todayEasternAsUtcMidnight();
      const todayEnd = new Date(todayStart);
      todayEnd.setUTCHours(23, 59, 59, 999);

      const [myProjects, openIncidents] = await Promise.all([
        prisma.project.findMany({
          where: {
            ...(scope.where ?? {}),
            NOT: { status: { in: ["COMPLETED", "ARCHIVED"] } },
          },
          select: {
            id: true, jobTitle: true, status: true, projectDate: true, segment: true,
            turnoverRequestId: true, contractValueCents: true,
            dailySafetyChecks: {
              where: { checkDate: { gte: todayStart, lte: todayEnd } },
              include: { workers: { select: { passed: true } } },
              take: 1,
            },
          },
          orderBy: [{ projectDate: "asc" }, { updatedAt: "desc" }],
        }),
        prisma.safetyIncident.findMany({
          where: {
            status: { in: ["OPEN", "ESCALATED"] },
            ...(scope.where ? { project: scope.where } : {}),
          },
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

      // Hours-budget status for turnovers, using the same blended-rate
      // formula as the Labor tab callout, deliberately not real dollar
      // figures, so this is safe to show to supervisors.
      const turnoverProjectIds = myProjects
        .filter((p) => p.turnoverRequestId && p.contractValueCents)
        .map((p) => p.id);
      const hoursByProjectId = turnoverProjectIds.length > 0
        ? await prisma.laborEntry.groupBy({
            by: ["projectId"],
            where: { projectId: { in: turnoverProjectIds } },
            _sum: { hours: true },
          })
        : [];
      const totalHoursByProjectId = new Map(hoursByProjectId.map((h) => [h.projectId, h._sum.hours ?? 0]));
      const budgetSeverityByProjectId = new Map<string, TurnoverMarginSeverity>();
      for (const p of myProjects) {
        if (!p.turnoverRequestId || !p.contractValueCents) continue;
        const hours = totalHoursByProjectId.get(p.id) ?? 0;
        budgetSeverityByProjectId.set(p.id, turnoverMarginSeverity(turnoverImpliedMarginPct(p.contractValueCents, hours)));
      }

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
                  const severity = budgetSeverityByProjectId.get(p.id);
                  const budgetTitle = severity && severity !== "on-track" && p.contractValueCents
                    ? `${(totalHoursByProjectId.get(p.id) ?? 0).toFixed(1)} of ${turnoverTotalHoursBudget(p.contractValueCents).toFixed(1)} hr budget`
                    : undefined;
                  return (
                    <li key={p.id}>
                      <Link href={`/erp/projects/${p.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-gray-50 transition">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <p className="truncate text-sm font-medium text-gray-900">{p.jobTitle}</p>
                          {severity === "bad" && (
                            <span title={budgetTitle} className="shrink-0 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                              Over budget
                            </span>
                          )}
                          {severity === "watch" && (
                            <span title={budgetTitle} className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                              Watch hours
                            </span>
                          )}
                        </span>
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
                {scope.unlinked && (
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
    // Eastern-anchored, not naive UTC — "today" has to mean the Eastern
    // business day (same reasoning as the schedule calendar fix), not
    // whatever day UTC happens to be on, which runs ~4-5 hours ahead of
    // Eastern every evening.
    const adminTodayStart = todayEasternAsUtcMidnight();
    const adminTodayEnd = new Date(adminTodayStart);
    adminTodayEnd.setUTCHours(23, 59, 59, 999);

    const flagWindowStart = new Date(adminTodayStart);
    flagWindowStart.setUTCDate(flagWindowStart.getUTCDate() - 13);

    const [allProjects, employees, candidates, contractors, recentProjects, laborForFlags, todayDayAssignments, todayWorkerAssignments, todaySafetyChecks, openIncidentCount, escalatedIncidentCount] = await Promise.all([
      prisma.project.findMany({
        select: {
          id: true, jobTitle: true, status: true, projectDate: true, contractValueCents: true, segment: true,
          actualLaborCents: true, actualMaterialCents: true,
          laborEntries: { select: { id: true, employeeId: true, workDate: true, createdAt: true, hours: true, hourlyRateCents: true } },
          materialEntries: { select: { costCents: true } },
          contractorAssignments: { select: { costCents: true } },
          changeOrders: {
            select: {
              status: true, contractValueCents: true, estimatedCostCents: true,
              actualLaborCents: true, actualMaterialCents: true,
              materialEntries: { select: { costCents: true } },
              laborers: { select: { id: true, employeeId: true, workDate: true, createdAt: true, hours: true, hourlyRateCents: true } },
            },
          },
        },
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
          changeOrders: { select: { status: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 15,
      }),
      prisma.laborEntry.findMany({
        where: { employeeId: { not: null }, workDate: { gte: flagWindowStart, lte: adminTodayEnd } },
        select: {
          employeeId: true, workerName: true, workDate: true, hours: true,
          project: { select: { id: true, jobTitle: true } },
        },
      }),
      prisma.projectDayAssignment.findMany({
        where: { date: { gte: adminTodayStart, lte: adminTodayEnd } },
        select: { projectId: true, project: { select: { jobTitle: true } } },
      }),
      prisma.projectWorkerDayAssignment.findMany({
        where: { date: { gte: adminTodayStart, lte: adminTodayEnd } },
        select: { projectId: true, project: { select: { jobTitle: true } }, employee: { select: { firstName: true, lastName: true } } },
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
      const lc = deriveProjectLifecycle(p.status, p.projectDate?.toISOString() ?? null, hasActiveChangeOrder(p.changeOrders));
      if (lc === "ACTIVE") { wipCount++; wipValue += p.contractValueCents ?? 0; }
      else if (lc === "UPCOMING") upcomingCount++;
    }

    // Bad margins — ACTUAL cost vs. contract, computed the exact same way
    // (OT-aware labor from logs + contractor cost + rolled-up change orders)
    // as the Projects table itself, via the shared
    // computeProjectActualsWithChangeOrders — so this and the table can
    // never quietly disagree on a project's real margin again. Flags
    // anything under a 10% margin, not just negative.
    const BAD_MARGIN_THRESHOLD_PCT = 10;
    const projectActuals = await computeProjectActualsWithChangeOrders(allProjects);
    const badMarginProjects = allProjects
      .map((p) => {
        const actuals = projectActuals.get(p.id);
        if (!actuals || actuals.contractValueCents == null || actuals.contractValueCents === 0 || actuals.marginCents == null) return null;
        const marginPct = Math.round((actuals.marginCents / actuals.contractValueCents) * 100);
        if (marginPct >= BAD_MARGIN_THRESHOLD_PCT) return null;
        return { id: p.id, jobTitle: p.jobTitle, marginCents: actuals.marginCents, marginPct };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null)
      .sort((a, b) => a.marginCents - b.marginCents)
      .slice(0, 8);

    // Employee compliance
    const activeEmployees = employees.filter((e) => e.status === "ACTIVE");
    const nonCompliant = activeEmployees.filter((e) => {
      const req = parseRequiredDocuments(e.requiredDocuments);
      return evaluateEmployeeCompliance(e.status, req, e.documents) === "NON_COMPLIANT";
    });

    const candidateMap = Object.fromEntries(candidates.map((c) => [c.status, c._count._all]));
    const pendingCandidates = (candidateMap.APPLIED ?? 0) + (candidateMap.INTERVIEWING ?? 0);

    // "Where we are": which projects are actually scheduled today, company-
    // wide — a supervisor day-assignment, a planned worker day-assignment, or
    // actual labor already logged today (pulled out of laborForFlags, which
    // already spans a window including today). Not "recently touched" —
    // genuinely today, so an empty result is a real, meaningful signal
    // ("nothing's on the calendar for today") rather than just quiet data.
    type ScheduledToday = { projectId: string; jobTitle: string; loggedWorkers: Set<string>; plannedWorkers: Set<string> };
    const scheduledTodayMap = new Map<string, ScheduledToday>();
    function getOrInitScheduled(projectId: string, jobTitle: string): ScheduledToday {
      const existing = scheduledTodayMap.get(projectId);
      if (existing) return existing;
      const created: ScheduledToday = { projectId, jobTitle, loggedWorkers: new Set(), plannedWorkers: new Set() };
      scheduledTodayMap.set(projectId, created);
      return created;
    }
    for (const a of todayDayAssignments) {
      getOrInitScheduled(a.projectId, a.project.jobTitle);
    }
    for (const a of todayWorkerAssignments) {
      const entry = getOrInitScheduled(a.projectId, a.project.jobTitle);
      entry.plannedWorkers.add(`${a.employee.firstName} ${a.employee.lastName}`.trim());
    }
    for (const e of laborForFlags) {
      if (e.workDate < adminTodayStart || e.workDate > adminTodayEnd) continue;
      const entry = getOrInitScheduled(e.project.id, e.project.jobTitle);
      entry.loggedWorkers.add(e.workerName);
    }
    const scheduledToday = [...scheduledTodayMap.values()].sort((a, b) => a.jobTitle.localeCompare(b.jobTitle));

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
              <h2 className="text-sm font-semibold text-gray-900" title="Projects with a supervisor or crew scheduled, or labor already logged, today">Where we are</h2>
            </div>
            {scheduledToday.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-gray-400">
                No projects scheduled.{" "}
                <Link href="/erp/schedule" className="text-pink-600 hover:underline">Schedule projects on the calendar</Link>
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {scheduledToday.map((p) => {
                  const workers = [...p.loggedWorkers, ...[...p.plannedWorkers].filter((w) => !p.loggedWorkers.has(w))];
                  return (
                    <li key={p.projectId}>
                      <Link href={`/erp/projects/${p.projectId}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-gray-50 transition">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-gray-900">{p.jobTitle}</p>
                          <p className="truncate text-xs text-gray-400">
                            {workers.length > 0 ? workers.join(", ") : "No crew assigned yet"}
                          </p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${p.loggedWorkers.size > 0 ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                          {p.loggedWorkers.size > 0 ? "Logged" : "Planned"}
                        </span>
                      </Link>
                    </li>
                  );
                })}
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

        {/* Bad margins — financial data, so only shown to roles that can see it */}
        {showFinancials && (
          <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-3">
              <h2 className="text-sm font-semibold text-gray-900" title="Actual margin (contract minus actual labor + material, including change orders) under 10%">Bad margins</h2>
              {badMarginProjects.length > 0 && (
                <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">{badMarginProjects.length}</span>
              )}
            </div>
            {badMarginProjects.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-gray-400">No projects under a 10% margin.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {badMarginProjects.map((p) => (
                  <li key={p.id}>
                    <Link href={`/erp/projects/${p.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-gray-50 transition">
                      <p className="min-w-0 truncate text-sm font-medium text-gray-900">{p.jobTitle}</p>
                      <div className="shrink-0 text-right">
                        <p className="text-xs font-semibold text-red-600">{signedDollarsShort(p.marginCents)}</p>
                        {p.marginPct != null && <p className="text-[11px] text-gray-400">{p.marginPct}%</p>}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

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
