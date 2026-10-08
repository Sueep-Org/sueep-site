import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageInsurance } from "@/lib/erpAuth";
import { expiryStatus, formatLimit, maxCertifiableCents, policyTypeLabel } from "@/lib/erp/insurance";
import { StatStrip } from "../janitorial/StatStrip";
import { InsuranceHeader } from "./InsuranceTabs";
import { PoliciesTable } from "./PoliciesTable";
import { toPolicyRow } from "./serialize";

export const metadata: Metadata = {
  title: "Insurance & COIs",
};

export const dynamic = "force-dynamic";

export default async function InsurancePoliciesPage() {
  const auth = await getErpAuth();
  if (!auth || !canManageInsurance(auth.role)) redirect("/erp");

  const [policies, newRequests] = await Promise.all([
    prisma.insurancePolicy.findMany({ orderBy: [{ active: "desc" }, { expiresAt: "asc" }], include: { terms: true } }),
    prisma.coiRequest.count({ where: { status: "NEW" } }),
  ]);
  const active = policies.filter((p) => p.active);

  const next = active[0];
  const nextStatus = next ? expiryStatus(next.expiresAt) : null;
  const expiringCount = active.filter((p) => expiryStatus(p.expiresAt).status !== "CURRENT").length;
  const maxCert = maxCertifiableCents(active);

  const tiles: { label: string; value: string; hint?: string; tone?: string }[] = [
    { label: "Active policies", value: String(active.length), hint: expiringCount ? `${expiringCount} expiring or expired` : undefined, tone: expiringCount ? "text-amber-600" : undefined },
    {
      label: "Next to expire",
      value: next ? new Date(next.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "None on file",
      hint: next ? policyTypeLabel(next.policyType) : undefined,
      tone: nextStatus?.status === "EXPIRED" ? "text-red-600" : nextStatus?.status === "EXPIRING" ? "text-amber-600" : undefined,
    },
    {
      label: "Most we can certify",
      value: maxCert == null ? "Add GL policy" : formatLimit(maxCert),
      hint: maxCert == null ? undefined : "GL + umbrella",
    },
  ];

  return (
    <div className="space-y-6">
      <InsuranceHeader active="policies" requestCount={newRequests} />
      <StatStrip stats={tiles} />
      <PoliciesTable policies={policies.map(toPolicyRow)} />
    </div>
  );
}
