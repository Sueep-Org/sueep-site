import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageCompanyInfo, canViewCompanyInfoAccessLog } from "@/lib/erpAuth";
import { expiryStatus } from "@/lib/erp/insurance";
import { toCompanyInfoRow } from "@/lib/erp/companyInfoServer";
import { sectionsForTab } from "@/lib/erp/companyInfo";
import { StatStrip } from "../janitorial/StatStrip";
import { CompanyInfoHeader } from "./CompanyInfoTabs";
import { FieldCards } from "./FieldCards";

export const metadata: Metadata = {
  title: "Company Info",
};

export const dynamic = "force-dynamic";

export default async function CompanyInfoPage() {
  const auth = await getErpAuth();
  if (!auth || !canManageCompanyInfo(auth.role)) redirect("/erp");

  const fields = await prisma.companyInfoField.findMany({
    where: { section: { in: sectionsForTab("general").map((s) => s.id) } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  const rows = fields.map(toCompanyInfoRow);

  const filled = fields.filter((f) => (f.sensitive ? f.valueEncrypted : f.value)).length;
  const dated = fields.filter((f) => f.expiresAt).sort((a, b) => a.expiresAt!.getTime() - b.expiresAt!.getTime());
  const attention = dated.filter((f) => expiryStatus(f.expiresAt!).status !== "CURRENT").length;
  const next = dated.find((f) => expiryStatus(f.expiresAt!).status !== "EXPIRED");

  const tiles = [
    { label: "Filled in", value: `${filled} of ${fields.length}` },
    {
      label: "Expiring or expired",
      value: String(attention),
      tone: attention ? "text-amber-600" : undefined,
    },
    {
      label: "Next to expire",
      value: next
        ? next.expiresAt!.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            timeZone: "UTC",
          })
        : "None",
      hint: next?.label,
    },
  ];

  return (
    <div className="space-y-6">
      <CompanyInfoHeader active="general" showAccessLog={canViewCompanyInfoAccessLog(auth.role)} />
      <StatStrip stats={tiles} />
      <FieldCards rows={rows} tab="general" searchable />
    </div>
  );
}
