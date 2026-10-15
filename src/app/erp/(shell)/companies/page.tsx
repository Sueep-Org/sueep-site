import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getErpAuth, canEditCompanies, canViewCompanies } from "@/lib/erpAuth";
import { loadCompanyListRows } from "@/lib/erp/clientCompaniesServer";
import { InfoTip } from "@/app/erp/components/ui";
import { CompaniesList } from "./CompaniesList";

export const metadata: Metadata = { title: "Companies" };
export const dynamic = "force-dynamic";

export default async function CompaniesPage() {
  const auth = await getErpAuth();
  if (!auth || !canViewCompanies(auth.role)) redirect("/erp");
  const rows = await loadCompanyListRows();
  return (
    <div className="space-y-6">
      <h1 className="flex items-center gap-1 text-2xl font-semibold text-gray-900">
        Companies
        <InfoTip text="Property managers, general contractors and owners we work with, and how each wants to be billed." />
      </h1>
      <CompaniesList rows={rows} canEdit={canEditCompanies(auth.role)} />
    </div>
  );
}
