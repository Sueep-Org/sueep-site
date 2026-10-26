/** Database side of unitNames.ts: the names a building already uses. */
import { prisma } from "@/lib/prisma";
import { matchUnitName } from "@/lib/erp/unitNames";

/** The building's unit names, most-used first. */
export async function buildingUnitNames(buildingId: string): Promise<string[]> {
  const rows = await prisma.turnoverRequest.groupBy({
    by: ["unitNumber"],
    where: { buildingId, unitNumber: { not: null } },
    _count: true,
  });
  return rows.sort((a, b) => b._count - a._count).map((r) => r.unitNumber!);
}

/** For saving a turn: the building's existing spelling of this unit, if it has one. */
export async function canonicalUnitName(buildingId: string, typed: string | null): Promise<string | null> {
  const name = typed?.trim();
  if (!name) return typed ?? null;
  const rows = await prisma.turnoverRequest.findMany({ where: { buildingId, unitNumber: { not: null } }, select: { unitNumber: true } });
  return matchUnitName(name, rows.map((r) => r.unitNumber!));
}
