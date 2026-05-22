import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ChangeOrderDetailEditor } from "./ChangeOrderDetailEditor";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string; changeOrderId: string }> };

export default async function ChangeOrderDetailPage({ params }: PageProps) {
  const { id, changeOrderId } = await params;

  const [changeOrder, project, employees] = await Promise.all([
    prisma.projectChangeOrder.findFirst({
      where: { id: changeOrderId, projectId: id },
      include: { laborers: { orderBy: { createdAt: "asc" } } },
    }),
    prisma.project.findUnique({
      where: { id },
      select: { id: true, jobTitle: true },
    }),
    prisma.employee.findMany({
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true, email: true, status: true, hourlyPayCents: true },
    }),
  ]);

  if (!changeOrder || !project) notFound();

  const data = {
    id: changeOrder.id,
    createdAt: changeOrder.createdAt.toISOString(),
    title: changeOrder.title,
    description: changeOrder.description,
    requestedBy: changeOrder.requestedBy,
    supervisor: changeOrder.supervisor,
    status: changeOrder.status as "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "VOID",
    billingStatus: changeOrder.billingStatus,
    estimatedCostCents: changeOrder.estimatedCostCents,
    estimatedDays: changeOrder.estimatedDays,
    laborers: changeOrder.laborers.map((l) => ({
      id: l.id,
      employeeId: l.employeeId,
      name: l.name,
      role: l.role,
      workDate: l.workDate.toISOString(),
      hours: l.hours,
      hourlyRateCents: l.hourlyRateCents,
      taskDescription: l.taskDescription,
    })),
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 sm:px-0">
      <ChangeOrderDetailEditor
        projectId={id}
        projectTitle={project.jobTitle}
        data={data}
        employees={employees}
      />
    </div>
  );
}
