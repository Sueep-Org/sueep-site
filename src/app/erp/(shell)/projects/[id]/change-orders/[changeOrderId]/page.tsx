import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getErpAuth } from "@/lib/erpAuth";
import { ChangeOrderDetailEditor } from "./ChangeOrderDetailEditor";
import { ChangeOrderSigningSection, type ContractItem } from "./ChangeOrderSigningSection";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string; changeOrderId: string }> };

export default async function ChangeOrderDetailPage({ params }: PageProps) {
  const { id, changeOrderId } = await params;
  const auth = await getErpAuth();
  const isSupervisor = auth?.role === "SUPERVISOR";
  const isEmployee = auth?.role === "EMPLOYEE";

  const [changeOrder, project, employees, contracts, materialEntries, safetyChecks] = await Promise.all([
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
    prisma.changeOrderMaterialEntry.findMany({
      where: { changeOrderId },
      orderBy: { usedOn: "desc" },
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
  ]);

  if (!changeOrder || !project) notFound();

  const todayDateStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
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
  const hasApprovedCheckToday = safetyChecks.some((check) => {
    const checkStr = check.checkDate.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    return checkStr === todayDateStr && check.approvedForWork;
  });

  const computedLaborCents = changeOrder.laborers.reduce(
    (s, l) => s + Math.round(l.hours * l.hourlyRateCents),
    0,
  );
  const computedMaterialCents = materialEntries.reduce((s, e) => s + e.costCents, 0);

  const data = {
    id: changeOrder.id,
    createdAt: changeOrder.createdAt.toISOString(),
    completedAt: changeOrder.completedAt?.toISOString() ?? null,
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
    estHours: changeOrder.estHours,
    actualHours: changeOrder.actualHours,
    estLaborers: changeOrder.estLaborers,
    estSupervisors: changeOrder.estSupervisors,
    computedLaborCents,
    computedMaterialCents,
    materialEntries: materialEntries.map((e) => ({
      id: e.id,
      usedOn: e.usedOn.toISOString(),
      category: e.category,
      itemName: e.itemName,
      quantity: e.quantity,
      unit: e.unit,
      costCents: e.costCents,
      notes: e.notes,
    })),
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
      completed: l.completed ?? false,
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
        isSupervisor={isSupervisor}
        isEmployee={isEmployee}
        safetyChecks={safetyCheckRows}
        safetyPassedKeys={safetyPassedKeysArr}
        hasApprovedCheckToday={hasApprovedCheckToday}
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
