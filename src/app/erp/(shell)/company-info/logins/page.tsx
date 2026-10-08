import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageCompanyInfo, canViewCompanyInfoAccessLog } from "@/lib/erpAuth";
import { toCompanyLoginRow } from "@/lib/erp/companyInfoServer";
import { CompanyInfoHeader } from "../CompanyInfoTabs";
import { LoginsTable } from "./LoginsTable";

export const metadata: Metadata = {
  title: "Company Info: Logins",
};

export const dynamic = "force-dynamic";

export default async function CompanyLoginsPage() {
  const auth = await getErpAuth();
  if (!auth || !canManageCompanyInfo(auth.role)) redirect("/erp");

  const logins = await prisma.companyLogin.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="space-y-6">
      <CompanyInfoHeader active="logins" showAccessLog={canViewCompanyInfoAccessLog(auth.role)} />
      <LoginsTable logins={logins.map(toCompanyLoginRow)} />
    </div>
  );
}
