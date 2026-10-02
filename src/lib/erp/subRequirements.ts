/**
 * Subs must carry the insurance the GC requires on the job they're working.
 * A job's requirements come from what its GCs asked of Sueep: the
 * Certificate Holder profiles on its COIs plus any COI requests sent in for
 * it, combined so the strictest of each applies.
 */

import { prisma } from "@/lib/prisma";
import { formatLimit, holderMatcher, requirementSummary, type HolderRequirements } from "./insurance";

export type JobRequirements = HolderRequirements & {
  /** GCs these came from, for "required by" text */
  sources: string[];
};

const LIMIT_KEYS = ["reqGlOccurrenceCents", "reqGlAggregateCents", "reqAutoCents", "reqUmbrellaCents", "reqWcEmployersLiabilityCents"] as const;
const FLAG_KEYS = ["requiresAdditionalInsured", "requiresWaiverOfSubrogation", "requiresPrimaryNoncontributory"] as const;

function emptyRequirements(): JobRequirements {
  return {
    reqGlOccurrenceCents: null,
    reqGlAggregateCents: null,
    reqAutoCents: null,
    reqUmbrellaCents: null,
    reqWcEmployersLiabilityCents: null,
    requiresAdditionalInsured: false,
    requiresWaiverOfSubrogation: false,
    requiresPrimaryNoncontributory: false,
    sources: [],
  };
}

/** Adds one GC's requirements in, keeping the higher limit and any required flag. */
function merge(into: JobRequirements, from: HolderRequirements, source: string) {
  let any = false;
  for (const k of LIMIT_KEYS) {
    const v = from[k];
    if (v != null) {
      any = true;
      if (into[k] == null || v > (into[k] as number)) into[k] = v;
    }
  }
  for (const k of FLAG_KEYS) {
    if (from[k]) {
      any = true;
      into[k] = true;
    }
  }
  if (any && !into.sources.includes(source)) into.sources.push(source);
}

export function hasRequirements(r: JobRequirements): boolean {
  return requirementSummary(r).length > 0;
}

/** Requirements per project, for the given project ids. Projects with none are left out. */
export async function loadJobRequirements(projectIds: string[]): Promise<Map<string, JobRequirements>> {
  const out = new Map<string, JobRequirements>();
  if (!projectIds.length) return out;

  const [cois, requests, holders] = await Promise.all([
    prisma.projectCoi.findMany({ where: { projectId: { in: projectIds } }, select: { projectId: true, holderId: true, holderName: true } }),
    prisma.coiRequest.findMany({
      where: { projectId: { in: projectIds }, status: { not: "CANCELLED" } },
      select: {
        projectId: true,
        requesterCompany: true,
        requesterName: true,
        reqGlOccurrenceCents: true,
        reqGlAggregateCents: true,
        reqAutoCents: true,
        reqUmbrellaCents: true,
        reqWcEmployersLiabilityCents: true,
        requiresAdditionalInsured: true,
        requiresWaiverOfSubrogation: true,
        requiresPrimaryNoncontributory: true,
      },
    }),
    prisma.coiHolder.findMany(),
  ]);
  const byId = new Map(holders.map((h) => [h.id, h]));
  const match = holderMatcher(holders);
  const get = (projectId: string) => {
    let r = out.get(projectId);
    if (!r) {
      r = emptyRequirements();
      out.set(projectId, r);
    }
    return r;
  };

  for (const c of cois) {
    const profile = (c.holderId ? byId.get(c.holderId) : undefined) ?? match(c.holderName) ?? undefined;
    if (profile) merge(get(c.projectId), profile, profile.name);
  }
  for (const r of requests) {
    if (r.projectId) merge(get(r.projectId), r, r.requesterCompany ?? r.requesterName);
  }
  for (const [id, r] of out) if (!hasRequirements(r)) out.delete(id);
  return out;
}

export type SubPolicies = {
  glOccurrenceCents: number | null;
  glAggregateCents: number | null;
  autoLimitCents: number | null;
  umbrellaLimitCents: number | null;
  workersCompExpiresAt: Date | null;
  workersCompExempt: boolean;
  sueepAdditionalInsured: boolean | null;
  sueepWaiverOfSubrogation: boolean | null;
  sueepPrimaryNoncontributory: boolean | null;
};

/** Where a sub falls short of a job's requirements, as short sentences. Empty means they meet them. */
export function subGaps(sub: SubPolicies, req: JobRequirements): string[] {
  const gaps: string[] = [];
  const umb = sub.umbrellaLimitCents ?? 0;
  const has = (c: number | null) => (c == null ? "not entered" : `has ${formatLimit(c)}`);

  // Their umbrella sits on top of their general liability, same as ours.
  if (req.reqGlOccurrenceCents != null && (sub.glOccurrenceCents ?? 0) + umb < req.reqGlOccurrenceCents) {
    gaps.push(`GL ${formatLimit(req.reqGlOccurrenceCents)} per occurrence (${has(sub.glOccurrenceCents)}${umb ? ` + ${formatLimit(umb)} umbrella` : ""})`);
  }
  if (req.reqGlAggregateCents != null && (sub.glAggregateCents ?? 0) + umb < req.reqGlAggregateCents) {
    gaps.push(`GL ${formatLimit(req.reqGlAggregateCents)} aggregate (${has(sub.glAggregateCents)}${umb ? ` + ${formatLimit(umb)} umbrella` : ""})`);
  }
  if (req.reqAutoCents != null && (sub.autoLimitCents ?? 0) < req.reqAutoCents) {
    gaps.push(`Auto ${formatLimit(req.reqAutoCents)} (${has(sub.autoLimitCents)})`);
  }
  if (req.reqUmbrellaCents != null && umb < req.reqUmbrellaCents) {
    gaps.push(`Umbrella ${formatLimit(req.reqUmbrellaCents)} (${has(sub.umbrellaLimitCents)})`);
  }
  if (req.reqWcEmployersLiabilityCents != null) {
    if (sub.workersCompExempt) gaps.push("Workers' comp required (sub is exempt)");
    else if (!sub.workersCompExpiresAt) gaps.push("Workers' comp required (not on file)");
  }
  const listed = (v: boolean | null, label: string) => {
    if (v !== true) gaps.push(`${label} for Sueep (${v === false ? "not on their COI" : "not checked"})`);
  };
  if (req.requiresAdditionalInsured) listed(sub.sueepAdditionalInsured, "Additional insured");
  if (req.requiresWaiverOfSubrogation) listed(sub.sueepWaiverOfSubrogation, "Waiver of subrogation");
  if (req.requiresPrimaryNoncontributory) listed(sub.sueepPrimaryNoncontributory, "Primary and noncontributory");
  return gaps;
}
