/**
 * How many before/after photos a sub needs before they can check out
 * (Settings, Subs). Only the sub running the day; crew can add photos but
 * never need them. Server only.
 */
import { prisma } from "@/lib/prisma";
import type { SubPortalSettings } from "./subPortalSettingsServer";

export type PhotoCounts = { before: number; after: number };

export function photoNeeds(role: string, turnover: boolean, settings: SubPortalSettings): PhotoCounts {
  if (role !== "lead") return { before: 0, after: 0 };
  return turnover
    ? { before: settings.turnoverBeforePhotos, after: settings.turnoverAfterPhotos }
    : { before: settings.otherBeforePhotos, after: settings.otherAfterPhotos };
}

/** Photo counts per check-in id */
export async function photoCountsFor(checkInIds: string[]): Promise<Map<string, PhotoCounts>> {
  const out = new Map<string, PhotoCounts>();
  if (checkInIds.length === 0) return out;
  const rows = await prisma.subJobPhoto.groupBy({ by: ["checkInId", "kind"], where: { checkInId: { in: checkInIds } }, _count: { _all: true } });
  for (const r of rows) {
    const c = out.get(r.checkInId) ?? { before: 0, after: 0 };
    if (r.kind === "before" || r.kind === "after") c[r.kind] = r._count._all;
    out.set(r.checkInId, c);
  }
  return out;
}

export function photosShort(have: PhotoCounts, need: PhotoCounts): PhotoCounts {
  return { before: Math.max(0, need.before - have.before), after: Math.max(0, need.after - have.after) };
}
