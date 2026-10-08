import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canViewCompanyInfoAccessLog } from "@/lib/erpAuth";
import { toAccessLogRow } from "@/lib/erp/companyInfoServer";
import { CompanyInfoHeader } from "../CompanyInfoTabs";
import { AccessLogTable } from "./AccessLogTable";

export const metadata: Metadata = {
  title: "Company Info: Access log",
};

export const dynamic = "force-dynamic";

/** Most recent first; older entries stay in the database. */
const LIMIT = 500;

export default async function CompanyInfoAccessLogPage() {
  const auth = await getErpAuth();
  if (!auth || !canViewCompanyInfoAccessLog(auth.role)) redirect("/erp/company-info");

  const entries = await prisma.companyInfoAccessLog.findMany({ orderBy: { createdAt: "desc" }, take: LIMIT });

  return (
    <div className="space-y-6">
      <CompanyInfoHeader active="access-log" showAccessLog />
      <AccessLogTable entries={entries.map(toAccessLogRow)} limit={LIMIT} />
    </div>
  );
}
