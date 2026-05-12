import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { parseHubSpotPipelineStageMap } from "@/lib/hubspot/pipelineStages";
import { deriveProjectLifecycle } from "@/lib/erp/projectLifecycle";
import { ProjectsExpandableTable } from "./ProjectsExpandableTable";

export const dynamic = "force-dynamic";

export default async function ErpProjectsPage() {
  const cfg = parseHubSpotPipelineStageMap();
  const janitorialPipelineId = cfg?.janitorial.pipelineId?.trim() || null;
  const projects = await prisma.project.findMany({
    ...(janitorialPipelineId ? { where: { NOT: { hubspotPipelineId: janitorialPipelineId } } } : {}),
    orderBy: [{ projectDate: "desc" }, { updatedAt: "desc" }],
    take: 300,
    include: {
      laborEntries: {
        select: {
          workerName: true,
          hours: true,
          hourlyRateCents: true,
          employee: { select: { firstName: true, lastName: true } },
        },
      },
      materialEntries: { select: { category: true, costCents: true } },
      distanceEntries: { select: { miles: true } },
    },
  });
  const lifecycleRank = (p: (typeof projects)[number]) => {
    const lifecycle = deriveProjectLifecycle(p.status, p.projectDate ? p.projectDate.toISOString() : null);
    if (lifecycle === "ACTIVE") return 0;
    if (lifecycle === "UPCOMING") return 1;
    return 2;
  };

  projects.sort((a, b) => {
    const rankDelta = lifecycleRank(a) - lifecycleRank(b);
    if (rankDelta !== 0) return rankDelta;
    return a.projectDate?.getTime() === b.projectDate?.getTime()
      ? b.updatedAt.getTime() - a.updatedAt.getTime()
      : (b.projectDate?.getTime() ?? 0) - (a.projectDate?.getTime() ?? 0);
  });

  const rows = projects.map((p) => {
    const employees = [
      ...new Set(
        p.laborEntries
          .map((e) =>
            e.employee ? `${e.employee.firstName} ${e.employee.lastName}`.trim() : e.workerName.trim(),
          )
          .filter(Boolean),
      ),
    ];
    const totalHours = p.laborEntries.reduce((s, e) => s + e.hours, 0);
    const laborCents = p.laborEntries.reduce((s, e) => s + Math.round(e.hours * e.hourlyRateCents), 0);
    const materialCents = p.materialEntries.reduce((s, e) => s + e.costCents, 0);
    const paintCents = p.materialEntries.filter((e) => e.category === "PAINT").reduce((s, e) => s + e.costCents, 0);
    const cleaningCents = p.materialEntries
      .filter((e) => e.category === "CLEANING_PRODUCTS")
      .reduce((s, e) => s + e.costCents, 0);
    const miles = p.distanceEntries.reduce((s, e) => s + e.miles, 0);
    const actualLaborCents = p.laborEntries.length > 0 ? laborCents : (p.actualLaborCents ?? 0);
    const actualMaterialCents = p.materialEntries.length > 0 ? materialCents : (p.actualMaterialCents ?? 0);
    const actualHours = totalHours > 0 ? totalHours : (p.actualHours ?? 0);
    return {
      id: p.id,
      jobTitle: p.jobTitle,
      description: p.description,
      segment: p.segment,
      status: p.status,
      projectDate: p.projectDate ? p.projectDate.toISOString() : null,
      supervisor: p.supervisor,
      percentDone: p.percentDone,
      contractValueCents: p.contractValueCents,
      employees,
      totalHours,
      laborCents,
      materialCents,
      estMaterialCents: p.estMaterialCents ?? null,
      actualMaterialCents,
      estLaborCents: p.estLaborCents ?? null,
      actualLaborCents,
      estHours: p.estHours ?? null,
      actualHours,
      cleaningCents,
      paintCents,
      miles,
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Projects</h1>
          <p className="mt-1 text-sm text-zinc-400">Simple view: core info on top, details on expand.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-800 bg-emerald-950/40 px-2.5 py-1 text-xs text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            WIP
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-purple-800 bg-purple-950/40 px-2.5 py-1 text-xs text-purple-300">
            <span className="h-1.5 w-1.5 rounded-full bg-purple-400" />
            Upcoming
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-zinc-600 bg-zinc-800/60 px-2.5 py-1 text-xs text-zinc-300">
            <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
            Completed
          </span>
          <Link
            href="/erp/projects/new"
            className="ml-2 rounded-md bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-500"
          >
            New project
          </Link>
        </div>
      </div>

      <div>
        {rows.length === 0 ? (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-8 text-center text-zinc-500">
            No projects yet.{" "}
            <Link href="/erp/projects/new" className="text-pink-400 hover:underline">
              Create one
            </Link>{" "}
            or import from HubSpot under{" "}
            <Link href="/erp/hubspot" className="text-pink-400 hover:underline">
              HubSpot sync
            </Link>
            .
          </div>
        ) : (
          <ProjectsExpandableTable rows={rows} />
        )}
      </div>
    </div>
  );
}