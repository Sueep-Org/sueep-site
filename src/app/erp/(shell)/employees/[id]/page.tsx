import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { complianceBadgeClasses, complianceLabel, evaluateEmployeeCompliance } from "@/lib/erp/employees";
import { DetailTabs } from "@/app/erp/components/DetailTabs";
import { ContractSigningSection } from "@/app/erp/components/ContractSigningSection";
import { EmployeeProfileEditor } from "./EmployeeProfileEditor";
import { EmployeeDocumentsSection } from "./EmployeeDocumentsSection";
import { EmployeeBankAccountSection } from "./EmployeeBankAccountSection";
import { EmployeeSsnSection } from "./EmployeeSsnSection";
import { getErpAuth, canEditEmployeePayInfo, canViewEmployeeSsn } from "@/lib/erpAuth";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

function parseRequiredDocuments(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

export default async function EmployeeDetailPage({ params }: PageProps) {
  const { id } = await params;
  const auth = await getErpAuth();
  const canSeePay = canEditEmployeePayInfo(auth?.role ?? "EMPLOYEE");
  const canSeeSsn = canViewEmployeeSsn(auth?.role ?? "EMPLOYEE");
  const employee = await prisma.employee.findUnique({
    where: { id },
    include: {
      documents: { orderBy: [{ expiresAt: "asc" }, { createdAt: "desc" }] },
      contracts: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!employee) notFound();

  const requiredDocuments = parseRequiredDocuments(employee.requiredDocuments);
  const compliance = evaluateEmployeeCompliance(employee.status, requiredDocuments, employee.documents);

  return (
    <div className="space-y-4">
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
                role: employee.role,
                payType: employee.payType,
                hourlyPayCents: employee.hourlyPayCents,
                annualSalaryCents: employee.annualSalaryCents,
                defaultProject: employee.defaultProject,
                status: employee.status,
                hireDate: employee.hireDate ? employee.hireDate.toISOString() : null,
                notes: employee.notes,
                isOffshore: employee.isOffshore,
                offshoreMonthlyRateCents: employee.offshoreMonthlyRateCents,
              }}
            />
          ),
        },
        ...(canSeePay ? [{
          label: "Bank Account",
          content: (
            <EmployeeBankAccountSection
              employeeId={employee.id}
              initial={{
                bankAccountType: employee.bankAccountType,
                bankAccountNumber: employee.bankAccountNumber,
                bankRoutingNumber: employee.bankRoutingNumber,
              }}
            />
          ),
        }] : []),
        ...(canSeeSsn ? [{
          label: "SSN",
          content: <EmployeeSsnSection employeeId={employee.id} hasSsn={!!employee.ssn} />,
        }] : []),
        {
          label: "Documents",
          content: (
            <EmployeeDocumentsSection
              employeeId={employee.id}
              initialRequiredDocuments={requiredDocuments}
              initialBackgroundCheckStatus={(employee.backgroundCheckStatus ?? "NOT_DONE") as "PASSED" | "FAILED" | "PENDING" | "NOT_DONE"}
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
