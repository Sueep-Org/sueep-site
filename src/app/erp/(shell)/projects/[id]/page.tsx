import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { centsToDollars } from "@/lib/erp/money";
import { ProjectDatesEditor } from "./ProjectDatesEditor";
import { ProjectManagerEditor } from "./ProjectManagerEditor";
import { ProjectLaborSection } from "./ProjectLaborSection";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function ProjectDetailPage({ params }: PageProps) {
  const { id } = await params;
  const [project, laborEmployees] = await Promise.all([
    prisma.project.findUnique({
      where: { id },
      include: {
        laborEntries: {
          orderBy: { workDate: "desc" },
          include: { employee: { select: { firstName: true, lastName: true } } },
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
      },
    }),
  ]);
  if (!project) notFound();

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
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">{project.jobTitle}</h1>
        {project.description ? <p className="mt-2 text-sm text-gray-500">{project.description}</p> : null}
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Project details</h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {meta.map((row) => (
            <div key={row.k}>
              <dt className="text-[10px] uppercase text-gray-500">{row.k}</dt>
              <dd className="text-sm text-gray-800">{row.v}</dd>
            </div>
          ))}
        </dl>
      </div>

      <ProjectManagerEditor
        projectId={project.id}
        supervisor={project.supervisor}
        employees={laborEmployees}
      />

      <ProjectDatesEditor
        projectId={project.id}
        projectDateIso={project.projectDate ? project.projectDate.toISOString() : null}
        projectEndDateIso={project.projectEndDate ? project.projectEndDate.toISOString() : null}
      />

      <ProjectLaborSection projectId={project.id} initialEntries={laborRows} employees={laborEmployees} />
    </div>
  );
}
