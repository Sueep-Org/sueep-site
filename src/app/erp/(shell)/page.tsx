import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { deriveProjectLifecycle } from "@/lib/erp/projectLifecycle";
import { evaluateEmployeeCompliance } from "@/lib/erp/employees";
import { parseHubSpotPipelineStageMap } from "@/lib/hubspot/pipelineStages";

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

export default async function ErpDashboardPage() {
  try {
    const cfg = parseHubSpotPipelineStageMap();
    const janitorialSegments = cfg?.janitorial.pipelineId
      ? ["JANITORIAL_TURNOVER_REQUESTS"]
      : ["JANITORIAL_TURNOVER_REQUESTS", "COMMERCIAL_CLEANING"];
    const janitorialProjectWhere = {
      OR: [
        { segment: { in: janitorialSegments } },
        ...(cfg?.janitorial.pipelineId ? [{ hubspotPipelineId: cfg.janitorial.pipelineId }] : []),
      ],
    };

    const [projects, employees, candidates, contractors] = await Promise.all([
      prisma.project.findMany({
        where: janitorialProjectWhere,
        orderBy: [{ projectDate: "asc" }, { updatedAt: "desc" }],
        take: 300,
        select: {
          id: true,
          jobTitle: true,
          status: true,
          segment: true,
          projectDate: true,
          supervisor: true,
          contractValueCents: true,
          hubspotPipelineId: true,
        },
      }),
      prisma.employee.findMany({
        select: {
          status: true,
          requiredDocuments: true,
          documents: { select: { documentType: true, expiresAt: true } },
        },
      }),
      prisma.candidateApplication.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
      prisma.contractor.count({ where: { status: "ACTIVE" } }),
    ]);

    // — Project lifecycle bucketing —
    const now = new Date();
    const wip: typeof projects = [];
    const upcoming: typeof projects = [];
    const completed: typeof projects = [];

    for (const p of projects) {
      const lc = deriveProjectLifecycle(p.status, p.projectDate?.toISOString() ?? null);
      if (lc === "ACTIVE") wip.push(p);
      else if (lc === "UPCOMING") upcoming.push(p);
      else completed.push(p);
    }

    // — Employee compliance —
    const activeEmployees = employees.filter((e) => e.status === "ACTIVE");
    const nonCompliant = activeEmployees.filter((e) => {
      const req = parseRequiredDocuments(e.requiredDocuments);
      return evaluateEmployeeCompliance(e.status, req, e.documents) === "NON_COMPLIANT";
    });
    const notConfigured = activeEmployees.filter((e) => {
      const req = parseRequiredDocuments(e.requiredDocuments);
      return evaluateEmployeeCompliance(e.status, req, e.documents) === "NOT_CONFIGURED";
    });

    // — Candidates —
    const candidateMap = Object.fromEntries(candidates.map((c) => [c.status, c._count._all]));
    const pendingCandidates = (candidateMap.APPLIED ?? 0) + (candidateMap.INTERVIEWING ?? 0);

    // — Contract value in WIP —
    const wipValue = wip.reduce((s, p) => s + (p.contractValueCents ?? 0), 0);

    // — Upcoming in next 30 days —
    const in30 = new Date(now);
    in30.setDate(in30.getDate() + 30);
    const soonProjects = upcoming
      .filter((p) => p.projectDate && new Date(p.projectDate) <= in30)
      .sort((a, b) => (a.projectDate?.getTime() ?? 0) - (b.projectDate?.getTime() ?? 0))
      .slice(0, 5);

    // — Recent WIP (first 8) —
    const wipDisplay = wip.slice(0, 8);

    const kpis = [
      { label: "Janitorial WIP", value: wip.length, href: "/erp/projects", color: "emerald" },
      { label: "Janitorial Upcoming", value: upcoming.length, href: "/erp/projects", color: "purple" },
      { label: "Active Employees", value: activeEmployees.length, href: "/erp/employees", color: "blue" },
      { label: "Non-Compliant", value: nonCompliant.length, href: "/erp/employees?compliance=NON_COMPLIANT", color: nonCompliant.length > 0 ? "red" : "gray" },
      { label: "Pending Candidates", value: pendingCandidates, href: "/erp/candidates", color: "orange" },
      { label: "Active Contractors", value: contractors, href: "/erp/contractors", color: "gray" },
    ];

    const kpiColor: Record<string, { card: string; value: string; badge: string }> = {
      emerald: { card: "border-emerald-200 bg-emerald-50", value: "text-emerald-700", badge: "bg-emerald-100 text-emerald-700" },
      purple:  { card: "border-purple-200 bg-purple-50",   value: "text-purple-700",  badge: "bg-purple-100 text-purple-700" },
      blue:    { card: "border-blue-200 bg-blue-50",        value: "text-blue-700",    badge: "bg-blue-100 text-blue-700" },
      red:     { card: "border-red-200 bg-red-50",          value: "text-red-700",     badge: "bg-red-100 text-red-700" },
      orange:  { card: "border-orange-200 bg-orange-50",    value: "text-orange-700",  badge: "bg-orange-100 text-orange-700" },
      gray:    { card: "border-gray-200 bg-gray-50",        value: "text-gray-800",    badge: "bg-gray-100 text-gray-600" },
    };


    return (
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Janitorial PM Dashboard</h1>
            <p className="mt-1 text-sm text-gray-500">
              ERP-backed janitorial projects only - {now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Link href="/janitorial-turnover" className="rounded-md bg-pink-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-pink-700">
              + New janitorial request
            </Link>
            <Link href="/erp/schedule" className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
              Schedule
            </Link>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {kpis.map((k) => {
            const cls = kpiColor[k.color];
            return (
              <Link
                key={k.label}
                href={k.href}
                className={`rounded-lg border p-4 transition hover:shadow-sm ${cls.card}`}
              >
                <p className="text-[11px] uppercase tracking-wide text-gray-500">{k.label}</p>
                <p className={`mt-2 text-3xl font-bold ${cls.value}`}>{k.value}</p>
              </Link>
            );
          })}
        </div>

        {/* WIP value banner */}
        {wip.length > 0 && (
          <div className="rounded-lg border border-pink-200 bg-pink-50 px-5 py-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-pink-800 font-medium">
              <span className="text-2xl font-bold text-pink-700">{centsToDollarsShort(wipValue)}</span>
              <span className="ml-2 text-pink-600">total contract value across {wip.length} janitorial WIP project{wip.length !== 1 ? "s" : ""}</span>
            </p>
            <Link href="/erp/projects" className="text-xs font-medium text-pink-700 hover:underline">View all →</Link>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          {/* WIP Projects */}
          <div className="rounded-lg border border-gray-200 bg-white">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-gray-900">Janitorial WIP Projects</h2>
              <Link href="/erp/projects" className="text-xs text-pink-600 hover:underline">See all</Link>
            </div>
            {wipDisplay.length === 0 ? (
              <p className="px-4 py-6 text-sm text-gray-400 text-center">No active janitorial projects.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {wipDisplay.map((p) => (
                  <li key={p.id}>
                    <Link href={`/erp/projects/${p.id}`} className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{p.jobTitle}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{p.supervisor || "Unassigned"}</p>
                      </div>
                      <div className="ml-3 shrink-0 text-right">
                        <p className="text-xs font-medium text-emerald-600">WIP</p>
                        {p.projectDate && (
                          <p className="text-[11px] text-gray-400 mt-0.5">
                            {new Date(p.projectDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </p>
                        )}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Right column */}
          <div className="space-y-6">
            {/* Upcoming soon */}
            <div className="rounded-lg border border-gray-200 bg-white">
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                <h2 className="text-sm font-semibold text-gray-900">Janitorial starting within 30 days</h2>
                <Link href="/erp/projects" className="text-xs text-pink-600 hover:underline">See all</Link>
              </div>
              {soonProjects.length === 0 ? (
                <p className="px-4 py-6 text-sm text-gray-400 text-center">No janitorial projects starting soon.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {soonProjects.map((p) => (
                    <li key={p.id}>
                      <Link href={`/erp/projects/${p.id}`} className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition">
                        <p className="text-sm font-medium text-gray-900 truncate">{p.jobTitle}</p>
                        <p className="ml-3 shrink-0 text-xs font-medium text-purple-600">
                          {p.projectDate
                            ? new Date(p.projectDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                            : "—"}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Compliance alerts */}
            <div className="rounded-lg border border-gray-200 bg-white">
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                <h2 className="text-sm font-semibold text-gray-900">Employee compliance</h2>
                <Link href="/erp/employees" className="text-xs text-pink-600 hover:underline">View all</Link>
              </div>
              <div className="divide-y divide-gray-100">
                <div className="flex items-center justify-between px-4 py-3">
                  <p className="text-sm text-gray-700">Active employees</p>
                  <span className="text-sm font-semibold text-gray-900">{activeEmployees.length}</span>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <p className="text-sm text-gray-700">Non-compliant</p>
                  <Link
                    href="/erp/employees?compliance=NON_COMPLIANT"
                    className={`text-sm font-semibold ${nonCompliant.length > 0 ? "text-red-600 hover:underline" : "text-gray-400"}`}
                  >
                    {nonCompliant.length}
                  </Link>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <p className="text-sm text-gray-700">Not configured</p>
                  <Link
                    href="/erp/employees?compliance=NOT_CONFIGURED"
                    className="text-sm font-semibold text-gray-500 hover:underline"
                  >
                    {notConfigured.length}
                  </Link>
                </div>
                {pendingCandidates > 0 && (
                  <div className="flex items-center justify-between px-4 py-3">
                    <p className="text-sm text-gray-700">Pending candidates</p>
                    <Link href="/erp/candidates" className="text-sm font-semibold text-orange-600 hover:underline">
                      {pendingCandidates}
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Quick links */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-2">Quick links</p>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            {[
              { label: "Projects", href: "/erp/projects" },
              { label: "Schedule", href: "/erp/schedule" },
              { label: "Employees", href: "/erp/employees" },
              { label: "Candidates", href: "/erp/candidates" },
              { label: "Contractors", href: "/erp/contractors" },
              { label: "Turnover requests", href: "/erp/turnover-requests" },
              { label: "HubSpot sync", href: "/erp/hubspot" },
            ].map((l) => (
              <Link key={l.href} href={l.href} className="text-pink-600 hover:underline">
                {l.label}
              </Link>
            ))}
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
          The dashboard could not reach PostgreSQL. On Vercel, set <code className="text-red-900">DATABASE_URL</code> to a hosted database (e.g. Neon), run{" "}
          <code className="text-red-900">prisma migrate deploy</code> on deploy, then redeploy.
        </p>
        <p className="mt-2 text-xs text-red-600">Details: {msg}</p>
      </div>
    );
  }
}
