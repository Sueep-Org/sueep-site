import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { parseHubSpotPipelineStageMap } from "@/lib/hubspot/pipelineStages";
import { deriveProjectLifecycle } from "@/lib/erp/projectLifecycle";
import { ProjectsTabs } from "./ProjectsTabs";
import { HubSpotSyncButton } from "./HubSpotSyncButton";

export const dynamic = "force-dynamic";

export default async function ErpProjectsPage() {
  const cfg = parseHubSpotPipelineStageMap();

  const projects = await prisma.project.findMany({
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
      percentInvoiced: p.percentInvoiced,
      billingStatus: p.billingStatus ?? null,
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
      hubspotPipelineId: p.hubspotPipelineId ?? null,
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-pink-600">Projects</h1>
          <p className="mt-1 text-sm text-gray-600">Simple view: core info on top, details on expand.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/erp/projects/new"
            className="rounded-md bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-700"
          >
            New project
          </Link>
          <HubSpotSyncButton />
        </div>
      </div>

      <hr className="border-pink-200" />


      {rows.length === 0 ? (
        <div className="rounded-lg border border-gray-300 bg-gray-50 px-4 py-8 text-center text-gray-600">
          No projects yet.{" "}
          <Link href="/erp/projects/new" className="text-pink-600 hover:underline">
            Create one
          </Link>{" "}
          or import from HubSpot under{" "}
          <Link href="/erp/hubspot" className="text-pink-600 hover:underline">
            HubSpot sync
          </Link>
          .
        </div>
      ) : (
        <ProjectsTabs
          rows={rows}
          postConstructionPipelineId={cfg?.postConstruction.pipelineId ?? null}
          janitorialPipelineId={cfg?.janitorial.pipelineId ?? null}
          residentialPipelineId={cfg?.residential.pipelineId ?? null}
        />
      )}
    </div>
  );
}
