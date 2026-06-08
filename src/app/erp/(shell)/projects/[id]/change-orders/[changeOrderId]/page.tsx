import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ChangeOrderDetailEditor } from "./ChangeOrderDetailEditor";
import { ChangeOrderSigningSection, type ContractItem } from "./ChangeOrderSigningSection";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string; changeOrderId: string }> };

export default async function ChangeOrderDetailPage({ params }: PageProps) {
  const { id, changeOrderId } = await params;

  const [changeOrder, project, employees, contracts] = await Promise.all([
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
      select: { id: true, firstName: true, lastName: true, email: true, status: true, hourlyPayCents: true, role: true },
    }),
    prisma.changeOrderContract.findMany({
      where: { changeOrderId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        contractPdfFilename: true,
        docusealTemplateId: true,
        signingStatus: true,
        customerEmail: true,
        signedAt: true,
        signedDocumentUrl: true,
      },
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
    status: changeOrder.status as "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "VOID" | "BILLING",
    billingStatus: changeOrder.billingStatus,
    percentInvoiced: changeOrder.percentInvoiced,
    estimatedCostCents: changeOrder.estimatedCostCents,
    estimatedDays: changeOrder.estimatedDays,
    contractValueCents: changeOrder.contractValueCents,
    estMaterialCents: changeOrder.estMaterialCents,
    estTravelCents: changeOrder.estTravelCents,
    estLaborCents: changeOrder.estLaborCents,
    actualLaborCents: changeOrder.actualLaborCents,
    actualMaterialCents: changeOrder.actualMaterialCents,
    actualTravelCents: changeOrder.actualTravelCents,
    laborers: changeOrder.laborers.map((l) => ({
      id: l.id,
      employeeId: l.employeeId,
      name: l.name,
      role: l.role,
      workDate: l.workDate.toISOString(),
      hours: l.hours,
      hourlyRateCents: l.hourlyRateCents,
      taskDescription: l.taskDescription,
      qualityRating: l.qualityRating ?? null,
      qualityNotes: l.qualityNotes ?? null,
    })),
  };

  const initialContracts: ContractItem[] = contracts.map((c) => ({
    id: c.id,
    contractPdfFilename: c.contractPdfFilename,
    docusealTemplateId: c.docusealTemplateId,
    signingStatus: c.signingStatus,
    customerEmail: c.customerEmail,
    signedAt: c.signedAt?.toISOString() ?? null,
    signedDocumentUrl: c.signedDocumentUrl,
  }));

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 sm:px-0">
      <ChangeOrderDetailEditor
        projectId={id}
        projectTitle={project.jobTitle}
        data={data}
        employees={employees}
        signingContent={
          <ChangeOrderSigningSection
            projectId={id}
            changeOrderId={changeOrderId}
            initialContracts={initialContracts}
          />
        }
      />
    </div>
  );
}
