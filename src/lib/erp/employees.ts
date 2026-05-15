export type EmployeeComplianceState = "COMPLIANT" | "NON_COMPLIANT" | "NOT_CONFIGURED" | "INACTIVE";

type EmployeeDocumentLike = {
  documentType: string;
};

export function evaluateEmployeeCompliance(
  status: string,
  requiredDocuments: string[],
  docs: EmployeeDocumentLike[],
): EmployeeComplianceState {
  if (status.toUpperCase() !== "ACTIVE") return "INACTIVE";
  if (requiredDocuments.length === 0) return "NOT_CONFIGURED";

  const presentTypes = new Set(docs.map((d) => d.documentType.toLowerCase()));
  const allPresent = requiredDocuments.every((r) => presentTypes.has(r.toLowerCase()));

  return allPresent ? "COMPLIANT" : "NON_COMPLIANT";
}

export function complianceBadgeClasses(state: EmployeeComplianceState): string {
  if (state === "COMPLIANT") return "bg-emerald-100 text-emerald-800 border border-emerald-300";
  if (state === "NON_COMPLIANT") return "bg-red-100 text-red-800 border border-red-300";
  return "bg-gray-100 text-gray-600 border border-gray-300";
}

export function complianceLabel(state: EmployeeComplianceState): string {
  if (state === "COMPLIANT") return "Compliant";
  if (state === "NON_COMPLIANT") return "Non-compliant";
  if (state === "NOT_CONFIGURED") return "Not configured";
  if (state === "INACTIVE") return "Inactive";
  return state;
}