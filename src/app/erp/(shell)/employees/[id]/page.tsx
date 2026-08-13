import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { complianceBadgeClasses, complianceLabel, evaluateEmployeeCompliance } from "@/lib/erp/employees";
import { DetailTabs } from "@/app/erp/components/DetailTabs";
import { ContractSigningSection } from "@/app/erp/components/ContractSigningSection";
import { CollapsibleSection } from "@/app/erp/components/CollapsibleSection";
import { maskAccountNumber } from "@/lib/erp/maskAccountNumber";
import { EmployeeProfileEditor } from "./EmployeeProfileEditor";
import { EmployeeDocumentsSection } from "./EmployeeDocumentsSection";
import { EmployeeInfoLinkSection } from "./EmployeeInfoLinkSection";
import { EmployeeBankAccountSection } from "./EmployeeBankAccountSection";
import { EmployeeSsnSection } from "./EmployeeSsnSection";
import { EmployeeLaborSection } from "./EmployeeLaborSection";
import { EmployeeTimeOffSection } from "./EmployeeTimeOffSection";
import { ConvertToContractorButton } from "./ConvertToContractorButton";
import { LABOR_PAGE_SIZE } from "./laborPagination";
import { getErpAuth, canEditPayInfo, canViewSsn } from "@/lib/erpAuth";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

function parseRequiredDocuments(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

export default async function EmployeeDetailPage({ params }: PageProps) {
  const { id } = await params;
  const auth = await getErpAuth();
  const canSeePay = canEditPayInfo(auth?.role ?? "EMPLOYEE");
  const canSeeSsn = canViewSsn(auth?.role ?? "EMPLOYEE");
  const employee = await prisma.employee.findUnique({
    where: { id },
    include: {
      documents: { orderBy: [{ expiresAt: "asc" }, { createdAt: "desc" }] },
      contracts: { orderBy: { createdAt: "asc" } },
      backgroundCheckEvents: { orderBy: { createdAt: "desc" } },
      timeOff: { orderBy: { startDate: "desc" } },
      contractor: { select: { id: true } },
    },
  });
  if (!employee) notFound();

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://sueep.com";
  const resendConfigured = Boolean(process.env.RESEND_API_KEY);

  const requiredDocuments = parseRequiredDocuments(employee.requiredDocuments);
  const compliance = evaluateEmployeeCompliance(employee.status, requiredDocuments, employee.documents);

  // Collapsed-by-default status lines for the Personal & Documents cards —
  // see CollapsibleSection. Anything empty/needing attention defaults open,
  // everything else stays collapsed so the tab is scannable instead of a
  // wall of always-expanded forms.
  const hasAnySelfReportedInfo = Boolean(employee.address || employee.dateOfBirth || employee.ssn || employee.bankAccountNumber);
  const infoLinkExpired = employee.infoTokenExpiry ? employee.infoTokenExpiry < new Date() : true;
  const infoLinkStatus = hasAnySelfReportedInfo
    ? "Info collected"
    : employee.infoToken && !infoLinkExpired
      ? "Link sent, not yet completed"
      : "Not sent yet";
  const infoLinkTone = hasAnySelfReportedInfo ? "complete" : employee.infoToken && !infoLinkExpired ? "neutral" : "empty";

  const documentsStatus = `${complianceLabel(compliance)} · ${employee.documents.length} document${employee.documents.length === 1 ? "" : "s"}`;
  const documentsTone = compliance === "COMPLIANT" ? "complete" : compliance === "NON_COMPLIANT" ? "warning" : "neutral";

  const ssnStatus = employee.ssn ? "On file" : "Not set";
  const ssnTone = employee.ssn ? "complete" : "empty";

  const bankStatus = employee.bankAccountNumber
    ? `${employee.bankAccountType === "savings" ? "Savings" : "Checking"} · ${maskAccountNumber(employee.bankAccountNumber)}`
    : "Not set";
  const bankTone = employee.bankAccountNumber ? "complete" : "empty";

  const [initialLaborEntries, initialChangeOrderEntries, laborProjectGroups, changeOrderProjectRows] =
    await Promise.all([
      prisma.laborEntry.findMany({
        where: { employeeId: employee.id },
        orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
        take: LABOR_PAGE_SIZE + 1,
        select: {
          id: true,
          projectId: true,
          workDate: true,
          createdAt: true,
          role: true,
          hours: true,
          hourlyRateCents: true,
          taskDescription: true,
          project: { select: { jobTitle: true } },
        },
      }),
      prisma.projectChangeOrderLaborer.findMany({
        where: { employeeId: employee.id },
        orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
        take: LABOR_PAGE_SIZE + 1,
        select: {
          id: true,
          workDate: true,
          createdAt: true,
          role: true,
          hours: true,
          hourlyRateCents: true,
          taskDescription: true,
          changeOrder: { select: { title: true, project: { select: { id: true, jobTitle: true } } } },
        },
      }),
      prisma.laborEntry.groupBy({ by: ["projectId"], where: { employeeId: employee.id } }),
      prisma.projectChangeOrderLaborer.findMany({
        where: { employeeId: employee.id },
        select: { changeOrder: { select: { projectId: true } } },
        distinct: ["changeOrderId"],
      }),
    ]);
  const laborProjectIds = new Set([
    ...laborProjectGroups.map((g) => g.projectId),
    ...changeOrderProjectRows.map((r) => r.changeOrder.projectId),
  ]);
  const laborProjects = laborProjectIds.size
    ? await prisma.project.findMany({
        where: { id: { in: Array.from(laborProjectIds) } },
        select: { id: true, jobTitle: true },
        orderBy: { jobTitle: "asc" },
      })
    : [];
  const combinedLaborEntries = [
    ...initialLaborEntries.map((e) => ({
      id: e.id,
      source: "PROJECT" as const,
      projectId: e.projectId,
      projectTitle: e.project.jobTitle,
      changeOrderTitle: null as string | null,
      workDate: e.workDate,
      createdAt: e.createdAt,
      role: e.role,
      hours: e.hours,
      hourlyRateCents: e.hourlyRateCents,
      taskDescription: e.taskDescription,
    })),
    ...initialChangeOrderEntries.map((e) => ({
      id: e.id,
      source: "CHANGE_ORDER" as const,
      projectId: e.changeOrder.project.id,
      projectTitle: e.changeOrder.project.jobTitle,
      changeOrderTitle: e.changeOrder.title,
      workDate: e.workDate,
      createdAt: e.createdAt,
      role: e.role,
      hours: e.hours,
      hourlyRateCents: e.hourlyRateCents,
      taskDescription: e.taskDescription,
    })),
  ].sort((a, b) => {
    const diff = b.workDate.getTime() - a.workDate.getTime();
    return diff !== 0 ? diff : b.createdAt.getTime() - a.createdAt.getTime();
  });
  const initialLaborHasMore = combinedLaborEntries.length > LABOR_PAGE_SIZE;
  const laborEntryRows = combinedLaborEntries.slice(0, LABOR_PAGE_SIZE).map((e) => ({
    id: e.id,
    source: e.source,
    projectId: e.projectId,
    projectTitle: e.projectTitle,
    changeOrderTitle: e.changeOrderTitle,
    workDate: e.workDate.toISOString(),
    role: e.role,
    hours: e.hours,
    hourlyRateCents: e.hourlyRateCents,
    taskDescription: e.taskDescription,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/erp/employees" className="text-xs text-pink-600 hover:underline">
            ← Employees
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-gray-900">
            {employee.firstName} {employee.lastName}
          </h1>
          <p className="mt-1 text-sm text-gray-500">General employee profile, compliance status, and documentation.</p>
          <div className="mt-3">
            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${complianceBadgeClasses(compliance)}`}>
              {complianceLabel(compliance)}
            </span>
          </div>
        </div>
        <ConvertToContractorButton
          employeeId={employee.id}
          fullName={`${employee.firstName} ${employee.lastName}`.trim()}
          existingContractorId={employee.contractor?.id ?? null}
        />
      </div>

      <DetailTabs tabs={[
        {
          label: "General Info",
          content: (
            <EmployeeProfileEditor
              employeeId={employee.id}
              canSeePay={canSeePay}
              initial={{
                firstName: employee.firstName,
                lastName: employee.lastName,
                email: employee.email,
                phone: employee.phone,
                address: employee.address,
                dateOfBirth: employee.dateOfBirth,
                role: employee.role,
                payType: employee.payType,
                hourlyPayCents: employee.hourlyPayCents,
                annualSalaryCents: employee.annualSalaryCents,
                status: employee.status,
                hireDate: employee.hireDate ? employee.hireDate.toISOString() : null,
                notes: employee.notes,
                isOffshore: employee.isOffshore,
                offshoreMonthlyRateCents: employee.offshoreMonthlyRateCents,
              }}
            />
          ),
        },
        {
          label: "Personal & Documents",
          content: (
            <div className="space-y-4">
              <CollapsibleSection title="Info form link" status={infoLinkStatus} tone={infoLinkTone} defaultOpen={infoLinkTone === "empty"}>
                <EmployeeInfoLinkSection
                  id={employee.id}
                  email={employee.email}
                  infoToken={employee.infoToken}
                  infoTokenExpiry={employee.infoTokenExpiry?.toISOString() ?? null}
                  resendConfigured={resendConfigured}
                  siteUrl={siteUrl}
                />
              </CollapsibleSection>

              <CollapsibleSection title="Documents & Background Check" status={documentsStatus} tone={documentsTone} defaultOpen={documentsTone === "warning"}>
                <EmployeeDocumentsSection
                  employeeId={employee.id}
                  initialRequiredDocuments={requiredDocuments}
                  initialBackgroundCheckStatus={(employee.backgroundCheckStatus ?? "NOT_DONE") as "PASSED" | "FAILED" | "PENDING" | "NOT_DONE"}
                  initialBackgroundCheckedAt={employee.backgroundCheckedAt ? employee.backgroundCheckedAt.toISOString() : null}
                  initialBackgroundCheckExpiresAt={employee.backgroundCheckExpiresAt ? employee.backgroundCheckExpiresAt.toISOString() : null}
                  initialBackgroundCheckProvider={employee.backgroundCheckProvider}
                  initialBackgroundCheckNotes={employee.backgroundCheckNotes}
                  initialBackgroundCheckConsentAt={employee.backgroundCheckConsentAt ? employee.backgroundCheckConsentAt.toISOString() : null}
                  initialBackgroundCheckEvents={employee.backgroundCheckEvents.map((e) => ({
                    id: e.id,
                    createdAt: e.createdAt.toISOString(),
                    previousStatus: e.previousStatus,
                    newStatus: e.newStatus,
                    changedBy: e.changedBy,
                  }))}
                  initialDocuments={employee.documents.map((d) => ({
                    id: d.id,
                    documentType: d.documentType,
                    title: d.title,
                    issuedAt: d.issuedAt ? d.issuedAt.toISOString() : null,
                    expiresAt: d.expiresAt ? d.expiresAt.toISOString() : null,
                    fileUrl: d.fileUrl,
                    notes: d.notes,
                  }))}
                />
              </CollapsibleSection>

              {canSeeSsn && (
                <CollapsibleSection title="Social Security Number" status={ssnStatus} tone={ssnTone} defaultOpen={ssnTone === "empty"}>
                  <EmployeeSsnSection employeeId={employee.id} hasSsn={!!employee.ssn} />
                </CollapsibleSection>
              )}
              {canSeePay && (
                <CollapsibleSection title="Bank Account Info" status={bankStatus} tone={bankTone} defaultOpen={bankTone === "empty"}>
                  <EmployeeBankAccountSection
                    employeeId={employee.id}
                    initial={{
                      bankAccountType: employee.bankAccountType,
                      bankAccountNumber: employee.bankAccountNumber,
                      bankRoutingNumber: employee.bankRoutingNumber,
                    }}
                  />
                </CollapsibleSection>
              )}
            </div>
          ),
        },
        {
          label: "Time Off",
          content: (
            <EmployeeTimeOffSection
              employeeId={employee.id}
              initialTimeOff={employee.timeOff.map((t) => ({
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
            <EmployeeLaborSection
              employeeId={employee.id}
              canSeePay={canSeePay}
              initialEntries={laborEntryRows}
              initialHasMore={initialLaborHasMore}
              projectOptions={laborProjects}
            />
          ),
        },
        {
          label: "Signing",
          content: (
            <ContractSigningSection
              apiBasePath={`/api/erp/employees/${employee.id}`}
              initialContracts={employee.contracts.map((c) => ({
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
