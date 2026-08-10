import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { parseHubSpotPipelineStageMap } from "@/lib/hubspot/pipelineStages";
import { deriveProjectLifecycle, hasActiveChangeOrder } from "@/lib/erp/projectLifecycle";
import { getErpAuth, canSeeFinancials as checkFinancials, canSeeMarginOnly as checkMarginOnly } from "@/lib/erpAuth";
import { getSupervisorProjectScope } from "@/lib/erp/supervisorScope";
import { calcOtSplits, otLineCents, type OtSplit } from "@/lib/erp/calcOtSplits";
import { computeProjectActualsWithChangeOrders } from "@/lib/erp/projectMargin";
import { getDescLine as getProjectDetailLine } from "@/lib/erp/descLine";
import { ProjectsTabs } from "./ProjectsTabs";

// Sums labor cost the same OT-aware way the project/CO detail pages do
// (1.5x pay for hours over 40/week per employee) — a plain hours*rate sum
// under-reports cost for anyone with overtime that week.
function otAwareLaborCents(
  entries: { id: string; hours: number; hourlyRateCents: number }[],
  otSplits: Map<string, OtSplit>,
): number {
  return entries.reduce((s, e) => {
    const split = otSplits.get(e.id) ?? { regHours: e.hours, otHours: 0 };
    return s + otLineCents(split.regHours, split.otHours, e.hourlyRateCents);
  }, 0);
}

export const dynamic = "force-dynamic";

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

type PageProps = { searchParams: Promise<{ scope?: string }> };

export default async function ErpProjectsPage({ searchParams }: PageProps) {
  const { scope: scopeParam } = await searchParams;
  const cfg = parseHubSpotPipelineStageMap();
  const auth = await getErpAuth();
  const financials = checkFinancials(auth?.role ?? "EMPLOYEE");
  const marginOnly = checkMarginOnly(auth?.role ?? "EMPLOYEE");

  // Supervisors default to seeing just their own projects (same rule as
  // their dashboard and the schedule calendar), but can switch to the full
  // company list via the toggle below — this only restricts the default
  // view, not their access. Every other role always sees everything.
  const isSupervisor = auth?.role === "SUPERVISOR";
  const supervisorScope = isSupervisor ? await getSupervisorProjectScope(auth!.uid, auth!.email) : null;
  const scope = isSupervisor && scopeParam !== "all" ? "mine" : "all";
  const projectWhere = scope === "mine" && supervisorScope?.where ? supervisorScope.where : undefined;

  const projects = await prisma.project.findMany({
    where: projectWhere,
    orderBy: [{ projectDate: "desc" }, { updatedAt: "desc" }],
    take: 300,
    include: {
      laborEntries: {
        select: {
          id: true,
          employeeId: true,
          workDate: true,
          createdAt: true,
          workerName: true,
          role: true,
          hours: true,
          commuteHours: true,
          hourlyRateCents: true,
          taskDescription: true,
          qualityNotes: true,
          employee: { select: { firstName: true, lastName: true } },
        },
        orderBy: { workDate: "desc" },
      },
      materialEntries: {
        select: { usedOn: true, category: true, itemName: true, quantity: true, unit: true, costCents: true, notes: true },
        orderBy: { usedOn: "asc" },
      },
      distanceEntries: { select: { miles: true } },
      contractorAssignments: {
        select: {
          costCents: true,
          role: true,
          startDate: true,
          endDate: true,
          notes: true,
          contractor: { select: { name: true } },
          sovItems: { select: { id: true, description: true, scheduledValueCents: true } },
        },
      },
      building: { select: { id: true, name: true } },
      changeOrders: {
        select: {
          id: true,
          title: true,
          status: true,
          startDate: true,
          requestedDate: true,
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
            select: { id: true, employeeId: true, name: true, role: true, workDate: true, createdAt: true, hours: true, hourlyRateCents: true, taskDescription: true, qualityRating: true, qualityNotes: true },
            orderBy: { workDate: "desc" },
          },
          contractorAssignments: {
            select: {
              costCents: true,
              role: true,
              startDate: true,
              endDate: true,
              notes: true,
              contractor: { select: { name: true } },
            },
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

  // One batched OT-splits call for every labor entry across every project/CO
  // on this page, instead of one call per project — calcOtSplits queries the
  // full LaborEntry/ProjectChangeOrderLaborer tables per employee/week
  // regardless, so batching the "view" doesn't change results, just avoids
  // an N+1 query pattern across up to 300 projects.
  const otSplits = await calcOtSplits([
    ...projects.flatMap((p) => p.laborEntries),
    ...projects.flatMap((p) => p.changeOrders.flatMap((co) => co.laborers)),
  ]);

  // Same shared cost/margin methodology used everywhere else that shows a
  // project's actuals (dashboard's Bad margins widget, commission) — kept
  // as one implementation so this table can't quietly drift from those.
  const actualsMap = await computeProjectActualsWithChangeOrders(
    projects.map((p) => ({
      id: p.id,
      contractValueCents: p.contractValueCents,
      actualLaborCents: p.actualLaborCents,
      actualMaterialCents: p.actualMaterialCents,
      laborEntries: p.laborEntries,
      materialEntries: p.materialEntries,
      contractorAssignments: p.contractorAssignments,
      changeOrders: p.changeOrders.map((co) => ({
        status: co.status,
        contractValueCents: co.contractValueCents,
        estimatedCostCents: co.estimatedCostCents,
        actualLaborCents: co.actualLaborCents,
        actualMaterialCents: co.actualMaterialCents,
        materialEntries: co.materialEntries,
        laborers: co.laborers,
        contractorAssignments: co.contractorAssignments,
      })),
    }))
  );

  const lifecycleRank = (p: (typeof projects)[number]) => {
    const lifecycle = deriveProjectLifecycle(p.status, p.projectDate ? p.projectDate.toISOString() : null, hasActiveChangeOrder(p.changeOrders));
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
    const laborCents = otAwareLaborCents(p.laborEntries, otSplits);
    const materialCents = p.materialEntries.reduce((s, e) => s + e.costCents, 0);
    const paintCents = p.materialEntries.filter((e) => e.category === "PAINT").reduce((s, e) => s + e.costCents, 0);
    const cleaningCents = p.materialEntries
      .filter((e) => e.category === "CLEANING_PRODUCTS")
      .reduce((s, e) => s + e.costCents, 0);
    const miles = p.distanceEntries.reduce((s, e) => s + e.miles, 0);
    const actualHours = totalHours > 0 ? totalHours : (p.actualHours ?? 0);

    // Actual labor/material/contract-value cost, change orders rolled in —
    // computed by the shared computeProjectActualsWithChangeOrders above.
    const actuals = actualsMap.get(p.id)!;

    // Estimated (not actual) change-order figures still computed inline —
    // the shared function only covers actuals, not estimates.
    // Roll up qualifying change orders (exclude VOID and REJECTED).
    const qualifyingCOs = p.changeOrders.filter((co) => co.status !== "VOID" && co.status !== "REJECTED");
    const coEstMaterialCents = qualifyingCOs.reduce((s, co) => s + (co.estMaterialCents ?? 0), 0);
    const coEstLaborCents = qualifyingCOs.reduce((s, co) => s + (co.estLaborCents ?? 0), 0);
    const coEstHours = qualifyingCOs.reduce((s, co) => s + (co.estHours ?? 0), 0);
    const coActualHours = qualifyingCOs.reduce((s, co) => {
      const laborerHours = co.laborers.reduce((ls, l) => ls + l.hours, 0);
      return s + (laborerHours > 0 ? laborerHours : (co.actualHours ?? 0));
    }, 0);
    const laborEntries = p.laborEntries.map((e) => ({
      id: e.id,
      updatePath: `/api/erp/projects/${p.id}/labor/${e.id}`,
      date: e.workDate.toISOString(),
      role: e.role ?? null,
      name: e.employee ? `${e.employee.firstName} ${e.employee.lastName}`.trim() : e.workerName.trim(),
      hours: e.hours,
      commuteHours: e.commuteHours ?? null,
      hourlyRateCents: e.hourlyRateCents,
      description: e.taskDescription ?? null,
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
      contractValueCents: actuals.contractValueCents,
      laborEntries,
      materialEntries,
      totalHours,
      laborCents,
      materialCents,
      estMaterialCents: p.estMaterialCents == null && coEstMaterialCents === 0
        ? null
        : (p.estMaterialCents ?? 0) + coEstMaterialCents,
      actualMaterialCents: actuals.actualMaterialCents,
      estLaborCents: p.estLaborCents == null && coEstLaborCents === 0
        ? null
        : (p.estLaborCents ?? 0) + coEstLaborCents,
      actualLaborCents: actuals.actualLaborCents,
      estHours: p.estHours == null && coEstHours === 0
        ? null
        : (p.estHours ?? 0) + coEstHours,
      actualHours: actualHours + coActualHours,
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
        status: co.status as "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "VOID" | "BILLING" | "COMPLETED",
        // startDate is the real scheduled date once set; requestedDate is only
        // a placeholder fallback for COs from before startDate was required
        // (same convention the schedule calendar uses).
        startDate: (co.startDate ?? co.requestedDate)?.toISOString() ?? null,
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
          qualityNotes: l.qualityNotes ?? null,
        })),
        laborCostCents: otAwareLaborCents(co.laborers, otSplits),
        materialCostCents: co.materialEntries.reduce((s, e) => s + e.costCents, 0),
        contractorCostCents: co.contractorAssignments.reduce((s, a) => s + (a.costCents ?? 0), 0),
        contractorEntries: co.contractorAssignments.map((a) => ({
          name: a.contractor.name,
          role: a.role ?? null,
          startDate: a.startDate ? a.startDate.toISOString() : null,
          endDate: a.endDate ? a.endDate.toISOString() : null,
          costCents: a.costCents ?? null,
          notes: a.notes ?? null,
          // Change-order contractor assignments have no SOV linkage (only
          // regular project-level ones do) — always empty here so the
          // ContractorTable's Notes column keeps rendering for COs.
          sovItems: [] as { id: string; description: string; scheduledValueCents: number }[],
        })),
      })),
      contractorEntries: p.contractorAssignments.map((a) => ({
        name: a.contractor.name,
        role: a.role ?? null,
        startDate: a.startDate ? a.startDate.toISOString() : null,
        endDate: a.endDate ? a.endDate.toISOString() : null,
        costCents: a.costCents ?? null,
        notes: a.notes ?? null,
        sovItems: a.sovItems.map((s) => ({ id: s.id, description: s.description, scheduledValueCents: s.scheduledValueCents })),
      })),
    };
  });


  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-pink-600">Projects</h1>
        <div className="flex items-center gap-2">
          {isSupervisor && (
            <div className="inline-flex rounded-md border border-gray-200 bg-white p-0.5 text-xs">
              <Link
                href="/erp/projects?scope=mine"
                className={`rounded px-2.5 py-1 font-medium ${scope === "mine" ? "bg-pink-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}
              >
                My Projects
              </Link>
              <Link
                href="/erp/projects?scope=all"
                className={`rounded px-2.5 py-1 font-medium ${scope === "all" ? "bg-pink-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}
              >
                All Projects
              </Link>
            </div>
          )}
          {!isSupervisor && (
            <Link
              href="/erp/projects/new"
              className="rounded-md bg-gray-100 px-2 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200"
            >
              New project
            </Link>
          )}
        </div>
      </div>
      {isSupervisor && scope === "mine" && supervisorScope?.unlinked && (
        <p className="text-xs text-amber-600">
          Not linked to an ERP supervisor account or employee record, showing all projects. Ask an admin to assign you in the project Setup tab.
        </p>
      )}

      {rows.length === 0 && scope === "mine" && !supervisorScope?.unlinked ? (
        <div className="rounded-lg border border-gray-300 bg-gray-50 px-4 py-8 text-center text-gray-600">
          Nothing assigned to you yet.{" "}
          <Link href="/erp/projects?scope=all" className="text-pink-600 hover:underline">
            View all projects
          </Link>
          .
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-gray-300 bg-gray-50 px-4 py-8 text-center text-gray-600">
          {isSupervisor ? (
            "No projects yet."
          ) : (
            <>
              No projects yet.{" "}
              <Link href="/erp/projects/new" className="text-pink-600 hover:underline">
                Create one
              </Link>{" "}
              or import from HubSpot under{" "}
              <Link href="/erp/hubspot" className="text-pink-600 hover:underline">
                HubSpot sync
              </Link>
              .
            </>
          )}
        </div>
      ) : (
        <ProjectsTabs
          rows={rows}
          postConstructionPipelineId={cfg?.postConstruction.pipelineId ?? null}
          janitorialPipelineId={cfg?.janitorial.pipelineId ?? null}
          canSeeFinancials={financials}
          canSeeMarginOnly={marginOnly}
        />
      )}
    </div>
  );
}
