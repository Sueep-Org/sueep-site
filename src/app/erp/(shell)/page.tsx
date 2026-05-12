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
      <div className="space-y-4 rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-900">
        <h1 className="text-lg font-semibold text-red-900">ERP database unavailable</h1>
        <p className="text-red-800">
          The dashboard could not reach PostgreSQL. On Vercel, set <code className="text-red-700">DATABASE_URL</code> to a
          hosted database (e.g. Neon), run <code className="text-red-700">prisma migrate deploy</code> on deploy (already
          in <code className="text-red-700">npm run build</code>), then redeploy.
        </p>
        <p className="text-xs text-red-700/90">Details: {msg}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-600">Internal ERP — projects, labor, and cost baselines.</p>
      </div>

      <HubSpotSyncPanel id="hubspot-sync" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Active projects", value: activeCount },
          { label: "All projects", value: projectCount },
          { label: "Labor entries", value: laborCount },
          { label: "Commercial / Residential", value: `${commercialCount} / ${residentialCount}` },
        ].map((card) => (
          <div key={card.label} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">{card.label}</p>
            <p className="mt-2 text-2xl font-bold text-zinc-900">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-zinc-600">
        <p className="font-medium text-zinc-800">Next steps for the product</p>
        <ul className="mt-2 list-inside list-disc space-y-1 text-xs">
          <li>Add invoicing line items, materials receipts, and Gantt-style milestones.</li>
          <li>Production uses PostgreSQL via <code className="text-zinc-600">DATABASE_URL</code> (e.g. Neon).</li>
          <li>Point DNS <code className="text-pink-600">app.sueep.com</code> at this deployment — middleware rewrites to{" "}
            <code className="text-zinc-600">/erp</code>.</li>
        </ul>
        <div className="mt-4 flex flex-wrap gap-4">
          <Link href="/erp/schedule" className="text-sm font-medium text-pink-600 hover:underline">
            Schedule (calendar & Gantt) →
          </Link>
          <Link href="/erp/projects" className="text-sm font-medium text-pink-600 hover:underline">
            Go to projects →
          </Link>
        </div>
      </div>
    </div>
  );
}
