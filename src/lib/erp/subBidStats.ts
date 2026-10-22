import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { bidOurPriceCents, bidScopeKey, bidderKey, type SubBidStatus } from "@/lib/erp/subBids";
import { marginScoreFromPct, pricingScoreFromVsLowest, type PricingJob, type SubScores } from "@/lib/erp/subScores";
import { computeProjectActualsWithChangeOrders } from "@/lib/erp/projectMargin";

/**
 * A contractor's bid history with the numbers worked out: margin to us, and
 * how each bid compares with the other bids on the same lines of the same
 * project. Withdrawn bids are listed but left out of every average.
 */

export type ContractorBidLine = {
  id: string;
  projectId: string;
  projectTitle: string;
  scopeLabel: string;
  amountCents: number;
  ourCents: number | null;
  marginCents: number | null;
  /** Percent above (+) or under (-) the cheapest other bid on the same lines. Null when nobody else bid. */
  vsLowestPct: number | null;
  /** Other subs' bids on the same lines, withdrawn ones not counted */
  otherBids: number;
  receivedOn: string | null;
  status: SubBidStatus;
  files: { id: string; filename: string }[];
};

export type ContractorBidSummary = {
  bids: number;
  awarded: number;
  /** Average margin %, over bids with a known price for us */
  avgMarginPct: number | null;
  /** Average % above (+) or under (-) the cheapest other bid, over bids that had competition */
  avgVsLowestPct: number | null;
};

const COUNTED = (s: string) => s !== "WITHDRAWN";

function avg(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

/** Bid lines for these contractors (all of them when no ids are given), newest first. */
export function loadContractorBidLines(contractorIds?: string[]): Promise<Map<string, ContractorBidLine[]>> {
  return loadBidLinesGrouped(contractorIds ? { contractorId: { in: contractorIds } } : { contractorId: { not: null } }, (b) => b.contractorId);
}

/** Bid lines for subs with no profile, grouped by bidderKey (same sub across bids), newest first. */
export function loadBidderBidLines(): Promise<Map<string, ContractorBidLine[]>> {
  return loadBidLinesGrouped({ contractorId: null }, (b) => bidderKey(b));
}

const bidPick = {
  id: true,
  contractorId: true,
  bidderName: true,
  bidderCompany: true,
  bidderEmail: true,
  projectId: true,
  amountCents: true,
  receivedOn: true,
  createdAt: true,
  status: true,
  sovItems: { select: { id: true } },
  attachments: { select: { id: true, filename: true }, orderBy: { createdAt: "asc" } },
} satisfies Prisma.SubBidSelect;

/** The bids `where` picks, worked out against every bid on their projects, grouped by `groupOf` (null skips). */
async function loadBidLinesGrouped(
  where: Prisma.SubBidWhereInput,
  groupOf: (b: Prisma.SubBidGetPayload<{ select: typeof bidPick }>) => string | null,
): Promise<Map<string, ContractorBidLine[]>> {
  const theirs = await prisma.subBid.findMany({ where, select: bidPick, orderBy: [{ receivedOn: "desc" }, { createdAt: "desc" }] });
  const out = new Map<string, ContractorBidLine[]>();
  if (theirs.length === 0) return out;

  const projectIds = [...new Set(theirs.map((b) => b.projectId))];
  const [projects, allBids] = await Promise.all([
    prisma.project.findMany({
      where: { id: { in: projectIds } },
      select: { id: true, jobTitle: true, contractValueCents: true, sov: { select: { items: { select: { id: true, description: true, scheduledValueCents: true } } } } },
    }),
    prisma.subBid.findMany({
      where: { projectId: { in: projectIds } },
      select: { id: true, projectId: true, amountCents: true, status: true, sovItems: { select: { id: true } } },
    }),
  ]);
  const projectById = new Map(projects.map((p) => [p.id, p]));

  // Every counted bid per project + scope, to compare against.
  const byScope = new Map<string, { id: string; amountCents: number }[]>();
  for (const b of allBids) {
    if (!COUNTED(b.status)) continue;
    const key = `${b.projectId}|${bidScopeKey(b.sovItems.map((s) => s.id))}`;
    byScope.set(key, [...(byScope.get(key) ?? []), { id: b.id, amountCents: b.amountCents }]);
  }

  for (const b of theirs) {
    const project = projectById.get(b.projectId);
    if (!project) continue;
    const sovItems = project.sov?.items ?? [];
    const sovValues = new Map(sovItems.map((s) => [s.id, s.scheduledValueCents]));
    const sovNames = new Map(sovItems.map((s) => [s.id, s.description]));
    const ids = b.sovItems.map((s) => s.id);
    const ourCents = bidOurPriceCents(ids, sovValues, project.contractValueCents);
    const others = (byScope.get(`${b.projectId}|${bidScopeKey(ids)}`) ?? []).filter((o) => o.id !== b.id);
    const lowestOther = others.length ? Math.min(...others.map((o) => o.amountCents)) : null;
    const line: ContractorBidLine = {
      id: b.id,
      projectId: b.projectId,
      projectTitle: project.jobTitle,
      scopeLabel: ids.length === 0 ? "Whole job" : ids.map((id) => sovNames.get(id) ?? "Removed line").join(", "),
      amountCents: b.amountCents,
      ourCents,
      marginCents: ourCents != null ? ourCents - b.amountCents : null,
      vsLowestPct: lowestOther != null && lowestOther > 0 ? ((b.amountCents - lowestOther) / lowestOther) * 100 : null,
      otherBids: others.length,
      receivedOn: b.receivedOn ? b.receivedOn.toISOString().slice(0, 10) : null,
      status: b.status as SubBidStatus,
      files: b.attachments,
    };
    const group = groupOf(b);
    if (!group) continue;
    out.set(group, [...(out.get(group) ?? []), line]);
  }
  return out;
}

export function summarizeBids(lines: ContractorBidLine[]): ContractorBidSummary {
  const counted = lines.filter((l) => COUNTED(l.status));
  return {
    bids: lines.length,
    awarded: lines.filter((l) => l.status === "AWARDED").length,
    avgMarginPct: avg(counted.filter((l) => l.ourCents && l.marginCents != null).map((l) => (l.marginCents! / l.ourCents!) * 100)),
    avgVsLowestPct: avg(counted.filter((l) => l.vsLowestPct != null).map((l) => l.vsLowestPct!)),
  };
}

/**
 * Jobs each contractor was paid on (base job or one of its change orders),
 * with the job's labor margin %: contract plus qualifying change orders,
 * minus all labor (every sub's pay and employee labor). Jobs with no
 * contract value are skipped.
 */
export async function loadPaidJobMargins(contractorIds?: string[]): Promise<Map<string, PricingJob[]>> {
  const filter = contractorIds ? { contractorId: { in: contractorIds } } : {};
  const [base, co] = await Promise.all([
    prisma.contractorAssignment.findMany({ where: { ...filter, projectId: { not: null } }, select: { contractorId: true, projectId: true } }),
    prisma.changeOrderContractorAssignment.findMany({ where: filter, select: { contractorId: true, changeOrder: { select: { projectId: true } } } }),
  ]);
  const jobsByContractor = new Map<string, Set<string>>();
  const add = (cid: string, pid: string) => jobsByContractor.set(cid, (jobsByContractor.get(cid) ?? new Set()).add(pid));
  for (const a of base) add(a.contractorId, a.projectId!);
  for (const a of co) add(a.contractorId, a.changeOrder.projectId);
  const out = new Map<string, PricingJob[]>();
  if (jobsByContractor.size === 0) return out;

  const laborSelect = { id: true, employeeId: true, workDate: true, createdAt: true, hours: true, hourlyRateCents: true } as const;
  const projects = await prisma.project.findMany({
    where: { id: { in: [...new Set([...jobsByContractor.values()].flatMap((set) => [...set]))] } },
    select: {
      id: true,
      jobTitle: true,
      contractValueCents: true,
      actualLaborCents: true,
      actualMaterialCents: true,
      actualTravelCents: true,
      laborEntries: { select: laborSelect },
      materialEntries: { select: { costCents: true } },
      contractorAssignments: { select: { costCents: true } },
      changeOrders: {
        select: {
          status: true,
          contractValueCents: true,
          estimatedCostCents: true,
          actualLaborCents: true,
          actualMaterialCents: true,
          actualTravelCents: true,
          materialEntries: { select: { costCents: true } },
          laborers: { select: laborSelect },
          contractorAssignments: { select: { costCents: true } },
        },
      },
    },
  });
  const actuals = await computeProjectActualsWithChangeOrders(projects);
  const titleById = new Map(projects.map((p) => [p.id, p.jobTitle]));

  for (const [cid, pids] of jobsByContractor) {
    const jobs: PricingJob[] = [];
    for (const pid of pids) {
      const a = actuals.get(pid);
      if (!a?.contractValueCents || a.contractValueCents <= 0) continue;
      jobs.push({
        projectId: pid,
        projectTitle: titleById.get(pid) ?? "",
        marginPct: ((a.contractValueCents - a.actualLaborCents) / a.contractValueCents) * 100,
        source: "paid",
      });
    }
    if (jobs.length) out.set(cid, jobs);
  }
  return out;
}

/** Scores for these contractors (all of them when no ids are given). Only contractors with a rating, a bid or an override are in the map. */
export async function loadSubScores(contractorIds?: string[]): Promise<Map<string, SubScores>> {
  const where = contractorIds ? { contractorId: { in: contractorIds } } : {};
  const [lineMap, paidMap, ratingAvgs, overrides] = await Promise.all([
    loadContractorBidLines(contractorIds),
    loadPaidJobMargins(contractorIds),
    prisma.contractorRating.groupBy({
      by: ["contractorId"],
      where,
      _avg: { quality: true, reliability: true, communication: true },
      _count: { _all: true },
    }),
    prisma.contractor.findMany({
      where: { pricingScoreOverride: { not: null }, ...(contractorIds ? { id: { in: contractorIds } } : {}) },
      select: { id: true, pricingScoreOverride: true },
    }),
  ]);
  const ratingsById = new Map(ratingAvgs.map((r) => [r.contractorId, r]));
  const overrideById = new Map(overrides.map((o) => [o.id, o.pricingScoreOverride]));
  const ids = new Set([...lineMap.keys(), ...paidMap.keys(), ...ratingsById.keys(), ...overrideById.keys()]);

  const out = new Map<string, SubScores>();
  for (const id of ids) {
    const r = ratingsById.get(id);
    const lines = lineMap.get(id) ?? [];
    const summary = summarizeBids(lines);
    const vsOthersScore = pricingScoreFromVsLowest(summary.avgVsLowestPct);

    // Margin part: awarded bids at the bid's margin, then paid jobs, but a
    // job with an awarded bid from them only counts once (as the bid).
    const awarded = lines.filter((l) => l.status === "AWARDED" && l.ourCents && l.marginCents != null);
    const awardedProjects = new Set(awarded.map((l) => l.projectId));
    const marginJobs: PricingJob[] = [
      ...awarded.map((l) => ({ projectId: l.projectId, projectTitle: l.projectTitle, marginPct: (l.marginCents! / l.ourCents!) * 100, source: "bid" as const })),
      ...(paidMap.get(id) ?? []).filter((j) => !awardedProjects.has(j.projectId)),
    ];
    const avgMarginPct = avg(marginJobs.map((j) => j.marginPct));
    const marginScore = marginScoreFromPct(avgMarginPct);
    const parts = [vsOthersScore, marginScore].filter((v): v is number => v != null);
    const pricingAuto = parts.length ? avg(parts) : null;
    const pricingOverride = overrideById.get(id) ?? null;
    const three = r ? [r._avg.quality, r._avg.reliability, r._avg.communication].filter((v): v is number => v != null) : [];
    out.set(id, {
      quality: r?._avg.quality ?? null,
      reliability: r?._avg.reliability ?? null,
      communication: r?._avg.communication ?? null,
      confidence: avg(three),
      ratingCount: r?._count._all ?? 0,
      pricingAuto,
      vsOthersScore,
      comparedBids: lines.filter((l) => COUNTED(l.status) && l.vsLowestPct != null).length,
      marginScore,
      avgMarginPct,
      marginJobs,
      pricingOverride,
      pricing: pricingOverride ?? pricingAuto,
    });
  }
  return out;
}

/** Cleared when a bid, rating or pricing override is saved, so those show at once. */
export const SUB_SCORES_TAG = "sub-scores";

/**
 * Every contractor's scores, cached 10 minutes. Scoring everyone costs every
 * job any sub worked on (5.6s locally), and the project page's Proposals tab
 * and the Contractors list ask on each load. Job cost changes (labor logged)
 * show within the 10 minutes; bids, ratings and overrides clear it at once.
 */
const cachedAllSubScores = unstable_cache(async () => [...(await loadSubScores())], ["sub-scores-all-v1"], {
  revalidate: 600,
  tags: [SUB_SCORES_TAG],
});

export async function loadAllSubScoresCached(): Promise<Map<string, SubScores>> {
  return new Map(await cachedAllSubScores());
}
