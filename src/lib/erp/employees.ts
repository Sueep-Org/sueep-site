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
  if (state === "COMPLIANT") return "bg-emerald-950/60 text-emerald-300 border border-emerald-800";
  if (state === "EXPIRING_SOON") return "bg-amber-950/60 text-amber-300 border border-amber-800";
  if (state === "NON_COMPLIANT") return "bg-red-950/60 text-red-300 border border-red-800";
  if (state === "INACTIVE") return "bg-zinc-900 text-zinc-400 border border-zinc-700";
  return "bg-zinc-900 text-zinc-300 border border-zinc-700";
}

export function complianceLabel(state: EmployeeComplianceState): string {
  if (state === "EXPIRING_SOON") return "Expiring soon";
  if (state === "NON_COMPLIANT") return "Non-compliant";
  if (state === "INACTIVE") return "Inactive";
  if (state === "MISSING") return "Missing docs";
  return "Compliant";
}