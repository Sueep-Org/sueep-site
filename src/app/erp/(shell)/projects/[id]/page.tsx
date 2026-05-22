import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { centsToDollars } from "@/lib/erp/money";
import { parseHubSpotPipelineStageMap } from "@/lib/hubspot/pipelineStages";
import { ProjectBillingEditor } from "./ProjectBillingEditor";
import { ProjectDatesEditor } from "./ProjectDatesEditor";
import { ProjectManagerEditor } from "./ProjectManagerEditor";
import { ProjectServiceTypeEditor } from "./ProjectServiceTypeEditor";
import { ProjectPricePackageEditor } from "./ProjectPricePackageEditor";
import { ProjectLaborSection } from "./ProjectLaborSection";
import { ProjectLaborAssignmentsSection } from "./ProjectLaborAssignmentsSection";
import { ProjectContractorSection } from "./ProjectContractorSection";
import { ProjectWorkflowEditor } from "./ProjectWorkflowEditor";
import { ProjectDeleteButton } from "./ProjectDeleteButton";
import { ProjectChangeOrdersSection } from "./ProjectChangeOrdersSection";
import { ProjectContractEditor } from "./ProjectContractEditor";
import { CollapsiblePanel } from "@/app/erp/components/CollapsiblePanel";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function ProjectDetailPage({ params }: PageProps) {
  const { id } = await params;
  const cfg = parseHubSpotPipelineStageMap();
  const [project, laborEmployees, contractors, changeOrders] = await Promise.all([
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
        laborAssignments: {
          orderBy: { createdAt: "desc" },
          include: { employee: { select: { id: true, firstName: true, lastName: true, status: true } } },
        },
      },
    }),
    prisma.employee.findMany({
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        hourlyPayCents: true,
        status: true,
        email: true,
      },
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
  ]);
  if (!project) notFound();

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
    employeeName: e.employee
      ? `${e.employee.firstName} ${e.employee.lastName}`.trim() || null
      : null,
    workDate: e.workDate.toISOString(),
    workerName: e.workerName,
    role: e.role,
    hours: e.hours.toString(),
    hourlyRateCents: e.hourlyRateCents,
    taskDescription: e.taskDescription,
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
    laborers: (co.laborers ?? []).map((l) => ({
      id: l.id,
      employeeId: l.employeeId,
      name: l.name,
      role: l.role,
    })),
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
  }));

  const laborAssignmentRows = project.laborAssignments.map((a) => ({
    id: a.id,
    employeeId: a.employeeId,
    employeeName: `${a.employee.firstName} ${a.employee.lastName}`.trim(),
    role: a.role,
    assignedDate: a.assignedDate ? a.assignedDate.toISOString() : null,
    startDate: a.startDate ? a.startDate.toISOString() : null,
    endDate: a.endDate ? a.endDate.toISOString() : null,
    notes: a.notes,
  }));

  const meta = [
    { k: "Segment", v: project.segment },
    { k: "Status", v: project.status },
    { k: "Supervisor", v: project.supervisor || "—" },
    { k: "Start date", v: project.projectDate ? project.projectDate.toLocaleDateString() : "—" },
    { k: "Target end", v: project.projectEndDate ? project.projectEndDate.toLocaleDateString() : "—" },
    { k: "% done", v: `${project.percentDone}%` },
    { k: "% invoiced", v: `${project.percentInvoiced}%` },
    { k: "Contract", v: centsToDollars(project.contractValueCents) },
    { k: "Est. material", v: centsToDollars(project.estMaterialCents) },
    { k: "Est. travel", v: centsToDollars(project.estTravelCents) },
    { k: "Est. labor", v: centsToDollars(project.estLaborCents) },
    { k: "Actual labor", v: centsToDollars(project.actualLaborCents) },
    { k: "Actual material", v: centsToDollars(project.actualMaterialCents) },
    { k: "Est. hours", v: project.estHours?.toString() ?? "—" },
    { k: "Actual hours", v: project.actualHours?.toString() ?? "—" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <Link href="/erp/projects" className="text-xs text-pink-600 hover:underline">
          ← Projects
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold text-gray-900">{project.jobTitle}</h1>
          <ProjectDeleteButton projectId={project.id} />
        </div>
      </div>

      <CollapsiblePanel title="Project Details">
        <ProjectPricePackageEditor
          projectId={project.id}
          description={project.description}
          contractValueCents={project.contractValueCents}
        />
        {project.description ? (
          <div className="mb-4 rounded-md border border-gray-200 bg-gray-50 p-3">
            <p className="text-[10px] uppercase text-gray-500">Submitted details</p>
            <p className="mt-1 whitespace-pre-line text-sm text-gray-800">{project.description}</p>
          </div>
        ) : null}
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {meta.map((row) => (
            <div key={row.k}>
              <dt className="text-[10px] uppercase text-gray-500">{row.k}</dt>
              <dd className="text-sm text-gray-800">{row.v}</dd>
            </div>
          ))}
        </dl>
      </CollapsiblePanel>

      <CollapsiblePanel title="Workflow" defaultOpen={false}>
        <ProjectWorkflowEditor
          projectId={project.id}
          status={project.status}
          projectDateIso={project.projectDate ? project.projectDate.toISOString() : null}
          segment={project.segment}
          hubspotPipelineId={project.hubspotPipelineId ?? null}
          isManual={isManual}
          pipelineOptions={pipelineOptions}
        />
      </CollapsiblePanel>

      <CollapsiblePanel title="Manager" defaultOpen={false}>
        <ProjectManagerEditor
          projectId={project.id}
          supervisor={project.supervisor}
          employees={laborEmployees}
        />
      </CollapsiblePanel>

      {project.segment !== "JANITORIAL_TURNOVER_REQUESTS" ? (
        <CollapsiblePanel title="Service Type" defaultOpen={false}>
          <ProjectServiceTypeEditor projectId={project.id} description={project.description} />
        </CollapsiblePanel>
      ) : null}

      <CollapsiblePanel title="Contract" defaultOpen={false}>
        <ProjectContractEditor projectId={project.id} contractValueCents={project.contractValueCents} />
      </CollapsiblePanel>

      <CollapsiblePanel title="Billing" defaultOpen={false}>
        <ProjectBillingEditor
          projectId={project.id}
          percentInvoiced={project.percentInvoiced}
          billingStatus={project.billingStatus}
        />
      </CollapsiblePanel>

      <CollapsiblePanel title="Dates" defaultOpen={false}>
        <ProjectDatesEditor
          projectId={project.id}
          projectDateIso={project.projectDate ? project.projectDate.toISOString() : null}
          projectEndDateIso={project.projectEndDate ? project.projectEndDate.toISOString() : null}
        />
      </CollapsiblePanel>

      <CollapsiblePanel title="Labor" defaultOpen={false}>
        <ProjectLaborSection projectId={project.id} initialEntries={laborRows} employees={laborEmployees} />
      </CollapsiblePanel>

      <CollapsiblePanel title="Assign Laborers" defaultOpen={false}>
        <ProjectLaborAssignmentsSection
          projectId={project.id}
          initialAssignments={laborAssignmentRows}
          employees={laborEmployees}
        />
      </CollapsiblePanel>

      <CollapsiblePanel title="Contractors" defaultOpen={false}>
        <ProjectContractorSection
          projectId={project.id}
          initialAssignments={contractorRows}
          contractors={contractors}
        />
      </CollapsiblePanel>

      {isPostConstruction ? (
        <CollapsiblePanel title="Change Orders" defaultOpen={false}>
          <ProjectChangeOrdersSection projectId={project.id} initialEntries={changeOrderRows} />
        </CollapsiblePanel>
      ) : null}
    </div>
  );
}
