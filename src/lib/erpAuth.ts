import { headers } from "next/headers";
import type { ErpRole } from "./erpSession";
import { isPmLevel } from "./erpRoles";

export { isPmLevel, PM_LEVEL_ROLES } from "./erpRoles";

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
  return isPmLevel(role) || role === "SALES";
}

/** Gates pay-info fields (bank account, salary/rate, commission) for both
 * Employee and Contractor, same pattern as canViewSsn. Sales keeps this,
 * they just can't see Payroll or Offshore Payroll (see canSeePayroll below). */
export function canEditPayInfo(role: ErpRole): boolean {
  return isPmLevel(role) || role === "SALES";
}

/** Payroll + Offshore Payroll specifically (as opposed to canSeeFinancials,
 * which still includes SALES for Commission/Reimbursements). SALES is
 * excluded here since it shouldn't see payroll or offshore payroll. */
export function canSeePayroll(role: ErpRole): boolean {
  return isPmLevel(role);
}

/** Dashboard Finance tab. Net profit there subtracts total salary and
 * offshore pay, so SALES is left out even though it can see job margins. */
export function canSeeFinanceDashboard(role: ErpRole): boolean {
  return isPmLevel(role);
}

/** Janitorial page (recurring contracts, and later janitor hours/schedule):
 * same roles as canSeeFinancials. */
export function canManageJanitorial(role: ErpRole): boolean {
  return isPmLevel(role) || role === "SALES";
}

/** Insurance page (our policies and COI holders): same roles as canSeeFinancials. */
export function canManageInsurance(role: ErpRole): boolean {
  return isPmLevel(role) || role === "SALES";
}

/** Property Managers page (outside property managers' private turnover
 * links): same roles as canSeeFinancials, since the link shows prices. */
export function canManagePropertyManagers(role: ErpRole): boolean {
  return isPmLevel(role) || role === "SALES";
}

/** Project Communications tab: add and edit contacts, and send emails from
 * the ERP. Everyone who can open the project can read the tab. */
export function canManageCommunications(role: ErpRole): boolean {
  return isPmLevel(role) || role === "SALES";
}

/** Schedule page's Management calendar (company deadlines, insurance
 * expirations, everyone's time off): view and edit. */
export function canManageManagementCalendar(role: ErpRole): boolean {
  return isPmLevel(role);
}

/** Management calendar, read-only and Bids category only: bid due dates and job walks. */
export function canSeeBidCalendar(role: ErpRole): boolean {
  return isPmLevel(role) || role === "SALES" || role === "ESTIMATION";
}

/** Schedule Timeline tab: dragging a project bar to change its start/end dates. */
export function canRescheduleOnTimeline(role: ErpRole): boolean {
  return isPmLevel(role);
}

/** Company Info page (our IDs, licenses, bank info, website logins): view,
 * edit, and reveal encrypted values. Every reveal is logged. */
export function canManageCompanyInfo(role: ErpRole): boolean {
  return isPmLevel(role);
}

/** Companies pages (client companies and their billing profile): view, and
 * pick a company on a building or project. */
export function canViewCompanies(role: ErpRole): boolean {
  return isPmLevel(role) || role === "SALES";
}

/** Edit a company, its contacts and billing profile, and billing overrides
 * on buildings and projects. */
export function canEditCompanies(role: ErpRole): boolean {
  return role === "ADMIN" || role === "BUSINESS_MANAGER";
}

/** Ready to send: review, edit, approve and discard auto-drafted invoices. */
export function canApproveInvoices(role: ErpRole): boolean {
  return role === "ADMIN" || role === "BUSINESS_MANAGER";
}

/** Company Info's Access log tab: who revealed or copied which locked value. */
export function canViewCompanyInfoAccessLog(role: ErpRole): boolean {
  return role === "ADMIN";
}

/** Notifications page: which emails go out, to whom, and the Email Log. */
export function canManageNotifications(role: ErpRole): boolean {
  return isPmLevel(role);
}

export function canManageUsers(role: ErpRole): boolean {
  return role === "ADMIN";
}

/** Franchise inquiries (from the public /franchise form) are PM/ADMIN-only for now. */
export function canSeeFranchiseInquiries(role: ErpRole): boolean {
  return isPmLevel(role);
}

/** Office tab on Candidates (job openings and office candidates, with
 * expected salaries). Sales keeps the Field tab only. */
export function canSeeOfficeHiring(role: ErpRole): boolean {
  return isPmLevel(role);
}

/** Offer letter templates: Admin and Business Manager edit, PMs can view and use them. */
export function canEditOfferTemplates(role: ErpRole): boolean {
  return role === "ADMIN" || role === "BUSINESS_MANAGER";
}

/** Post-construction pipeline board (read-only view of HubSpot deals). */
export function canViewPipelineBoard(role: ErpRole): boolean {
  return isPmLevel(role) || role === "SALES" || role === "ESTIMATION";
}

/** Deals board settings that affect everyone: shared views, stage rules, bulk edits. */
export function canManagePipeline(role: ErpRole): boolean {
  return role === "ADMIN" || role === "BUSINESS_MANAGER";
}

export function canAddLaborLogs(role: ErpRole): boolean {
  return isPmLevel(role) || role === "SALES" || role === "SUPERVISOR";
}

export function canEditPricing(role: ErpRole): boolean {
  return isPmLevel(role) || role === "SALES" || role === "ESTIMATION";
}

export function canFilterScheduleBySupervisor(role: ErpRole): boolean {
  return role !== "SUPERVISOR" && role !== "EMPLOYEE";
}

/** Gates the reveal-on-demand SSN endpoints for both Employee and Contractor
 * (same role set as the override gates below) — the raw SSN is never shipped
 * to the browser outside of those endpoints, regardless of which entity it's on. */
export function canViewSsn(role: ErpRole): boolean {
  return isPmLevel(role) || role === "SALES";
}

/** SUPERVISOR must finish the unit turnover quality checklist before a turnover
 * unit can be marked complete; PM/ADMIN/SALES can override and complete it anyway. */
export function canOverrideQualityChecklist(role: ErpRole): boolean {
  return isPmLevel(role) || role === "SALES";
}

/** SUPERVISOR needs an approved-for-work daily safety check before logging labor
 * on a post-construction project; PM/ADMIN/SALES can override and log through it anyway. */
export function canOverrideSafetyCheck(role: ErpRole): boolean {
  return isPmLevel(role) || role === "SALES";
}

/** An employee with a logged EmployeeTimeOff row can't be scheduled for a day
 * inside it; PM/ADMIN/SALES can override and schedule them anyway (same role
 * set as the other override gates above). */
export function canOverridePto(role: ErpRole): boolean {
  return isPmLevel(role) || role === "SALES";
}

/** An employee (or contractor) with a FAILED background check can't be
 * scheduled; PM/ADMIN/SALES can override and schedule them anyway (same role
 * set as the PTO/quality-checklist/safety-check override gates above). */
export function canOverrideBackgroundCheck(role: ErpRole): boolean {
  return isPmLevel(role) || role === "SALES";
}

/** SUPERVISOR shouldn't see contract $ or cost $ on the Projects table (or any
 * other dollar figure that'd let contract value be derived), but should still
 * see margin as a percentage — a health signal without the dollar exposure. */
export function canSeeMarginOnly(role: ErpRole): boolean {
  return role === "SUPERVISOR";
}

/** Who can add a new janitorial turnover unit to a building. Deliberately
 * includes SUPERVISOR (unlike canEditPricing) since supervisors can specify a
 * unit's scope of work without ever touching the building's pricing package,
 * that's computed automatically from the building's existing rate card. */
export function canAddTurnoverUnit(role: ErpRole): boolean {
  return isPmLevel(role) || role === "SALES" || role === "SUPERVISOR";
}
