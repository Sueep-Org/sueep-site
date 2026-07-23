import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { parseHubSpotPipelineStageMap } from "@/lib/hubspot/pipelineStages";
import { hasActiveChangeOrder } from "@/lib/erp/projectLifecycle";
import { getErpAuth, canEditPricing, canEditEmployeePayInfo } from "@/lib/erpAuth";
import { ProjectCommissionOwnerEditor } from "./ProjectCommissionOwnerEditor";
import { calcOtSplits, otLineCents } from "@/lib/erp/calcOtSplits";
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
import { UnitScopeEditor } from "./UnitScopeEditor";
import { ProjectSOVSection } from "./ProjectSOVSection";
import type { SOVItem } from "./ProjectSOVSection";
import { WorkOrderAttachmentsSection } from "./WorkOrderAttachmentsSection";
import { ProjectSafetySection } from "./ProjectSafetySection";
import { RealEstateProjectDetails } from "./RealEstateProjectDetails";
import { RealEstatePricingPackageEditor } from "./RealEstatePricingPackageEditor";
import { NewQualityCheckForm } from "@/app/erp/(shell)/quality-checks/NewQualityCheckForm";
import { QualityChecksTable } from "@/app/erp/(shell)/quality-checks/QualityChecksTable";
import { ProjectSigningSection, type ProjectContractItem } from "./ProjectSigningSection";
import { ProjectNotesSection } from "./ProjectNotesSection";
import { resolveCommissionEmployeeId } from "@/lib/erp/commission";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function ProjectDetailPage({ params }: PageProps) {
  const { id } = await params;
  const auth = await getErpAuth();
  const isSupervisor = auth?.role === "SUPERVISOR";
  const isEmployee = auth?.role === "EMPLOYEE";
  const canEditSOV = auth?.role === "ADMIN" || auth?.role === "PROJECT_MANAGER" || auth?.role === "ESTIMATION";
  const canEditPricingForRole = auth ? canEditPricing(auth.role) : false;
  const canSeeCommission = auth ? canEditEmployeePayInfo(auth.role) : false;
  const cfg = parseHubSpotPipelineStageMap();
  const [project, laborEmployees, contractors, changeOrders, materialEntries, checklistItems, workOrderRecord, sov, safetyChecks, erpSupervisorUsers, qualityChecks, erpUsers, currentErpUser] = await Promise.all([
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
        contracts: { orderBy: { createdAt: "asc" } },
        turnoverRequest: {
          select: {
            id: true,
            unitNumber: true,
            bedrooms: true,
            bathrooms: true,
            fullClean: true,
            fullPaint: true,
            touchUpPaint: true,
            carpetCleaning: true,
            materialsAdditional: true,
            ceilingPaint: true,
            otherWork: true,
            otherDescription: true,
            otherCents: true,
            priceCents: true,
          },
        },
        notes: {
          orderBy: { createdAt: "desc" },
          select: { id: true, body: true, createdAt: true, authorName: true, authorUserId: true },
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
    prisma.projectSOV.findUnique({
      where: { projectId: id },
      include: { items: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] } },
    }),
    prisma.dailySafetyCheck.findMany({
      where: { projectId: id },
      orderBy: { checkDate: "desc" },
      include: {
        workers: {
          orderBy: { createdAt: "asc" },
          include: {
            incidents: {
              orderBy: { createdAt: "desc" },
              select: { id: true, status: true, violationCount: true, createdAt: true },
            },
          },
        },
      },
    }),
    prisma.erpUser.findMany({
      where: { role: "SUPERVISOR" },
      select: { id: true, email: true },
      orderBy: { email: "asc" },
    }),
    prisma.qualityCheck.findMany({
      where: {
        OR: [
          { projectId: id },
          // also pick up checks filed against this project's turnover request (janitorial)
          { turnoverRequest: { projects: { some: { id } } } },
        ],
      },
      orderBy: { createdAt: "desc" },
      include: {
        turnoverRequest: { include: { building: true } },
        project: { select: { id: true, jobTitle: true } },
      },
    }),
    prisma.erpUser.findMany({ select: { email: true } }),
    // auth.uid is the Firebase UID (from the session token), not the ErpUser.id — resolve the actual row.
    auth?.uid ? prisma.erpUser.findUnique({ where: { firebaseUid: auth.uid }, select: { id: true } }) : Promise.resolve(null),
  ]);
  if (!project) notFound();

  // Commission owner must be someone with an ERP login — most Employee rows
  // are crew (painters/cleaners) with no ErpUser account at all.
  const erpUserEmails = new Set(erpUsers.map((u) => u.email.toLowerCase()));
  const commissionEligibleEmployees = laborEmployees.filter(
    (e) => e.email && erpUserEmails.has(e.email.toLowerCase())
  );

  // What the editor's "Auto" option resolves to absent an explicit override
  // — same resolver the Employee "Commission" tab uses, so the two always agree.
  const autoMatchedEmployeeId = resolveCommissionEmployeeId(
    {
      commissionEmployeeId: null,
      hubspotOwnerEmail: project.hubspotOwnerEmail,
      hubspotOwnerName: project.hubspotOwnerName,
      createdByEmployeeId: project.createdByEmployeeId,
    },
    commissionEligibleEmployees
  );
  const autoMatchedCommissionEmployee =
    commissionEligibleEmployees.find((e) => e.id === autoMatchedEmployeeId) ?? null;

  // Resolve display names for ERP supervisors from employee records
  const erpSupervisors = await Promise.all(
    erpSupervisorUsers.map(async (u) => {
      const emp = await prisma.employee.findFirst({
        where: { email: { equals: u.email, mode: "insensitive" } },
        select: { firstName: true, lastName: true },
      });
      const displayName = emp
        ? `${emp.firstName} ${emp.lastName}`.trim()
        : u.email.split("@")[0];
      return { id: u.id, email: u.email, displayName };
    })
  );

  // Build serializable array of keys for labor warning badge: "emp:{id}:{date}" or "name:{lower}:{date}"
  const safetyPassedKeysArr: string[] = [];
  const safetyCheckRows = safetyChecks.map((check) => {
    const dateStr = check.checkDate.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    for (const w of check.workers) {
      if (w.passed) {
        if (w.employeeId) safetyPassedKeysArr.push(`emp:${w.employeeId}:${dateStr}`);
        safetyPassedKeysArr.push(`name:${w.workerName.toLowerCase()}:${dateStr}`);
      }
    }
    return {
      id: check.id,
      checkDate: check.checkDate.toISOString(),
      supervisorName: check.supervisorName,
      hasGroupPhoto: check.groupPhotoData != null,
      groupPhotoUploadedAt: check.groupPhotoUploadedAt ? check.groupPhotoUploadedAt.toISOString() : null,
      hasArrivalPhoto: check.siteArrivalPhotoData != null,
      siteArrivalPhotoUploadedAt: check.siteArrivalPhotoUploadedAt ? check.siteArrivalPhotoUploadedAt.toISOString() : null,
      approvedForWork: check.approvedForWork,
      approvedAt: check.approvedAt ? check.approvedAt.toISOString() : null,
      notes: check.notes,
      workers: check.workers.map((w) => ({
        id: w.id,
        workerName: w.workerName,
        employeeId: w.employeeId,
        hasVest: w.hasVest,
        hasHardHat: w.hasHardHat,
        hasBoots: w.hasBoots,
        hasUniform: w.hasUniform,
        hasPhoto: w.photoData != null,
        photoUploadedAt: w.photoUploadedAt ? w.photoUploadedAt.toISOString() : null,
        passed: w.passed,
        notes: w.notes,
        incidents: w.incidents.map((inc) => ({
          id: inc.id,
          status: inc.status,
          violationCount: inc.violationCount,
          createdAt: inc.createdAt.toISOString(),
        })),
      })),
    };
  });

  const sovItems: SOVItem[] = (sov?.items ?? []).map((item) => ({
    id: item.id,
    order: item.order,
    description: item.description,
    scheduledValueCents: item.scheduledValueCents,
    completed: item.completed,
    billingStatus: item.billingStatus,
  }));

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
  const laborOtSplits = await calcOtSplits(
    project.laborEntries.map((e) => ({
      id: e.id,
      employeeId: e.employeeId,
      workDate: e.workDate,
      hours: e.hours,
      createdAt: e.createdAt,
    }))
  );
  const laborCentsFromLogs = project.laborEntries.reduce((s, e) => {
    const split = laborOtSplits.get(e.id) ?? { regHours: e.hours, otHours: 0 };
    return s + otLineCents(split.regHours, split.otHours, e.hourlyRateCents);
  }, 0);
  const hoursFromLogs = project.laborEntries.reduce((s, e) => s + e.hours, 0);
  // Actual days worked = distinct calendar dates with a labor log, not a
  // simple date-span — a project can run for weeks without being worked every day.
  const daysFromLogs = new Set(project.laborEntries.map((e) => e.workDate.toISOString().slice(0, 10))).size;

  const isManual = !project.hubspotDealId;
  const isPostConstruction = cfg?.postConstruction.pipelineId
    ? project.hubspotPipelineId === cfg.postConstruction.pipelineId
    : true;

  const todayDateStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const hasApprovedCheckToday = isPostConstruction && safetyChecks.some((check) => {
    const checkStr = check.checkDate.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    return checkStr === todayDateStr && check.approvedForWork;
  });
  const pipelineOptions = cfg
    ? [
        { id: cfg.postConstruction.pipelineId, label: "Post-Construction" },
        { id: cfg.janitorial.pipelineId, label: "Janitorial" },
        ...(cfg.realEstate ? [{ id: cfg.realEstate.pipelineId, label: "Real Estate" }] : []),
      ].filter((o) => o.id?.trim())
    : [];

  const laborRows = project.laborEntries.map((e) => {
    const split = laborOtSplits.get(e.id) ?? { regHours: e.hours, otHours: 0 };
    return {
      id: e.id,
      employeeId: e.employeeId,
      employeeName: e.employee ? `${e.employee.firstName} ${e.employee.lastName}`.trim() || null : null,
      workDate: e.workDate.toISOString(),
      workerName: e.workerName,
      role: e.role,
      hours: e.hours.toString(),
      clockIn: e.clockIn ?? null,
      regHours: split.regHours,
      otHours: split.otHours,
      hourlyRateCents: e.hourlyRateCents,
      taskDescription: e.taskDescription,
      sovItemId: e.sovItemId ?? null,
      qualityRating: e.qualityRating ?? null,
      qualityNotes: e.qualityNotes ?? null,
    };
  });

  // Same "counts unless it's dead" rule as the Projects table rollup —
  // display-only total, never written back to project.contractValueCents.
  // contractValueCents is only set once a CO's final value is confirmed;
  // until then, fall back to its estimatedCostCents so a CO with just an
  // estimate still counts instead of silently showing as $0.
  const qualifyingChangeOrders = changeOrders.filter((co) => co.status !== "VOID" && co.status !== "REJECTED");
  const qualifyingCoContractValueCents = qualifyingChangeOrders.reduce(
    (s, co) => s + (co.contractValueCents ?? co.estimatedCostCents ?? 0),
    0
  );

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
      label: "Overview",
      content: (
        <>
          {project.segment === "REAL_ESTATE" && project.description && (
            <RealEstateProjectDetails description={project.description} />
          )}
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
                ceilingPaint={project.turnoverRequest.ceilingPaint}
                otherWork={project.turnoverRequest.otherWork}
                otherDescription={project.turnoverRequest.otherDescription}
                contractValueCents={project.contractValueCents}
              />
            </div>
          )}
          <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-gray-500">Project Setup</p>
          <ProjectSetupEditor
            projectId={project.id}
            status={project.status}
            segment={project.segment}
            hubspotPipelineId={project.hubspotPipelineId ?? null}
            isManual={isManual}
            pipelineOptions={pipelineOptions}
            supervisor={project.supervisor}
            supervisorUserId={project.supervisorUserId ?? null}
            employees={laborEmployees}
            erpSupervisors={erpSupervisors}
            projectDateIso={project.projectDate ? project.projectDate.toISOString() : null}
            projectEndDateIso={project.projectEndDate ? project.projectEndDate.toISOString() : null}
            hasActiveChangeOrder={hasActiveChangeOrder(changeOrders)}
          />
          <hr className="my-6 border-gray-200" />
          <ProjectWorkOrderNotifier
            projectId={project.id}
            segment={project.segment}
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
          <WorkOrderAttachmentsSection projectId={project.id} />
          <div className="mt-4" />
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
          {project.description && project.segment !== "REAL_ESTATE" ? (
            <div className="mb-4 rounded-md border border-gray-200 bg-gray-50 p-3">
              <p className="text-[10px] uppercase text-gray-500">Submitted details</p>
              <p className="mt-1 whitespace-pre-line text-sm text-gray-800">{project.description}</p>
            </div>
          ) : null}
          <ProjectNotesSection
            projectId={project.id}
            initialNotes={project.notes.map((n) => ({ ...n, createdAt: n.createdAt.toISOString() }))}
            currentUserId={currentErpUser?.id ?? null}
          />
        </>
      ),
    },
    ...(isTurnover || project.turnoverRequest
      ? [
          {
            label: "Layout",
            content: (
              <UnitScopeEditor
                projectId={project.id}
                buildingId={project.building?.id ?? null}
                turnoverRequestId={project.turnoverRequest?.id ?? null}
                unitNumber={project.turnoverRequest?.unitNumber ?? project.jobTitle.replace(new RegExp(`^${(project.building?.name ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+-\\s+`), "").trim()}
                buildingName={project.building?.name ?? ""}
                pricingPackage={project.building?.pricingPackage ?? null}
                bedrooms={project.turnoverRequest?.bedrooms ?? null}
                bathrooms={project.turnoverRequest?.bathrooms ?? null}
                fullClean={project.turnoverRequest?.fullClean ?? false}
                fullPaint={project.turnoverRequest?.fullPaint ?? false}
                touchUpPaint={project.turnoverRequest?.touchUpPaint ?? null}
                carpetCleaning={project.turnoverRequest?.carpetCleaning ?? false}
                materialsAdditional={project.turnoverRequest?.materialsAdditional ?? false}
                ceilingPaint={project.turnoverRequest?.ceilingPaint ?? false}
                otherWork={project.turnoverRequest?.otherWork ?? false}
                otherDescription={project.turnoverRequest?.otherDescription ?? null}
                otherCents={project.turnoverRequest?.otherCents ?? null}
              />
            ),
          },
        ]
      : []),
    {
      label: "Financials",
      content: (
        <>
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
            actualTravelCents={project.actualTravelCents}
            estHours={project.estHours}
            actualHours={project.actualHours}
            laborCentsFromLogs={laborCentsFromLogs}
            hoursFromLogs={hoursFromLogs}
            estimatedDays={project.estimatedDays}
            daysFromLogs={daysFromLogs}
            qualifyingCoContractValueCents={qualifyingCoContractValueCents}
            qualifyingCoCount={qualifyingChangeOrders.length}
          />
          <hr className="my-6 border-gray-200" />
          <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-gray-500">Schedule of Values</p>
          <ProjectSOVSection
            projectId={project.id}
            initialItems={sovItems}
            canEdit={canEditSOV}
          />
        </>
      ),
    },
    {
      label: "Labor",
      content: <ProjectLaborSection projectId={project.id} initialEntries={laborRows} employees={laborEmployees} sovItems={sovItems} canEdit={!isEmployee} showFinancials={!isEmployee && !isSupervisor} isJanitorialUnit={isTurnover} safetyPassedKeys={safetyPassedKeysArr} hasApprovedCheckToday={hasApprovedCheckToday} requiresSafetyCheck={isPostConstruction} contractValueCents={project.contractValueCents} />,
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
    ...(!isPostConstruction
      ? [
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
        ]
      : []),
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
                  canEdit={canEditPricingForRole}
                />
              </div>
            ),
          },
        ]
      : []),
    ...(project.segment === "REAL_ESTATE"
      ? [
          {
            label: "Pricing Package",
            content: (
              <div className="max-w-4xl">
                <RealEstatePricingPackageEditor
                  projectId={project.id}
                  initialPackage={project.pricingPackage}
                />
              </div>
            ),
          },
        ]
      : []),
    ...(isPostConstruction
      ? [
          {
            label: "Safety Checklist",
            content: (
              <ProjectSafetySection
                projectId={project.id}
                initialChecks={safetyCheckRows}
                defaultSupervisorName={project.supervisor ?? ""}
                employees={laborEmployees.map((e) => ({
                  id: e.id,
                  firstName: e.firstName,
                  lastName: e.lastName,
                }))}
              />
            ),
          },
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
    ...((project.segment === "REAL_ESTATE" || project.segment === "JANITORIAL_TURNOVER_REQUESTS")
      ? [
          {
            label: "Signing",
            content: (
              <ProjectSigningSection
                contracts={(project.contracts ?? []).map((c): ProjectContractItem => ({
                  id: c.id,
                  signingStatus: c.signingStatus,
                  customerEmail: c.customerEmail,
                  docusealSubmissionId: c.docusealSubmissionId,
                  signedAt: c.signedAt?.toISOString() ?? null,
                  signedDocumentUrl: c.signedDocumentUrl,
                }))}
              />
            ),
          },
        ]
      : []),
    ...(project.segment !== "JANITORIAL_TURNOVER_REQUESTS"
      ? [
    {
      label: "Quality Checks",
      content: (() => {
        const qcRows = qualityChecks.map((check) => ({
          id: check.id,
          label: check.turnoverRequest
            ? `${check.turnoverRequest.building.name} • ${check.turnoverRequest.requestType}${check.turnoverRequest.unitNumber ? ` • ${check.turnoverRequest.unitNumber}` : ""}`
            : check.project?.jobTitle ?? "—",
          supervisorName: check.supervisorName,
          pmApproval: check.pmApproval,
          evidencePhotoCount: Array.isArray(check.evidencePhotos) ? check.evidencePhotos.length : 0,
          notes: check.notes ?? null,
        }));
        return (
          <div className="space-y-4">
            <div className="flex justify-end">
              <NewQualityCheckForm defaultProjectId={project.id} defaultProjectTitle={project.jobTitle} />
            </div>
            <QualityChecksTable checks={qcRows} />
          </div>
        );
      })(),
    },
        ]
      : []),
  ];

  const tabs = isEmployee
    ? allTabs.filter((t) => t.label === "Labor" || t.label === "Checklist")
    : isSupervisor
    ? allTabs.filter((t) => t.label === "Labor" || t.label === "Checklist" || t.label === "Safety Checklist")
    : allTabs;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/erp/projects" className="text-xs text-pink-600 hover:underline">
          ← Projects
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <ProjectJobTitleEditor projectId={project.id} jobTitle={project.jobTitle} hubspotDealId={project.hubspotDealId} />
            {project.hubspotOwnerName && (
              <p className="mt-1 text-xs text-gray-500">
                Deal owner: <span className="font-medium text-gray-700">{project.hubspotOwnerName}</span>
                {project.hubspotOwnerEmail && (
                  <a href={`mailto:${project.hubspotOwnerEmail}`} className="ml-1 text-pink-600 hover:underline">
                    {project.hubspotOwnerEmail}
                  </a>
                )}
              </p>
            )}
            {canSeeCommission && (
              <ProjectCommissionOwnerEditor
                projectId={project.id}
                employees={commissionEligibleEmployees.map((e) => ({ id: e.id, firstName: e.firstName, lastName: e.lastName }))}
                commissionEmployeeId={project.commissionEmployeeId}
                autoMatchedEmployee={autoMatchedCommissionEmployee}
              />
            )}
          </div>
          {!isSupervisor && !isEmployee && <ProjectDeleteButton projectId={project.id} jobTitle={project.jobTitle} />}
        </div>
      </div>

      <DetailTabs tabs={tabs} />
    </div>
  );
}
