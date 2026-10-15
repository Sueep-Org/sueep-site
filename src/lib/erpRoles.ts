import type { ErpRole } from "./erpSession";

/**
 * Roles with PM-level access: Admin, Project Manager and Business Manager.
 * The Business Manager gets every page and permission a PM has (plus a few
 * money extras), so access checks use this list instead of naming
 * PROJECT_MANAGER, which keeps the two roles from drifting apart.
 *
 * Not for "people who run crews" (the schedule's PM picker, quality checkers):
 * those still name PROJECT_MANAGER on purpose. Plain data, no server imports,
 * so client components can use it too.
 */
export const PM_LEVEL_ROLES: readonly ErpRole[] = ["ADMIN", "PROJECT_MANAGER", "BUSINESS_MANAGER"];

export function isPmLevel(role: ErpRole | string | null | undefined): boolean {
  return !!role && (PM_LEVEL_ROLES as readonly string[]).includes(role);
}
