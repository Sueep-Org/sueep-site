import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DetailTabs } from "@/app/erp/components/DetailTabs";
import { ContractorProfileEditor } from "./ContractorProfileEditor";
import { ContractorPaperworkPanel } from "./ContractorPaperworkPanel";
import { ContractorInfoPanel } from "./ContractorInfoPanel";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PageProps = { params: Promise<{ id: string }> };

export default async function ContractorDetailPage({ params }: PageProps) {
  const { id } = await params;
  const contractor = await prisma.contractor.findUnique({ where: { id } });
  if (!contractor) notFound();

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://sueep.com";
  const resendConfigured = Boolean(process.env.RESEND_API_KEY);

  const paperwork = (contractor.paperwork ?? []) as { label: string; url: string }[];

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
            <ContractorProfileEditor
              contractorId={contractor.id}
              initial={{
                name: contractor.name,
                email: contractor.email,
                status: contractor.status,
              }}
            />
          ),
        },
        {
          label: "Documents",
          content: (
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
          ),
        },
        {
          label: "Info Form",
          content: (
            <ContractorInfoPanel
              id={contractor.id}
              email={contractor.email}
              infoToken={contractor.infoToken}
              infoTokenExpiry={contractor.infoTokenExpiry?.toISOString() ?? null}
              resendConfigured={resendConfigured}
              siteUrl={siteUrl}
              collectedInfo={{
                contractorFullName: contractor.contractorFullName,
                address: contractor.address,
                dateOfBirth: contractor.dateOfBirth,
                ssn: contractor.ssn,
                bankAccountType: contractor.bankAccountType,
                bankAccountNumber: contractor.bankAccountNumber,
                bankRoutingNumber: contractor.bankRoutingNumber,
                phone: contractor.phone,
                hasInsurance: contractor.hasInsurance,
              }}
            />
          ),
        },
      ]} />
    </div>
  );
}
