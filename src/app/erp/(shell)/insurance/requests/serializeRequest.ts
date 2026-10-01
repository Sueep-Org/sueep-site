import type { CoiRequest } from "@prisma/client";
import { normalizeHolderName } from "@/lib/erp/insurance";
import { requestHolders } from "@/lib/erp/coiRequests";
import { utcDateKey } from "@/lib/erp/dates";
import type { RequestRow } from "./types";

type Profile = { id: string; name: string; aliases: string[] };

/** Builds a name lookup over holder profiles (name and other names). */
export function holderMatcher(profiles: Profile[]) {
  const byName = new Map<string, Profile>();
  for (const p of profiles) for (const n of [p.name, ...p.aliases]) byName.set(normalizeHolderName(n), p);
  return (name: string) => byName.get(normalizeHolderName(name)) ?? null;
}

export function toRequestRow(
  r: Omit<CoiRequest, "sampleData"> & { hasSample: boolean; project: { jobTitle: string } | null; _count: { cois: number } },
  match: (name: string) => Profile | null,
): RequestRow {
  return {
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    status: r.status,
    projectId: r.projectId,
    projectTitle: r.project?.jobTitle ?? null,
    projectText: r.projectText,
    requesterName: r.requesterName,
    requesterCompany: r.requesterCompany,
    requesterEmail: r.requesterEmail,
    requesterPhone: r.requesterPhone,
    neededBy: r.neededBy ? utcDateKey(r.neededBy) : null,
    holders: requestHolders(r.holders).map((h) => {
      const m = match(h.name);
      return { ...h, matchedId: m?.id ?? null, matchedName: m?.name ?? null };
    }),
    reqGlOccurrenceCents: r.reqGlOccurrenceCents,
    reqGlAggregateCents: r.reqGlAggregateCents,
    reqAutoCents: r.reqAutoCents,
    reqUmbrellaCents: r.reqUmbrellaCents,
    reqWcEmployersLiabilityCents: r.reqWcEmployersLiabilityCents,
    requiresAdditionalInsured: r.requiresAdditionalInsured,
    requiresWaiverOfSubrogation: r.requiresWaiverOfSubrogation,
    requiresPrimaryNoncontributory: r.requiresPrimaryNoncontributory,
    additionalInsureds: r.additionalInsureds,
    specialWording: r.specialWording,
    notes: r.notes,
    hasSample: r.hasSample,
    coiCount: r._count.cois,
  };
}

/** Prisma select for request rows without loading the sample file itself. */
export const REQUEST_SELECT = {
  id: true,
  createdAt: true,
  updatedAt: true,
  projectId: true,
  projectText: true,
  status: true,
  requesterName: true,
  requesterCompany: true,
  requesterEmail: true,
  requesterPhone: true,
  neededBy: true,
  holders: true,
  reqGlOccurrenceCents: true,
  reqGlAggregateCents: true,
  reqAutoCents: true,
  reqUmbrellaCents: true,
  reqWcEmployersLiabilityCents: true,
  requiresAdditionalInsured: true,
  requiresWaiverOfSubrogation: true,
  requiresPrimaryNoncontributory: true,
  additionalInsureds: true,
  specialWording: true,
  notes: true,
  sampleFilename: true,
  sampleMimeType: true,
  project: { select: { jobTitle: true } },
  _count: { select: { cois: true } },
} as const;
