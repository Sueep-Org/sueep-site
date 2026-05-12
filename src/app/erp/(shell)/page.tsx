import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { HubSpotSyncPanel } from "./HubSpotSyncPanel";
import { DashboardInsights } from "./DashboardInsights";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function ErpDashboardPage() {
  let projectCount: number;
  let commercialCount: number;
  let residentialCount: number;
  let laborCount: number;
  let activeCount: number;
  let laborLast7Days: number;
  let materialsLast7Days: number;
  let avgCompletionPercent = 0;
  let statusRows: { label: string; count: number }[] = [];
  let recentProjects: {
    id: string;
    jobTitle: string;
    status: string;
    segment: string;
    percentDone: number;
    supervisor: string | null;
    updatedAtIso: string;
  }[] = [];

  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [projectStats, statusCounts, recentProjectRows, completionAggregate] = await Promise.all([
      Promise.all([
      prisma.project.count(),
      prisma.project.count({ where: { segment: "COMMERCIAL" } }),
      prisma.project.count({ where: { segment: "RESIDENTIAL" } }),
      prisma.laborEntry.count(),
      prisma.project.count({ where: { status: "ACTIVE" } }),
        prisma.laborEntry.count({ where: { workDate: { gte: sevenDaysAgo } } }),
        prisma.materialEntry.count({ where: { usedOn: { gte: sevenDaysAgo } } }),
      ]),
      prisma.project.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
      prisma.project.findMany({
        orderBy: [{ updatedAt: "desc" }],
        take: 8,
        select: {
          id: true,
          jobTitle: true,
          status: true,
          segment: true,
          percentDone: true,
          supervisor: true,
          updatedAt: true,
        },
      }),
      prisma.project.aggregate({
        _avg: { percentDone: true },
      }),
    ]);

    [
      projectCount,
      commercialCount,
      residentialCount,
      laborCount,
      activeCount,
      laborLast7Days,
      materialsLast7Days,
    ] = projectStats;

    avgCompletionPercent = completionAggregate._avg.percentDone ?? 0;
    statusRows = statusCounts
      .map((row) => ({ label: row.status, count: row._count._all }))
      .sort((a, b) => b.count - a.count);
    recentProjects = recentProjectRows.map((p) => ({
      id: p.id,
      jobTitle: p.jobTitle,
      status: p.status,
      segment: p.segment,
      percentDone: p.percentDone ?? 0,
      supervisor: p.supervisor,
      updatedAtIso: p.updatedAt.toISOString(),
    }));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return (
      <div className="space-y-4 rounded-lg border border-red-900/60 bg-red-950/40 p-6 text-sm text-red-100">
        <h1 className="text-lg font-semibold text-white">ERP database unavailable</h1>
        <p className="text-red-200/90">
          The dashboard could not reach PostgreSQL. On Vercel, set <code className="text-red-50">DATABASE_URL</code> to a
          hosted database (e.g. Neon), run <code className="text-red-50">prisma migrate deploy</code> on deploy (already
          in <code className="text-red-50">npm run build</code>), then redeploy.
        </p>
        <p className="text-xs text-red-300/80">Details: {msg}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-400">Internal ERP — projects, labor, and cost baselines.</p>
      </div>

      <HubSpotSyncPanel id="hubspot-sync" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "WIP projects", value: activeCount },
          { label: "All projects", value: projectCount },
          { label: "Labor entries", value: laborCount },
          { label: "Commercial / Residential", value: `${commercialCount} / ${residentialCount}` },
        ].map((card) => (
          <div key={card.label} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">{card.label}</p>
            <p className="mt-2 text-2xl font-bold text-white">{card.value}</p>
          </div>
        ))}
      </div>

      <DashboardInsights
        statusRows={statusRows}
        segmentRows={[
          { label: "Commercial", count: commercialCount },
          { label: "Residential", count: residentialCount },
        ]}
        projects={recentProjects}
        avgCompletionPercent={avgCompletionPercent}
        laborLast7Days={laborLast7Days}
        materialsLast7Days={materialsLast7Days}
      />

      <div className="flex flex-wrap gap-4 text-sm">
        <Link href="/erp/schedule" className="font-medium text-pink-400 hover:underline">
          Schedule (calendar & Gantt) →
        </Link>
        <Link href="/erp/projects" className="font-medium text-pink-400 hover:underline">
          Go to projects →
        </Link>
        <Link href="/erp/employees" className="font-medium text-pink-400 hover:underline">
          Employees →
        </Link>
      </div>
    </div>
  );
}