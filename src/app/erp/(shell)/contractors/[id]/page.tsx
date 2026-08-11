import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canViewSsn, canEditPayInfo } from "@/lib/erpAuth";
import { CONTRACTOR_MANUAL_SECTIONS, subFieldName } from "@/lib/erp/subcontractorQuestionnaire";
import { DetailTabs } from "@/app/erp/components/DetailTabs";
import { ContractSigningSection } from "@/app/erp/components/ContractSigningSection";
import { ContractorProfileEditor } from "./ContractorProfileEditor";
import { ContractorPaperworkPanel } from "./ContractorPaperworkPanel";
import { ContractorInfoLinkSection } from "./ContractorInfoLinkSection";
import { ContractorContactInfoSection } from "./ContractorContactInfoSection";
import { ContractorBankAccountSection } from "./ContractorBankAccountSection";
import { ContractorInsuranceSection } from "./ContractorInsuranceSection";
import { ContractorSsnSection } from "./ContractorSsnSection";
import { ContractorLaborSection } from "./ContractorLaborSection";
import { ContractorBackgroundCheckSection } from "./ContractorBackgroundCheckSection";
import { ContractorTimeOffSection } from "./ContractorTimeOffSection";
import { ContractorApplicationLinkSection } from "./ContractorApplicationLinkSection";
import { ContractorQuestionnaireCard } from "./ContractorQuestionnaireCard";
import { CONTRACTOR_LABOR_PAGE_SIZE } from "./laborPagination";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PageProps = { params: Promise<{ id: string }> };

export default async function ContractorDetailPage({ params }: PageProps) {
  const { id } = await params;
  const contractor = await prisma.contractor.findUnique({
    where: { id },
    include: {
      contracts: { orderBy: { createdAt: "asc" } },
      backgroundCheckEvents: { orderBy: { createdAt: "desc" } },
      timeOff: { orderBy: { startDate: "desc" } },
      documents: {
        where: { label: "Workers Comp COI" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, filename: true },
      },
      candidateApplication: {
        select: { id: true, fullName: true, email: true, phone: true, positionInterest: true, responses: true },
      },
    },
  });
  if (!contractor) notFound();

  const auth = await getErpAuth();
  const canSeeSsn = canViewSsn(auth?.role ?? "EMPLOYEE");
  const canSeePay = canEditPayInfo(auth?.role ?? "EMPLOYEE");

  // Company profile / Insurance / Licensing each read from whichever of
  // these is available: the linked application's answers (read-only, see
  // ContractorApplicationLinkSection) or Contractor.manualApplicationInfo
  // (editable) when nothing is linked — never both, so no section duplicates
  // what another already shows.
  const linkedResponses = contractor.candidateApplication
    ? ((contractor.candidateApplication.responses ?? {}) as Record<string, unknown>)
    : null;
  const manualInfo = (contractor.manualApplicationInfo ?? {}) as Record<string, unknown>;
  function manualValuesFor(sectionId: string): Record<string, string> {
    const fields = CONTRACTOR_MANUAL_SECTIONS.find((s) => s.id === sectionId)?.fields ?? [];
    const out: Record<string, string> = {};
    for (const field of fields) {
      const v = manualInfo[subFieldName(field.key)];
      out[subFieldName(field.key)] = typeof v === "string" ? v : "";
    }
    return out;
  }
  const companyFields = CONTRACTOR_MANUAL_SECTIONS.find((s) => s.id === "company")?.fields ?? [];
  const insuranceQuestionnaireFields = CONTRACTOR_MANUAL_SECTIONS.find((s) => s.id === "insurance")?.fields ?? [];
  const licensingFields = CONTRACTOR_MANUAL_SECTIONS.find((s) => s.id === "licensing")?.fields ?? [];

  // Only offered as link candidates if they're (a) a subcontractor
  // application and (b) not already claimed by some other contractor —
  // the DB-level unique constraint on Contractor.candidateApplicationId is
  // the real guarantee, this just keeps the picker from offering dead ends.
  const linkableApplications = await prisma.candidateApplication.findMany({
    where: {
      responses: { path: ["sub_isSubcontractor"], equals: "Yes" },
      contractor: null,
    },
    select: { id: true, fullName: true, email: true },
    orderBy: { createdAt: "desc" },
  });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://sueep.com";
  const resendConfigured = Boolean(process.env.RESEND_API_KEY);

  const paperwork = (contractor.paperwork ?? []) as { label: string; url: string }[];

  // A contractor's work lives in two tables, same split as Employee's
  // LaborEntry vs ProjectChangeOrderLaborer: ContractorAssignment for
  // project/building-level work, ChangeOrderContractorAssignment for CO
  // work. Fetched in full and merged here, same as /api/erp/contractor-labor
  // does for subsequent pages, so the initial load and "Load more" agree on
  // ordering.
  const [assignments, coAssignments, laborProjectGroups, coProjectRows] = await Promise.all([
    prisma.contractorAssignment.findMany({
      where: { contractorId: contractor.id },
      select: {
        id: true,
        projectId: true,
        role: true,
        startDate: true,
        endDate: true,
        assignedDate: true,
        costCents: true,
        taskDescription: true,
        createdAt: true,
        project: { select: { id: true, jobTitle: true } },
        building: { select: { id: true, name: true } },
      },
    }),
    prisma.changeOrderContractorAssignment.findMany({
      where: { contractorId: contractor.id },
      select: {
        id: true,
        role: true,
        startDate: true,
        endDate: true,
        assignedDate: true,
        costCents: true,
        notes: true,
        createdAt: true,
        changeOrder: { select: { id: true, title: true, project: { select: { id: true, jobTitle: true } } } },
      },
    }),
    prisma.contractorAssignment.groupBy({ by: ["projectId"], where: { contractorId: contractor.id, projectId: { not: null } } }),
    prisma.changeOrderContractorAssignment.findMany({
      where: { contractorId: contractor.id },
      select: { changeOrder: { select: { projectId: true } } },
      distinct: ["changeOrderId"],
    }),
  ]);

  const laborProjectIds = new Set([
    ...laborProjectGroups.map((g) => g.projectId).filter((pid): pid is string => pid != null),
    ...coProjectRows.map((r) => r.changeOrder.projectId),
  ]);
  const laborProjects = laborProjectIds.size
    ? await prisma.project.findMany({
        where: { id: { in: Array.from(laborProjectIds) } },
        select: { id: true, jobTitle: true },
        orderBy: { jobTitle: "asc" },
      })
    : [];

  const combinedLaborRows = [
    ...assignments.map((a) => ({
      id: a.id,
      source: "PROJECT" as const,
      projectId: a.project?.id ?? null,
      projectTitle: a.project?.jobTitle ?? null,
      buildingName: a.building?.name ?? null,
      changeOrderTitle: null as string | null,
      role: a.role,
      date: a.startDate ?? a.assignedDate,
      endDate: a.endDate,
      costCents: a.costCents,
      taskDescription: a.taskDescription,
      createdAt: a.createdAt,
    })),
    ...coAssignments.map((a) => ({
      id: a.id,
      source: "CHANGE_ORDER" as const,
      projectId: a.changeOrder.project.id,
      projectTitle: a.changeOrder.project.jobTitle,
      buildingName: null as string | null,
      changeOrderTitle: a.changeOrder.title,
      role: a.role,
      date: a.startDate ?? a.assignedDate,
      endDate: a.endDate,
      costCents: a.costCents,
      taskDescription: a.notes,
      createdAt: a.createdAt,
    })),
  ].sort((a, b) => {
    const dateDiff = (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0);
    return dateDiff !== 0 ? dateDiff : b.createdAt.getTime() - a.createdAt.getTime();
  });
  const assignmentTotalCount = combinedLaborRows.length;

  const laborRows = combinedLaborRows.slice(0, CONTRACTOR_LABOR_PAGE_SIZE).map((a) => ({
    id: a.id,
    source: a.source,
    projectId: a.projectId,
    projectTitle: a.projectTitle,
    buildingName: a.buildingName,
    changeOrderTitle: a.changeOrderTitle,
    role: a.role,
    date: a.date?.toISOString() ?? null,
    endDate: a.endDate?.toISOString() ?? null,
    costCents: a.costCents,
    taskDescription: a.taskDescription,
  }));
  const initialLaborHasMore = assignmentTotalCount > CONTRACTOR_LABOR_PAGE_SIZE;

  return (
    <div className="space-y-4">
      <div>
        <Link href="/erp/contractors" className="text-xs text-pink-600 hover:underline">
          ← Contractor Verification
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">{contractor.name}</h1>
        <p className="mt-1 text-sm text-gray-500">Contractor profile, document verification, and information collection.</p>
        <div className="mt-3">
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
              contractor.status === "ACTIVE"
                ? "bg-emerald-100 text-emerald-700"
                : "bg-gray-100 text-gray-500"
            }`}
          >
            {contractor.status === "ACTIVE" ? "Active" : "Inactive"}
          </span>
        </div>
      </div>

      <DetailTabs tabs={[
        {
          label: "General Info",
          content: (
            <div className="space-y-6">
              <ContractorProfileEditor
                contractorId={contractor.id}
                initial={{
                  name: contractor.name,
                  email: contractor.email,
                  status: contractor.status,
                }}
              />

              <ContractorApplicationLinkSection
                contractorId={contractor.id}
                linkedApplication={
                  contractor.candidateApplication
                    ? {
                        id: contractor.candidateApplication.id,
                        fullName: contractor.candidateApplication.fullName,
                        email: contractor.candidateApplication.email,
                        phone: contractor.candidateApplication.phone,
                        positionInterest: contractor.candidateApplication.positionInterest,
                        responses: linkedResponses ?? {},
                      }
                    : null
                }
                linkableApplications={linkableApplications}
              />

              <ContractorQuestionnaireCard
                contractorId={contractor.id}
                title="Company profile"
                fields={companyFields}
                linkedResponses={linkedResponses}
                manualInitial={manualValuesFor("company")}
              />
            </div>
          ),
        },
        {
          label: "Personal & Documents",
          content: (
            <div className="space-y-6">
              <ContractorInfoLinkSection
                id={contractor.id}
                email={contractor.email}
                infoToken={contractor.infoToken}
                infoTokenExpiry={contractor.infoTokenExpiry?.toISOString() ?? null}
                resendConfigured={resendConfigured}
                siteUrl={siteUrl}
              />

              <ContractorContactInfoSection
                contractorId={contractor.id}
                initial={{
                  contractorFullName: contractor.contractorFullName,
                  phone: contractor.phone,
                  address: contractor.address,
                  dateOfBirth: contractor.dateOfBirth,
                }}
              />

              {canSeePay && (
                <ContractorBankAccountSection
                  contractorId={contractor.id}
                  initial={{
                    bankAccountType: contractor.bankAccountType,
                    bankAccountNumber: contractor.bankAccountNumber,
                    bankRoutingNumber: contractor.bankRoutingNumber,
                  }}
                />
              )}

              {canSeeSsn && <ContractorSsnSection contractorId={contractor.id} hasSsn={!!contractor.ssn} />}

              <ContractorInsuranceSection
                contractorId={contractor.id}
                initial={{
                  hasInsurance: contractor.hasInsurance,
                  workersCompCarrier: contractor.workersCompCarrier,
                  workersCompPolicyNumber: contractor.workersCompPolicyNumber,
                  workersCompExpiresAt: contractor.workersCompExpiresAt?.toISOString() ?? null,
                }}
                workersCompDoc={contractor.documents[0] ?? null}
                questionnaireFields={insuranceQuestionnaireFields}
                linkedResponses={linkedResponses}
                manualInitial={manualValuesFor("insurance")}
              />

              <ContractorQuestionnaireCard
                contractorId={contractor.id}
                title="Licensing"
                fields={licensingFields}
                linkedResponses={linkedResponses}
                manualInitial={manualValuesFor("licensing")}
              />

              <section className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
                <h3 className="text-sm font-semibold text-gray-700">Documents</h3>
                <ContractorPaperworkPanel
                  id={contractor.id}
                  email={contractor.email}
                  paperwork={paperwork}
                  paperworkUploadToken={contractor.paperworkUploadToken}
                  paperworkUploadTokenExpiry={
                    contractor.paperworkUploadTokenExpiry?.toISOString() ?? null
                  }
                  resendConfigured={resendConfigured}
                  siteUrl={siteUrl}
                />
              </section>

              <ContractorBackgroundCheckSection
                contractorId={contractor.id}
                initialBackgroundCheckStatus={(contractor.backgroundCheckStatus ?? "NOT_DONE") as "PASSED" | "FAILED" | "PENDING" | "NOT_DONE"}
                initialBackgroundCheckedAt={contractor.backgroundCheckedAt ? contractor.backgroundCheckedAt.toISOString() : null}
                initialBackgroundCheckExpiresAt={contractor.backgroundCheckExpiresAt ? contractor.backgroundCheckExpiresAt.toISOString() : null}
                initialBackgroundCheckProvider={contractor.backgroundCheckProvider}
                initialBackgroundCheckNotes={contractor.backgroundCheckNotes}
                initialBackgroundCheckConsentAt={contractor.backgroundCheckConsentAt ? contractor.backgroundCheckConsentAt.toISOString() : null}
                initialBackgroundCheckEvents={contractor.backgroundCheckEvents.map((e) => ({
                  id: e.id,
                  createdAt: e.createdAt.toISOString(),
                  previousStatus: e.previousStatus,
                  newStatus: e.newStatus,
                  changedBy: e.changedBy,
                }))}
              />
            </div>
          ),
        },
        {
          label: "Time Off",
          content: (
            <ContractorTimeOffSection
              contractorId={contractor.id}
              initialTimeOff={contractor.timeOff.map((t) => ({
                id: t.id,
                startDate: t.startDate.toISOString(),
                endDate: t.endDate.toISOString(),
                type: t.type as "VACATION" | "SICK" | "HALF_DAY" | "UNPAID" | "OTHER",
                notes: t.notes,
              }))}
            />
          ),
        },
        {
          label: "Labor",
          content: (
            <ContractorLaborSection
              contractorId={contractor.id}
              initialEntries={laborRows}
              initialHasMore={initialLaborHasMore}
              projectOptions={laborProjects}
            />
          ),
        },
        {
          label: "Signing",
          content: (
            <ContractSigningSection
              apiBasePath={`/api/erp/contractors/${contractor.id}`}
              initialContracts={contractor.contracts.map((c) => ({
                id: c.id,
                contractPdfFilename: c.contractPdfFilename,
                docusealTemplateId: c.docusealTemplateId,
                signingStatus: c.signingStatus,
                signerEmail: c.signerEmail,
                signedAt: c.signedAt?.toISOString() ?? null,
                signedDocumentUrl: c.signedDocumentUrl,
              }))}
            />
          ),
        },
      ]} />
    </div>
  );
}
