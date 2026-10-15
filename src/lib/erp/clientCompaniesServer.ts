import type { ClientCompanyContact, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { todayEasternKey } from "./dates";
import { isBillingMethod, isCompanyType, type CompanyContactRow, type CompanyListRow } from "./clientCompanies";

export function toContactRow(c: ClientCompanyContact): CompanyContactRow {
  return { id: c.id, name: c.name, role: c.role, email: c.email, phone: c.phone, notes: c.notes };
}

/** Every company for the list page, with how many buildings and projects use it. */
export async function loadCompanyListRows(): Promise<CompanyListRow[]> {
  const companies = await prisma.clientCompany.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      type: true,
      aliases: true,
      archived: true,
      billingMethod: true,
      _count: { select: { managedBuildings: true, ownedBuildings: true, projects: true } },
    },
  });
  return companies.map((c) => ({
    id: c.id,
    name: c.name,
    type: isCompanyType(c.type) ? c.type : "PROPERTY_MANAGER",
    aliases: c.aliases,
    archived: c.archived,
    billingMethod: isBillingMethod(c.billingMethod) ? c.billingMethod : null,
    buildingCount: c._count.managedBuildings + c._count.ownedBuildings,
    projectCount: c._count.projects,
  }));
}

/** Picker options: everything not archived, plus the ones already picked. */
export async function loadCompanyOptions(keepIds: (string | null | undefined)[] = []) {
  const keep = keepIds.filter((x): x is string => !!x);
  return prisma.clientCompany.findMany({
    where: keep.length ? { OR: [{ archived: false }, { id: { in: keep } }] } : { archived: false },
    orderBy: { name: "asc" },
    select: { id: true, name: true, aliases: true, type: true, archived: true },
  });
}

/** "YYYY-MM-DD" to a UTC-midnight Date for @db.Date columns, or null. */
export function dateKeyToDate(key: unknown): Date | null {
  if (typeof key !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const d = new Date(`${key}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Point a building at a new managing company (or none), keeping history:
 * the open period ends on `asOf` and a new one starts on it. The first
 * company a building ever gets starts on `asOf` only if one was given,
 * since it usually managed the building long before the ERP knew.
 */
export async function setBuildingManager(
  tx: Prisma.TransactionClient,
  buildingId: string,
  newCompanyId: string | null,
  asOfKey: string | null,
  email: string,
): Promise<void> {
  const building = await tx.building.findUnique({ where: { id: buildingId }, select: { managedByCompanyId: true } });
  if (!building || building.managedByCompanyId === newCompanyId) return;

  const hadOne = !!building.managedByCompanyId;
  const asOf = dateKeyToDate(asOfKey) ?? (hadOne ? dateKeyToDate(todayEasternKey()) : null);

  await tx.buildingManagementPeriod.updateMany({ where: { buildingId, toDate: null }, data: { toDate: asOf ?? dateKeyToDate(todayEasternKey()) } });
  if (newCompanyId) {
    await tx.buildingManagementPeriod.create({ data: { buildingId, companyId: newCompanyId, fromDate: asOf, changedByEmail: email } });
  }
  await tx.building.update({ where: { id: buildingId }, data: { managedByCompanyId: newCompanyId } });
}
