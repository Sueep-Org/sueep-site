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
  return role === "ADMIN" || role === "PROJECT_MANAGER" || role === "SALES" || role === "FINANCE";
}

/** Gates pay-info fields (bank account, salary/rate, commission) for both
 * Employee and Contractor, same pattern as canViewSsn. */
export function canEditPayInfo(role: ErpRole): boolean {
  return role === "ADMIN" || role === "FINANCE" || role === "PROJECT_MANAGER" || role === "SALES";
}

export function canManageUsers(role: ErpRole): boolean {
  return role === "ADMIN";
}

export function canAddLaborLogs(role: ErpRole): boolean {
  return role === "ADMIN" || role === "PROJECT_MANAGER" || role === "SALES" || role === "SUPERVISOR";
}

export function canEditPricing(role: ErpRole): boolean {
  return role === "ADMIN" || role === "PROJECT_MANAGER" || role === "SALES" || role === "ESTIMATION";
}

export function canFilterScheduleBySupervisor(role: ErpRole): boolean {
  return role !== "SUPERVISOR" && role !== "EMPLOYEE";
}

/** Gates the reveal-on-demand SSN endpoints for both Employee and Contractor
 * (same role set as the override gates below) — the raw SSN is never shipped
 * to the browser outside of those endpoints, regardless of which entity it's on. */
export function canViewSsn(role: ErpRole): boolean {
  return role === "ADMIN" || role === "PROJECT_MANAGER" || role === "SALES";
}

/** SUPERVISOR must finish the unit turnover quality checklist before a turnover
 * unit can be marked complete; PM/ADMIN/SALES can override and complete it anyway. */
export function canOverrideQualityChecklist(role: ErpRole): boolean {
  return role === "ADMIN" || role === "PROJECT_MANAGER" || role === "SALES";
}

/** SUPERVISOR needs an approved-for-work daily safety check before logging labor
 * on a post-construction project; PM/ADMIN/SALES can override and log through it anyway. */
export function canOverrideSafetyCheck(role: ErpRole): boolean {
  return role === "ADMIN" || role === "PROJECT_MANAGER" || role === "SALES";
}

/** An employee with a logged EmployeeTimeOff row can't be scheduled for a day
 * inside it; PM/ADMIN/SALES can override and schedule them anyway (same role
 * set as the other override gates above). */
export function canOverridePto(role: ErpRole): boolean {
  return role === "ADMIN" || role === "PROJECT_MANAGER" || role === "SALES";
}

/** An employee (or contractor) with a FAILED background check can't be
 * scheduled; PM/ADMIN/SALES can override and schedule them anyway (same role
 * set as the PTO/quality-checklist/safety-check override gates above). */
export function canOverrideBackgroundCheck(role: ErpRole): boolean {
  return role === "ADMIN" || role === "PROJECT_MANAGER" || role === "SALES";
}

/** SUPERVISOR shouldn't see contract $ or cost $ on the Projects table (or any
 * other dollar figure that'd let contract value be derived), but should still
 * see margin as a percentage — a health signal without the dollar exposure. */
export function canSeeMarginOnly(role: ErpRole): boolean {
  return role === "SUPERVISOR";
}

export function isProjectManager(role: ErpRole): boolean {
  return role === "PROJECT_MANAGER";
}

/** Who can add a new janitorial turnover unit to a building. Deliberately
 * includes SUPERVISOR (unlike canEditPricing) since supervisors can specify a
 * unit's scope of work without ever touching the building's pricing package,
 * that's computed automatically from the building's existing rate card. */
export function canAddTurnoverUnit(role: ErpRole): boolean {
  return role === "ADMIN" || role === "PROJECT_MANAGER" || role === "SALES" || role === "SUPERVISOR";
}
