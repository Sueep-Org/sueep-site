import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { parseHubSpotPipelineStageMap } from "@/lib/hubspot/pipelineStages";
import { deriveProjectLifecycle } from "@/lib/erp/projectLifecycle";
import { ProjectsTabs } from "./ProjectsTabs";

export const dynamic = "force-dynamic";

function getProjectDetailLine(description: string | null, label: string) {
  const prefix = `${label}:`;
  return (
    (description || "")
      .split(/\r?\n/)
      .find((line) => line.trim().toLowerCase().startsWith(prefix.toLowerCase()))
      ?.replace(new RegExp(`^${label}:\\s*`, "i"), "")
      .trim() || ""
  );
}

function normalizeMatchValue(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

function parseProjectUnitNumbers(description: string | null) {
  const units = getProjectDetailLine(description, "Units") || getProjectDetailLine(description, "Unit Numbers");
  if (!units) return [];

  return units
    .split(/\s+\|\s+|,/)
    .map((unit) => unit.match(/^\s*([^(:|-]+)/)?.[1]?.trim() || "")
    .filter(Boolean);
}

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
      contractorAssignments: { select: { costCents: true } },
      building: { select: { id: true, name: true } },
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
          contractValueCents: true,
          estMaterialCents: true,
          estTravelCents: true,
          estLaborCents: true,
          actualLaborCents: true,
          actualMaterialCents: true,
          actualTravelCents: true,
          estHours: true,
          actualHours: true,
          materialEntries: { select: { costCents: true } },
          laborers: {
            select: { id: true, name: true, role: true, workDate: true, hours: true, hourlyRateCents: true, taskDescription: true, qualityRating: true, qualityNotes: true },
            orderBy: { workDate: "asc" },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  const qualityChecks = await prisma.qualityCheck.findMany({
    orderBy: [{ createdAt: "desc" }],
    include: {
      turnoverRequest: {
        select: {
          unitNumber: true,
          building: { select: { name: true } },
        },
      },
    },
  });
  const buildings = await prisma.building.findMany({
    select: { id: true, name: true },
  });
  const buildingIdByName = new Map(buildings.map((building) => [normalizeMatchValue(building.name), building.id]));
  const buildingNameById = new Map(buildings.map((building) => [building.id, building.name]));

  const lifecycleRank = (p: (typeof projects)[number]) => {
    const lifecycle = deriveProjectLifecycle(p.status, p.projectDate ? p.projectDate.toISOString() : null);
    if (lifecycle === "ACTIVE") return 0;
    if (lifecycle === "UPCOMING") return 1;
    return 2;
  };

  projects.sort((a, b) => {
    const rankDelta = lifecycleRank(a) - lifecycleRank(b);
    if (rankDelta !== 0) return rankDelta;
    return a.jobTitle.localeCompare(b.jobTitle);
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
    const contractorCostCents = p.contractorAssignments.reduce((s, a) => s + (a.costCents ?? 0), 0);
    const actualLaborCents = (p.laborEntries.length > 0 ? laborCents : (p.actualLaborCents ?? 0)) + contractorCostCents;
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
    const resolvedBuildingId = p.buildingId ?? buildingIdByName.get(
      normalizeMatchValue(getProjectDetailLine(p.description, "Property") || p.jobTitle.split(" - ")[0]?.trim())
    ) ?? null;
    const resolvedBuildingName = p.building?.name ?? (resolvedBuildingId ? buildingNameById.get(resolvedBuildingId) ?? null : null);
    return {
      id: p.id,
      jobTitle: p.jobTitle,
      description: p.description,
      buildingId: resolvedBuildingId,
      buildingName: resolvedBuildingName,
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
      unitQualityChecks: qualityChecks
        .filter((check) => {
          if (!check.turnoverRequest) return false;
          const buildingName = getProjectDetailLine(p.description, "Property") || p.jobTitle.split(" - ")[0]?.trim() || "";
          const unitNumbers = parseProjectUnitNumbers(p.description).map(normalizeMatchValue);
          const checkBuilding = normalizeMatchValue(check.turnoverRequest.building.name);
          const checkUnit = normalizeMatchValue(check.turnoverRequest.unitNumber);

          return (
            normalizeMatchValue(buildingName) === checkBuilding &&
            Boolean(checkUnit) &&
            unitNumbers.includes(checkUnit)
          );
        })
        .map((check) => ({
          id: check.id,
          createdAt: check.createdAt.toISOString(),
          unitNumber: check.turnoverRequest?.unitNumber ?? null,
          supervisorName: check.supervisorName,
          pmApproval: check.pmApproval,
          evidencePhotoCount: Array.isArray(check.evidencePhotos) ? check.evidencePhotos.length : 0,
          notes: check.notes ?? null,
        })),
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
        contractValueCents: co.contractValueCents,
        estMaterialCents: co.estMaterialCents,
        estTravelCents: co.estTravelCents,
        estLaborCents: co.estLaborCents,
        actualLaborCents: co.actualLaborCents,
        actualMaterialCents: co.actualMaterialCents,
        actualTravelCents: co.actualTravelCents,
        estHours: co.estHours,
        actualHours: co.actualHours,
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
        materialCostCents: co.materialEntries.reduce((s, e) => s + e.costCents, 0),
      })),
    };
  });

  // ========== DEMO ENTRY: Presidential City Janitorial ==========
  const presidentialCityEntry: typeof rows[number] = {
    id: "presidential-city-demo",
    jobTitle: "Presidential City - Janitorial Services",
    description: "Property: Presidential City\nAddress: 3900 City Ave, Philadelphia, PA 19131\nUnits: 911 Bldn Madison - Studio | 916 Bldn Adams - 2/2\n\n🚨 DEMO ENTRY - For testing purposes",
    buildingId: null,
    buildingName: "Presidential City",
    segment: "JANITORIAL_GENERAL_WORK_REQUEST",
    status: "ACTIVE",
    projectDate: new Date().toISOString(),
    supervisor: "David Rodriguez",
    percentDone: 75,
    percentInvoiced: 100,
    billingStatus: "BILLING",
    contractValueCents: 300000, // $3,000.00
    laborEntries: [
      {
        id: "pres-labor-1",
        updatePath: `/api/erp/projects/presidential-city-demo/labor/pres-labor-1`,
        date: new Date("2026-04-10").toISOString(),
        role: "Janitorial",
        name: "David Rodriguez",
        hours: 7,
        hourlyRateCents: 2884, // $28.84
        description: "Paint / Clean - Unit 911 Studio",
        qualityRating: "EXCELLENT",
        qualityNotes: null,
      },
      {
        id: "pres-labor-2",
        updatePath: `/api/erp/projects/presidential-city-demo/labor/pres-labor-2`,
        date: new Date("2026-04-10").toISOString(),
        role: "Janitorial",
        name: "Oscar Giraldo",
        hours: 7,
        hourlyRateCents: 2500, // $25.00
        description: "Paint / Clean - Unit 911 Studio",
        qualityRating: "EXCELLENT",
        qualityNotes: null,
      },
      {
        id: "pres-labor-3",
        updatePath: `/api/erp/projects/presidential-city-demo/labor/pres-labor-3`,
        date: new Date("2026-04-10").toISOString(),
        role: "Janitorial",
        name: "Angela",
        hours: 7,
        hourlyRateCents: 1500, // $15.00
        description: "Paint / Clean - Unit 911 Studio",
        qualityRating: "GOOD",
        qualityNotes: null,
      },
      {
        id: "pres-labor-4",
        updatePath: `/api/erp/projects/presidential-city-demo/labor/pres-labor-4`,
        date: new Date("2026-04-10").toISOString(),
        role: "Janitorial",
        name: "Arelis",
        hours: 7,
        hourlyRateCents: 1500, // $15.00
        description: "Paint / Clean - Unit 911 Studio",
        qualityRating: "GOOD",
        qualityNotes: null,
      },
      {
        id: "pres-labor-5",
        updatePath: `/api/erp/projects/presidential-city-demo/labor/pres-labor-5`,
        date: new Date("2026-04-15").toISOString(),
        role: "Janitorial",
        name: "David Rodriguez",
        hours: 4,
        hourlyRateCents: 2884, // $28.84
        description: "Guarantee - Unit 916 2/2",
        qualityRating: "EXCELLENT",
        qualityNotes: null,
      },
      {
        id: "pres-labor-6",
        updatePath: `/api/erp/projects/presidential-city-demo/labor/pres-labor-6`,
        date: new Date("2026-04-15").toISOString(),
        role: "Janitorial",
        name: "Franklin Olivares",
        hours: 4,
        hourlyRateCents: 2000, // $20.00
        description: "Guarantee - Unit 916 2/2",
        qualityRating: "EXCELLENT",
        qualityNotes: null,
      },
    ],
    materialEntries: [],
    totalHours: 36,
    laborCents: 215836, // Sum of labor
    materialCents: 0,
    estMaterialCents: null,
    actualMaterialCents: 0,
    estLaborCents: null,
    actualLaborCents: 215836,
    estHours: null,
    actualHours: 36,
    cleaningCents: 215836,
    paintCents: 0,
    miles: 0,
    hubspotPipelineId: null,
    unitQualityChecks: [],
    changeOrders: [],
  };
  rows.push(presidentialCityEntry);
  // ============================================================

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
