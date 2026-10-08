import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageCompanyInfo, canViewCompanyInfoAccessLog } from "@/lib/erpAuth";
import { sectionsForTab } from "@/lib/erp/companyInfo";
import { companyDocumentListSelect, toCompanyDocumentRow, toCompanyInfoRow, toFinancialYearRow } from "@/lib/erp/companyInfoServer";
import { CompanyInfoHeader } from "../CompanyInfoTabs";
import { FieldCards } from "../FieldCards";
import { FinancialYears } from "./FinancialYears";
import { OtherDocuments } from "./OtherDocuments";

export const metadata: Metadata = {
  title: "Company Info: Financial",
};

export const dynamic = "force-dynamic";

export default async function CompanyFinancialPage() {
  const auth = await getErpAuth();
  if (!auth || !canManageCompanyInfo(auth.role)) redirect("/erp");

  const [fields, years, docs] = await Promise.all([
    prisma.companyInfoField.findMany({
      where: { section: { in: sectionsForTab("financial").map((s) => s.id) } },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.companyFinancialYear.findMany({ orderBy: { year: "desc" } }),
    prisma.companyDocument.findMany({ select: companyDocumentListSelect, orderBy: { createdAt: "desc" } }),
  ]);
  const docRows = docs.map(toCompanyDocumentRow);

  return (
    <div className="space-y-6">
      <CompanyInfoHeader active="financial" showAccessLog={canViewCompanyInfoAccessLog(auth.role)} />
      <FieldCards rows={fields.map(toCompanyInfoRow)} tab="financial" />
      <div className="grid gap-4 lg:grid-cols-2">
        <FinancialYears years={years.map(toFinancialYearRow)} docs={docRows.filter((d) => d.kind !== "OTHER")} />
        <OtherDocuments docs={docRows.filter((d) => d.kind === "OTHER")} />
      </div>
    </div>
  );
}
