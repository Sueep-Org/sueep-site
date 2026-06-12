import { headers } from "next/headers";
import type { ErpRole } from "./erpSession";

export interface ErpAuthContext {
  uid: string;
  email: string;
  role: ErpRole;
}

/** Read the session context injected by middleware. Only callable in server components / Route Handlers. */
export async function getErpAuth(): Promise<ErpAuthContext | null> {
  const h = await headers();
  const role = h.get("x-erp-role") as ErpRole | null;
  const uid = h.get("x-erp-uid");
  const email = h.get("x-erp-email");
  if (!role || !uid || !email) return null;
  return { uid, email, role };
}

export function canSeeFinancials(role: ErpRole): boolean {
  return role === "ADMIN" || role === "PROJECT_MANAGER";
}

export function canEditEmployeePayInfo(role: ErpRole): boolean {
  return role === "ADMIN";
}

export function canManageUsers(role: ErpRole): boolean {
  return role === "ADMIN";
}

export function canAddLaborLogs(role: ErpRole): boolean {
  return role === "ADMIN" || role === "PROJECT_MANAGER" || role === "SUPERVISOR";
}
