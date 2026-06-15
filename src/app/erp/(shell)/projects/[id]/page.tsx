import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { parseHubSpotPipelineStageMap } from "@/lib/hubspot/pipelineStages";
import { getErpAuth } from "@/lib/erpAuth";
import { ProjectSetupEditor } from "./ProjectSetupEditor";
import { ProjectFinancialsEditor } from "./ProjectFinancialsEditor";
import { ProjectLaborSection } from "./ProjectLaborSection";
import { ProjectContractorSection } from "./ProjectContractorSection";
import { ProjectDeleteButton } from "./ProjectDeleteButton";
import { ProjectChangeOrdersSection } from "./ProjectChangeOrdersSection";
import { ProjectJobTitleEditor } from "./ProjectJobTitleEditor";
import { ProjectMaterialsSection } from "./ProjectMaterialsSection";
import { DetailTabs } from "@/app/erp/components/DetailTabs";
import { ProjectWorkOrderNotifier } from "./ProjectWorkOrderNotifier";
import { ProjectChecklistSection } from "./ProjectChecklistSection";
import { ProjectUnitTurnoverChecklist } from "./ProjectUnitTurnoverChecklist";
import { BuildingPricingPackageEditor } from "@/app/erp/(shell)/buildings/BuildingPricingPackageEditor";
import { UnitScopeCard } from "./UnitScopeCard";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function ProjectDetailPage({ params }: PageProps) {
  const { id } = await params;
  const auth = await getErpAuth();
  const isSupervisor = auth?.role === "SUPERVISOR";
  const cfg = parseHubSpotPipelineStageMap();
  const [project, laborEmployees, contractors, changeOrders, materialEntries, checklistItems, workOrderRecord] = await Promise.all([
    prisma.project.findUnique({
      where: { id },
      include: {
        laborEntries: {
          orderBy: { workDate: "desc" },
          include: { employee: { select: { firstName: true, lastName: true } } },
        },
        contractorAssignments: {
          orderBy: { createdAt: "desc" },
          include: { contractor: { select: { id: true, name: true } } },
        },
        contacts: {
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
          select: { id: true, fullName: true, role: true, email: true, phone: true },
        },
        building: { select: { id: true, name: true, pricingPackage: true } },
        turnoverRequest: {
          select: {
            unitNumber: true,
            bedrooms: true,
            bathrooms: true,
            fullClean: true,
            fullPaint: true,
            touchUpPaint: true,
            carpetCleaning: true,
            materialsAdditional: true,
          },
        },
      },
    }),
    prisma.employee.findMany({
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true, hourlyPayCents: true, role: true, status: true, email: true },
    }),
    prisma.contractor.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, status: true },
    }),
    prisma.projectChangeOrder.findMany({
      where: { projectId: id },
      orderBy: { createdAt: "desc" },
      include: { laborers: { orderBy: { createdAt: "asc" } } },
    }),
    prisma.materialEntry.findMany({
      where: { projectId: id },
      orderBy: { usedOn: "desc" },
    }),
    prisma.projectChecklistItem.findMany({
      where: { projectId: id },
      orderBy: [{ date: "desc" }, { createdAt: "asc" }],
    }),
    prisma.projectWorkOrderRecord.findUnique({ where: { projectId: id } }),
  ]);
  if (!project) notFound();

  function getDescLine(desc: string | null, label: string) {
    const prefix = `${label}:`;
    return (
      (desc || "")
        .split(/\r?\n/)
        .find((line) => line.trim().toLowerCase().startsWith(prefix.toLowerCase()))
        ?.replace(new RegExp(`^${label}:\\s*`, "i"), "")
        .trim() || null
    );
  }
  const isTurnover = project.segment === "JANITORIAL_TURNOVER_REQUESTS";
  const propertyManager = isTurnover ? getDescLine(project.description, "Property Manager/Maintenance Manager") : null;
  const sueepPm = isTurnover ? (project.supervisor || getDescLine(project.description, "SUEEP PM")) : null;

  const contractorCostCents = project.contractorAssignments.reduce((s, a) => s + (a.costCents ?? 0), 0);
  const laborCentsFromLogs = project.laborEntries.reduce((s, e) => s + Math.round(e.hours * e.hourlyRateCents), 0);
  const hoursFromLogs = project.laborEntries.reduce((s, e) => s + e.hours, 0);

  const isManual = !project.hubspotDealId;
  const isPostConstruction = cfg?.postConstruction.pipelineId
    ? project.hubspotPipelineId === cfg.postConstruction.pipelineId
    : true;
  const pipelineOptions = cfg
    ? [
        { id: cfg.postConstruction.pipelineId, label: "Post-Construction" },
        { id: cfg.janitorial.pipelineId, label: "Janitorial" },
        { id: cfg.residential.pipelineId, label: "Residential" },
      ].filter((o) => o.id?.trim())
    : [];

  const laborRows = project.laborEntries.map((e) => ({
    id: e.id,
    employeeId: e.employeeId,
    employeeName: e.employee ? `${e.employee.firstName} ${e.employee.lastName}`.trim() || null : null,
    workDate: e.workDate.toISOString(),
    workerName: e.workerName,
    role: e.role,
    hours: e.hours.toString(),
    hourlyRateCents: e.hourlyRateCents,
    taskDescription: e.taskDescription,
    qualityRating: e.qualityRating ?? null,
    qualityNotes: e.qualityNotes ?? null,
  }));

  const changeOrderRows = changeOrders.map((co) => ({
    id: co.id,
    createdAt: co.createdAt.toISOString(),
    title: co.title,
    description: co.description,
    requestedBy: co.requestedBy,
    supervisor: co.supervisor,
    status: co.status as "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "VOID",
    estimatedCostCents: co.estimatedCostCents,
    estimatedDays: co.estimatedDays,
    reason: co.reason,
    resolutionNotes: co.resolutionNotes,
    contractValueCents: co.contractValueCents,
    estMaterialCents: co.estMaterialCents,
    estTravelCents: co.estTravelCents,
    estLaborCents: co.estLaborCents,
    actualLaborCents: co.actualLaborCents,
    actualMaterialCents: co.actualMaterialCents,
    actualTravelCents: co.actualTravelCents,
    laborers: (co.laborers ?? []).map((l) => ({ id: l.id, employeeId: l.employeeId, name: l.name, role: l.role })),
  }));

  const contractorRows = project.contractorAssignments.map((a) => ({
    id: a.id,
    contractorId: a.contractorId,
    contractorName: a.contractor.name,
    role: a.role,
    assignedDate: a.assignedDate ? a.assignedDate.toISOString() : null,
    startDate: a.startDate ? a.startDate.toISOString() : null,
    endDate: a.endDate ? a.endDate.toISOString() : null,
    notes: a.notes,
    costCents: a.costCents ?? null,
  }));

  const allTabs = [
    {
      label: "Details",
      content: (
        <>
          {project.turnoverRequest && (
            <div className="mb-6">
              <UnitScopeCard
                unitNumber={project.turnoverRequest.unitNumber}
                bedrooms={project.turnoverRequest.bedrooms}
                bathrooms={project.turnoverRequest.bathrooms}
                fullClean={project.turnoverRequest.fullClean}
                fullPaint={project.turnoverRequest.fullPaint}
                touchUpPaint={project.turnoverRequest.touchUpPaint}
                carpetCleaning={project.turnoverRequest.carpetCleaning}
                materialsAdditional={project.turnoverRequest.materialsAdditional}
              />
            </div>
          )}
          <ProjectWorkOrderNotifier
            projectId={project.id}
            jobTitle={project.jobTitle}
            description={project.description}
            projectDateIso={project.projectDate ? project.projectDate.toISOString() : null}
            contacts={project.contacts}
            employees={laborEmployees}
            savedRecord={workOrderRecord ? {
              projectName: workOrderRecord.projectName,
              siteAddress: workOrderRecord.siteAddress,
              contacts: workOrderRecord.contacts,
              startDate: workOrderRecord.startDate,
              serviceType: workOrderRecord.serviceType,
              notes: workOrderRecord.notes,
              lastSentToName: workOrderRecord.lastSentToName,
              lastSentAt: workOrderRecord.lastSentAt ? workOrderRecord.lastSentAt.toISOString() : null,
            } : null}
          />
          {isTurnover && (propertyManager || sueepPm) && (
            <div className="mb-4 flex gap-6 rounded-md border border-gray-200 bg-gray-50 p-3">
              {propertyManager && (
                <div>
                  <p className="text-[10px] uppercase text-gray-500">Property Manager</p>
                  <p className="mt-0.5 text-sm font-medium text-gray-800">{propertyManager}</p>
                </div>
              )}
              {sueepPm && (
                <div>
                  <p className="text-[10px] uppercase text-gray-500">Sueep PM</p>
                  <p className="mt-0.5 text-sm font-medium text-gray-800">{sueepPm}</p>
                </div>
              )}
            </div>
          )}
          {project.description ? (
            <div className="mb-4 rounded-md border border-gray-200 bg-gray-50 p-3">
              <p className="text-[10px] uppercase text-gray-500">Submitted details</p>
              <p className="mt-1 whitespace-pre-line text-sm text-gray-800">{project.description}</p>
            </div>
          ) : null}
        </>
      ),
    },
    {
      label: "Setup",
      content: (
        <ProjectSetupEditor
          projectId={project.id}
          status={project.status}
          segment={project.segment}
          hubspotPipelineId={project.hubspotPipelineId ?? null}
          isManual={isManual}
          pipelineOptions={pipelineOptions}
          supervisor={project.supervisor}
          employees={laborEmployees}
          projectDateIso={project.projectDate ? project.projectDate.toISOString() : null}
          projectEndDateIso={project.projectEndDate ? project.projectEndDate.toISOString() : null}
          description={project.description}
          showServiceType={project.segment !== "JANITORIAL_TURNOVER_REQUESTS"}
        />
      ),
    },
    {
      label: "Money",
      content: (
        <ProjectFinancialsEditor
          projectId={project.id}
          contractValueCents={project.contractValueCents}
          percentDone={project.percentDone}
          percentInvoiced={project.percentInvoiced}
          billingStatus={project.billingStatus}
          estMaterialCents={project.estMaterialCents}
          estTravelCents={project.estTravelCents}
          estLaborCents={project.estLaborCents}
          actualLaborCents={project.actualLaborCents}
          contractorCostCents={contractorCostCents}
          actualMaterialCents={project.actualMaterialCents}
          estHours={project.estHours}
          actualHours={project.actualHours}
          laborCentsFromLogs={laborCentsFromLogs}
          hoursFromLogs={hoursFromLogs}
        />
      ),
    },
    {
      label: "Labor",
      content: <ProjectLaborSection projectId={project.id} initialEntries={laborRows} employees={laborEmployees} />,
    },
    {
      label: "Contractors",
      content: (
        <ProjectContractorSection
          projectId={project.id}
          initialAssignments={contractorRows}
          contractors={contractors}
        />
      ),
    },
    {
      label: "Materials",
      content: (
        <ProjectMaterialsSection
          projectId={project.id}
          initialEntries={materialEntries.map((e) => ({
            id: e.id,
            usedOn: e.usedOn.toISOString(),
            category: e.category as "CLEANING_PRODUCTS" | "PAINT",
            itemName: e.itemName,
            quantity: e.quantity,
            unit: e.unit,
            costCents: e.costCents,
            notes: e.notes,
          }))}
        />
      ),
    },
    {
      label: "Checklist",
      content: project.segment === "JANITORIAL_TURNOVER_REQUESTS" ? (
        <ProjectUnitTurnoverChecklist projectId={project.id} buildingName={project.building?.name ?? null} />
      ) : (
        <ProjectChecklistSection
          projectId={project.id}
          initialItems={checklistItems.map((item: { id: string; createdAt: Date; date: Date; title: string; completed: boolean; notes: string | null }) => ({
            id: item.id,
            createdAt: item.createdAt.toISOString(),
            date: item.date.toISOString(),
            title: item.title,
            completed: item.completed,
            notes: item.notes,
          }))}
        />
      ),
    },
    ...(project.segment === "JANITORIAL_TURNOVER_REQUESTS" && project.building
      ? [
          {
            label: "Pricing Package",
            content: (
              <div className="max-w-4xl">
                <BuildingPricingPackageEditor
                  buildingId={project.building.id}
                  buildingName={project.building.name}
                  initialPackage={project.building.pricingPackage}
                />
              </div>
            ),
          },
        ]
      : []),
    ...(isPostConstruction
      ? [
          {
            label: "Change Orders",
            content: (
              <ProjectChangeOrdersSection
                projectId={project.id}
                initialEntries={changeOrderRows}
                employees={laborEmployees.map((e) => ({
                  id: e.id,
                  firstName: e.firstName,
                  lastName: e.lastName,
                  email: e.email ?? null,
                }))}
              />
            ),
          },
        ]
      : []),
  ];

  const tabs = isSupervisor
    ? allTabs.filter((t) => t.label === "Labor" || t.label === "Checklist")
    : allTabs;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/erp/projects" className="text-xs text-pink-600 hover:underline">
          ← Projects
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <ProjectJobTitleEditor projectId={project.id} jobTitle={project.jobTitle} hubspotDealId={project.hubspotDealId} />
          {!isSupervisor && <ProjectDeleteButton projectId={project.id} jobTitle={project.jobTitle} />}
        </div>
      </div>

      <DetailTabs tabs={tabs} />
    </div>
  );
}
