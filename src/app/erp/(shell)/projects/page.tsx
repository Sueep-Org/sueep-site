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
          id: true,
          workDate: true,
          workerName: true,
          role: true,
          hours: true,
          hourlyRateCents: true,
          taskDescription: true,
          qualityRating: true,
          qualityNotes: true,
          employee: { select: { firstName: true, lastName: true } },
        },
        orderBy: { workDate: "asc" },
      },
      materialEntries: {
        select: { usedOn: true, category: true, itemName: true, quantity: true, unit: true, costCents: true, notes: true },
        orderBy: { usedOn: "asc" },
      },
      distanceEntries: { select: { miles: true } },
      changeOrders: {
        select: {
          id: true,
          title: true,
          status: true,
          billingStatus: true,
          percentInvoiced: true,
          estimatedCostCents: true,
          estimatedDays: true,
          requestedBy: true,
          supervisor: true,
          description: true,
          laborers: {
            select: { id: true, name: true, role: true, workDate: true, hours: true, hourlyRateCents: true, taskDescription: true, qualityRating: true, qualityNotes: true },
            orderBy: { workDate: "asc" },
          },
        },
        orderBy: { createdAt: "desc" },
      },
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
    const laborEntries = p.laborEntries.map((e) => ({
      id: e.id,
      updatePath: `/api/erp/projects/${p.id}/labor/${e.id}`,
      date: e.workDate.toISOString(),
      role: e.role ?? null,
      name: e.employee ? `${e.employee.firstName} ${e.employee.lastName}`.trim() : e.workerName.trim(),
      hours: e.hours,
      hourlyRateCents: e.hourlyRateCents,
      description: e.taskDescription ?? null,
      qualityRating: e.qualityRating ?? null,
      qualityNotes: e.qualityNotes ?? null,
    }));
    const materialEntries = p.materialEntries.map((e) => ({
      date: e.usedOn.toISOString(),
      category: e.category,
      itemName: e.itemName,
      quantity: e.quantity ?? null,
      unit: e.unit ?? null,
      costCents: e.costCents,
      notes: e.notes ?? null,
    }));
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
      laborEntries,
      materialEntries,
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
      changeOrders: p.changeOrders.map((co) => ({
        id: co.id,
        title: co.title,
        status: co.status as "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "VOID" | "BILLING",
        billingStatus: co.billingStatus,
        percentInvoiced: co.percentInvoiced,
        estimatedCostCents: co.estimatedCostCents,
        estimatedDays: co.estimatedDays,
        requestedBy: co.requestedBy,
        supervisor: co.supervisor,
        description: co.description,
        laborers: co.laborers.map((l) => ({
          id: l.id,
          updatePath: `/api/erp/change-order-laborers/${l.id}`,
          date: l.workDate.toISOString(),
          role: l.role ?? null,
          name: l.name,
          hours: l.hours,
          hourlyRateCents: l.hourlyRateCents,
          description: l.taskDescription ?? null,
          qualityRating: l.qualityRating ?? null,
          qualityNotes: l.qualityNotes ?? null,
        })),
        laborCostCents: co.laborers.reduce((s, l) => s + Math.round(l.hours * l.hourlyRateCents), 0),
      })),
    };
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-pink-600">Projects</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/erp/projects/new"
            className="rounded-md bg-gray-100 px-2 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200"
          >
            New project
          </Link>
          <HubSpotSyncButton />
        </div>
      </div>

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
