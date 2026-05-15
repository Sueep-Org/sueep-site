import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { HubSpotSyncPanel } from "./HubSpotSyncPanel";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function ErpDashboardPage() {
  let projectCount: number;
  let commercialCount: number;
  let residentialCount: number;
  let laborCount: number;
  let activeCount: number;

  try {
    [projectCount, commercialCount, residentialCount, laborCount, activeCount] = await Promise.all([
      prisma.project.count(),
      prisma.project.count({ where: { segment: "COMMERCIAL" } }),
      prisma.project.count({ where: { segment: "RESIDENTIAL" } }),
      prisma.laborEntry.count(),
      prisma.project.count({ where: { status: "ACTIVE" } }),
    ]);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return (
      <div className="space-y-4 rounded-lg border border-red-300 bg-red-50 p-6 text-sm text-red-800">
        <h1 className="text-lg font-semibold text-red-900">ERP database unavailable</h1>
        <p className="text-red-700">
          The dashboard could not reach PostgreSQL. On Vercel, set <code className="text-red-900">DATABASE_URL</code> to a
          hosted database (e.g. Neon), run <code className="text-red-900">prisma migrate deploy</code> on deploy (already
          in <code className="text-red-900">npm run build</code>), then redeploy.
        </p>
        <p className="text-xs text-red-600">Details: {msg}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-600">Internal ERP — projects, labor, and cost baselines.</p>
      </div>

      <HubSpotSyncPanel id="hubspot-sync" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "WIP projects", value: activeCount },
          { label: "All projects", value: projectCount },
          { label: "Labor entries", value: laborCount },
          { label: "Commercial / Residential", value: `${commercialCount} / ${residentialCount}` },
        ].map((card) => (
          <div key={card.label} className="rounded-lg border border-gray-300 bg-gray-50 p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">{card.label}</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <Link href="/erp/schedule" className="font-medium text-pink-600 hover:underline">
          Schedule (calendar & Gantt) →
        </Link>
        <Link href="/erp/projects" className="font-medium text-pink-600 hover:underline">
          Go to projects →
        </Link>
        <Link href="/erp/employees" className="font-medium text-pink-600 hover:underline">
          Employees →
        </Link>
      </div>
    </div>
  );
}