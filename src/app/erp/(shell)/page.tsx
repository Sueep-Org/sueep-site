import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { deriveProjectLifecycle } from "@/lib/erp/projectLifecycle";
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

const SEGMENT_DOT: Record<string, string> = {
  JANITORIAL_TURNOVER_REQUESTS: "bg-teal-400",
  JANITORIAL_GENERAL_WORK_REQUEST: "bg-teal-400",
  COMMERCIAL_CLEANING: "bg-teal-400",
  POST_CONSTRUCTION: "bg-amber-400",
  RESIDENTIAL: "bg-blue-400",
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

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Projects needing estimates */}
            <div className="rounded-lg border border-gray-200 bg-white">
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Projects missing estimates</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Need est. labor or material</p>
                </div>
                <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700">{missingEstimates.length}</span>
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
            <div className="rounded-lg border border-gray-200 bg-white">
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
      const [activeProjects, recentLabor] = await Promise.all([
        prisma.project.findMany({
          where: { NOT: { status: { in: ["COMPLETED", "ARCHIVED", "CANCELLED"] } } },
          select: { id: true, jobTitle: true, status: true, projectDate: true, supervisor: true, segment: true },
          orderBy: [{ projectDate: "asc" }, { updatedAt: "desc" }],
          take: 20,
        }),
        prisma.laborEntry.findMany({
          orderBy: { workDate: "desc" },
          take: 12,
          select: {
            id: true, workDate: true, workerName: true, hours: true, taskDescription: true,
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

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Active projects */}
            <div className="rounded-lg border border-gray-200 bg-white">
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                <h2 className="text-sm font-semibold text-gray-900">Active projects</h2>
                <Link href="/erp/projects" className="text-xs text-pink-600 hover:underline">See all</Link>
              </div>
              {activeProjects.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-gray-400">No active projects.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {activeProjects.map((p) => {
                    const lc = deriveProjectLifecycle(p.status, p.projectDate?.toISOString() ?? null);
                    return (
                      <li key={p.id}>
                        <Link href={`/erp/projects/${p.id}`} className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-gray-900">{p.jobTitle}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{p.supervisor || "Unassigned"}</p>
                          </div>
                          <div className="ml-3 shrink-0 text-right">
                            <span className={`text-xs font-semibold ${lc === "ACTIVE" ? "text-emerald-600" : "text-purple-600"}`}>
                              {lc === "ACTIVE" ? "WIP" : "Upcoming"}
                            </span>
                            {p.projectDate && (
                              <p className="text-[11px] text-gray-400 mt-0.5">
                                {new Date(p.projectDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                              </p>
                            )}
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Recent labor */}
            <div className="rounded-lg border border-gray-200 bg-white">
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                <h2 className="text-sm font-semibold text-gray-900">Recent labor entries</h2>
              </div>
              {recentLabor.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-gray-400">No labor logged yet.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {recentLabor.map((e) => (
                    <li key={e.id}>
                      <Link href={`/erp/projects/${e.project.id}`} className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-gray-900">{e.workerName}</p>
                          <p className="truncate text-xs text-gray-400">{e.project.jobTitle}</p>
                        </div>
                        <div className="ml-3 shrink-0 text-right">
                          <p className="text-xs font-medium text-gray-700">{e.hours}h</p>
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
          </div>
        </div>
      );
    }

    // ── Admin / Project Manager ────────────────────────────────────────────
    const [allProjects, employees, candidates, contractors, recentProjects, recentLabor] = await Promise.all([
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
          contractValueCents: true,
        },
        orderBy: { updatedAt: "desc" },
        take: 15,
      }),
      prisma.laborEntry.findMany({
        orderBy: { workDate: "desc" },
        take: 8,
        select: {
          id: true, workDate: true, workerName: true, hours: true,
          project: { select: { id: true, jobTitle: true } },
        },
      }),
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

        {/* KPI strip — all white, only alert states get color */}
        <div className="grid grid-cols-3 gap-3 lg:grid-cols-6">
          {[
            { label: "WIP Projects", value: wipCount, sub: showFinancials ? centsToDollarsShort(wipValue) : null, href: "/erp/projects", card: "border-emerald-200 bg-emerald-50", val: "text-emerald-700" },
            { label: "Upcoming", value: upcomingCount, sub: null, href: "/erp/projects", card: "border-purple-200 bg-purple-50", val: "text-purple-700" },
            { label: "Active Employees", value: activeEmployees.length, sub: null, href: "/erp/employees", card: "border-blue-200 bg-blue-50", val: "text-blue-700" },
            { label: "Non-Compliant", value: nonCompliant.length, sub: null, href: "/erp/employees", card: nonCompliant.length > 0 ? "border-red-200 bg-red-50" : "border-gray-200 bg-gray-50", val: nonCompliant.length > 0 ? "text-red-600" : "text-gray-700" },
            { label: "Pending Candidates", value: pendingCandidates, sub: null, href: "/erp/candidates", card: pendingCandidates > 0 ? "border-orange-200 bg-orange-50" : "border-gray-200 bg-gray-50", val: pendingCandidates > 0 ? "text-orange-600" : "text-gray-700" },
            { label: "Active Contractors", value: contractors, sub: null, href: "/erp/contractors", card: "border-gray-200 bg-gray-50", val: "text-gray-700" },
          ].map((k) => (
            <Link
              key={k.label}
              href={k.href}
              className={`rounded-lg border px-3 py-2.5 transition hover:shadow-sm ${k.card}`}
            >
              <p className="text-[10px] uppercase tracking-wide text-gray-500">{k.label}</p>
              <p className={`mt-1 text-xl font-bold ${k.val}`}>{k.value}</p>
              {k.sub && <p className={`mt-0.5 text-[11px] ${k.val} opacity-80`}>{k.sub}</p>}
            </Link>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-5">
          {/* Activity feed */}
          <div className="lg:col-span-3 rounded-lg border border-gray-200 bg-white">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Recent project activity</h2>
                <p className="text-xs text-gray-400 mt-0.5">All types · sorted by last updated</p>
              </div>
              <Link href="/erp/projects" className="text-xs text-pink-600 hover:underline">See all</Link>
            </div>
            <ul className="divide-y divide-gray-100">
              {recentProjects.map((p) => {
                const lc = deriveProjectLifecycle(p.status, p.projectDate?.toISOString() ?? null);
                const dotColor = lc === "ACTIVE" ? "bg-emerald-400" : lc === "UPCOMING" ? "bg-gray-300" : "bg-gray-200";
                const lcLabel = lc === "ACTIVE" ? "WIP" : lc === "UPCOMING" ? "Upcoming" : "Done";
                return (
                  <li key={p.id}>
                    <Link href={`/erp/projects/${p.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition">
                      <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${dotColor}`} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-900">{p.jobTitle}</p>
                        <p className="text-xs text-gray-400">
                          {projectSegmentLabel(p.segment)}{p.supervisor ? ` · ${p.supervisor}` : ""}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-xs text-gray-500">{lcLabel}</p>
                        <p className="text-[11px] text-gray-400">{timeAgo(p.updatedAt)}</p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Right column */}
          <div className="lg:col-span-2 space-y-4">
            {/* Recent labor */}
            <div className="rounded-lg border border-gray-200 bg-white">
              <div className="border-b border-gray-100 px-4 py-3">
                <h2 className="text-sm font-semibold text-gray-900">Recent labor logged</h2>
              </div>
              {recentLabor.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-gray-400">No labor entries yet.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {recentLabor.map((e) => (
                    <li key={e.id}>
                      <Link href={`/erp/projects/${e.project.id}`} className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-gray-900">{e.workerName}</p>
                          <p className="truncate text-xs text-gray-400">{e.project.jobTitle}</p>
                        </div>
                        <div className="ml-2 shrink-0 text-right">
                          <p className="text-xs font-semibold text-gray-700">{e.hours}h</p>
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

            {/* Compliance snapshot */}
            <div className="rounded-lg border border-gray-200 bg-white">
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                <h2 className="text-sm font-semibold text-gray-900">Workforce</h2>
                <Link href="/erp/employees" className="text-xs text-pink-600 hover:underline">View all</Link>
              </div>
              <div className="divide-y divide-gray-100">
                <div className="flex items-center justify-between px-4 py-2.5">
                  <p className="text-sm text-gray-600">Active employees</p>
                  <span className="text-sm font-semibold text-gray-900">{activeEmployees.length}</span>
                </div>
                <div className="flex items-center justify-between px-4 py-2.5">
                  <p className="text-sm text-gray-600">Non-compliant</p>
                  <Link
                    href="/erp/employees"
                    className={`text-sm font-semibold ${nonCompliant.length > 0 ? "text-red-600 hover:underline" : "text-gray-400"}`}
                  >
                    {nonCompliant.length}
                  </Link>
                </div>
                <div className="flex items-center justify-between px-4 py-2.5">
                  <p className="text-sm text-gray-600">Active contractors</p>
                  <span className="text-sm font-semibold text-gray-900">{contractors}</span>
                </div>
                {pendingCandidates > 0 && (
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <p className="text-sm text-gray-600">Pending candidates</p>
                    <Link href="/erp/candidates" className="text-sm font-semibold text-pink-600 hover:underline">
                      {pendingCandidates}
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
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
