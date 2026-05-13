export type EmployeeComplianceState = "COMPLIANT" | "EXPIRING_SOON" | "MISSING" | "NON_COMPLIANT" | "INACTIVE";

type EmployeeDocumentLike = {
  isVerified: boolean;
  expiresAt: Date | null;
};

export function evaluateEmployeeCompliance(status: string, docs: EmployeeDocumentLike[], now = new Date()): EmployeeComplianceState {
  if (status.toUpperCase() !== "ACTIVE") return "INACTIVE";

  const verified = docs.filter((d) => d.isVerified);
  if (verified.length === 0) return "MISSING";

  const soon = new Date(now);
  soon.setDate(soon.getDate() + 30);

  let hasExpired = false;
  let hasExpiringSoon = false;
  for (const d of verified) {
    if (!d.expiresAt) continue;
    if (d.expiresAt.getTime() < now.getTime()) hasExpired = true;
    else if (d.expiresAt.getTime() <= soon.getTime()) hasExpiringSoon = true;
  }

  if (hasExpired) return "NON_COMPLIANT";
  if (hasExpiringSoon) return "EXPIRING_SOON";
  return "COMPLIANT";
}

export function complianceBadgeClasses(state: EmployeeComplianceState): string {
  if (state === "COMPLIANT") return "bg-emerald-100 text-emerald-800 border border-emerald-300";
  if (state === "EXPIRING_SOON") return "bg-amber-100 text-amber-800 border border-amber-300";
  if (state === "NON_COMPLIANT") return "bg-red-100 text-red-800 border border-red-300";
  if (state === "INACTIVE") return "bg-gray-100 text-gray-600 border border-gray-300";
  return "bg-gray-100 text-gray-700 border border-gray-300";
}

export function complianceLabel(state: EmployeeComplianceState): string {
  if (state === "EXPIRING_SOON") return "Expiring soon";
  if (state === "NON_COMPLIANT") return "Non-compliant";
  if (state === "INACTIVE") return "Inactive";
  if (state === "MISSING") return "Missing docs";
  return "Compliant";
}