import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageInsurance } from "@/lib/erpAuth";
import { InsuranceHeader } from "../InsuranceTabs";
import { HoldersTable } from "./HoldersTable";
import { toHolderRow, toPolicyRow } from "../serialize";

export const metadata: Metadata = {
  title: "Certificate Holders",
};

export const dynamic = "force-dynamic";

export default async function CertificateHoldersPage() {
  const auth = await getErpAuth();
  if (!auth || !canManageInsurance(auth.role)) redirect("/erp");

  const [holders, policies, newRequests] = await Promise.all([
    prisma.coiHolder.findMany({ orderBy: { name: "asc" } }),
    prisma.insurancePolicy.findMany({ where: { active: true } }),
    prisma.coiRequest.count({ where: { status: "NEW" } }),
  ]);

  return (
    <div className="space-y-6">
      <InsuranceHeader active="holders" requestCount={newRequests} />
      <HoldersTable holders={holders.map(toHolderRow)} policies={policies.map(toPolicyRow)} />
    </div>
  );
}
