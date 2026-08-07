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
  if (state === "COMPLIANT") return "bg-gray-200 text-gray-800 border border-gray-300";
  if (state === "NON_COMPLIANT") return "bg-gray-200 text-gray-600 border border-gray-300";
  return "bg-gray-100 text-gray-500 border border-gray-200";
}

export function complianceLabel(state: EmployeeComplianceState): string {
  if (state === "COMPLIANT") return "Compliant";
  if (state === "NON_COMPLIANT") return "Non-compliant";
  if (state === "NOT_CONFIGURED") return "Not configured";
  if (state === "INACTIVE") return "Inactive";
  return state;
}

export type BackgroundCheckStatus = "PASSED" | "FAILED" | "PENDING" | "NOT_DONE";

export function backgroundCheckLabel(status: string | null | undefined): string {
  if (status === "PASSED") return "Passed";
  if (status === "FAILED") return "Failed";
  if (status === "PENDING") return "Pending";
  return "Not done";
}

export function backgroundCheckBadgeClasses(status: string | null | undefined): string {
  if (status === "PASSED") return "border-emerald-300 bg-emerald-50 text-emerald-700";
  if (status === "FAILED") return "border-red-300 bg-red-50 text-red-700";
  if (status === "PENDING") return "border-yellow-300 bg-yellow-50 text-yellow-700";
  return "border-gray-300 bg-gray-50 text-gray-600";
}