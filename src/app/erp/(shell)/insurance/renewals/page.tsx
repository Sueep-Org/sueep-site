import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageInsurance } from "@/lib/erpAuth";
import { loadReissueList } from "@/lib/erp/coiRenewals";
import { InsuranceHeader } from "../InsuranceTabs";
import { RenewalsTable } from "./RenewalsTable";

export const metadata: Metadata = {
  title: "COI Renewals",
};

export const dynamic = "force-dynamic";

export default async function CoiRenewalsPage() {
  const auth = await getErpAuth();
  if (!auth || !canManageInsurance(auth.role)) redirect("/erp");

  const [rows, newRequests] = await Promise.all([loadReissueList(), prisma.coiRequest.count({ where: { status: "NEW" } })]);

  return (
    <div className="space-y-6">
      <InsuranceHeader active="renewals" requestCount={newRequests} />
      <RenewalsTable rows={rows} />
    </div>
  );
}
