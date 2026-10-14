import { cache } from "react";
import { prisma } from "@/lib/prisma";
import type { JobTabRow } from "@/app/erp/(shell)/_dashboard/JobTabs";
import type { DashboardCardData } from "@/app/erp/(shell)/_dashboard/DashboardCard";
import { todayEasternAsUtcMidnight, todayEasternKey, utcDateKey } from "./dates";
import { centsToDollarsCompact } from "./money";
import { computeProjectActualsWithChangeOrders } from "./projectMargin";
import { normalizeProjectSegment, projectSegmentLabel } from "./projectSegments";
import { turnoverTotalHoursBudget } from "./turnoverHoursBudget";

/**
 * Estimation dashboard cards (DASHBOARDS_PLAN.md Phase 2): Waiting on me,
 * Estimate accuracy, Pricing check.
 *
 * Turnovers are priced from the building's rate card, and their labor
 * budget is a fixed share of that price (turnoverHoursBudget.ts), so nobody
 * types in a turnover estimate. That's why turnovers only wait on
 * Estimation when they have no price, and why their accuracy is budgeted
 * hours vs logged hours instead of estimate vs cost.
 */

const DONE_STATUSES = ["COMPLETE", "COMPLETED", "ARCHIVED", "CANCELLED"];
/** Change orders still being worked out (not finished, billed, or dead). */
const OPEN_CO_STATUSES = ["DRAFT", "SUBMITTED", "APPROVED"];
/** Start this close (or already started) and still no estimate = urgent. */
const URGENT_DAYS = 7;
/** Completed jobs this far back feed Accuracy and Pricing. */
const LOOKBACK_DAYS = 183;
/** Within this much of the estimate counts as on target. */
const ON_TARGET_PCT = 5;
/** Biggest misses shown for each job type (2 types x 3 fits before "See all"). */
const MISSES_PER_TYPE = 3;
/** Margin under this shows red (same line as the dashboard margin colors). */
const LOW_MARGIN_PCT = 15;

const DAY_MS = 86_400_000;

function daysBetween(fromKey: string, toKey: string): number {
  return Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / DAY_MS);
}

function shortDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** "12% over", "8% under", or "On target" for actual vs planned. */
function missLabel(planned: number, actual: number): { text: string; pct: number; over: boolean } {
  const pct = planned > 0 ? ((actual - planned) / planned) * 100 : 0;
  if (Math.abs(pct) < ON_TARGET_PCT) return { text: "On target", pct, over: false };
  return { text: `${Math.abs(Math.round(pct))}% ${pct > 0 ? "over" : "under"}`, pct, over: pct > 0 };
}

// ── Waiting on me ──────────────────────────────────────────────────────────

type WaitingProject = {
  id: string;
  jobTitle: string;
  createdAt: Date;
  projectDate: Date | null;
  estLaborCents: number | null;
  estMaterialCents: number | null;
  turnoverRequestId: string | null;
  contractValueCents: number | null;
};

/** Open jobs that still need something from Estimation, oldest first. */
async function loadWaitingProjects(): Promise<WaitingProject[]> {
  return prisma.project.findMany({
    where: {
      status: { notIn: DONE_STATUSES },
      OR: [
        // Regular jobs: missing either estimate.
        { turnoverRequestId: null, OR: [{ estLaborCents: null }, { estMaterialCents: null }] },
        // Turnovers: only when they have no price at all.
        { turnoverRequestId: { not: null }, contractValueCents: null },
      ],
    },
    select: { id: true, jobTitle: true, createdAt: true, projectDate: true, estLaborCents: true, estMaterialCents: true, turnoverRequestId: true, contractValueCents: true },
    orderBy: { createdAt: "asc" },
  });
}

/** Starts within URGENT_DAYS, or already started, with no start date counting as not urgent. */
function isUrgent(p: { projectDate: Date | null }, todayKey: string): boolean {
  return !!p.projectDate && daysBetween(todayKey, utcDateKey(p.projectDate)) <= URGENT_DAYS;
}

function missingText(p: WaitingProject): string {
  if (p.turnoverRequestId) return "No price yet";
  if (p.estLaborCents == null && p.estMaterialCents == null) return "Missing labor and material";
  return p.estLaborCents == null ? "Missing labor" : "Missing material";
}

function startText(p: { projectDate: Date | null }, todayKey: string): { value: string; urgent: boolean } {
  if (!p.projectDate) return { value: "No start date", urgent: false };
  const days = daysBetween(todayKey, utcDateKey(p.projectDate));
  if (days < 0) return { value: `Started ${shortDate(p.projectDate)}`, urgent: true };
  if (days === 0) return { value: "Starts today", urgent: true };
  if (days <= URGENT_DAYS) return { value: `Starts in ${plural(days, "day")}`, urgent: true };
  return { value: `Starts ${shortDate(p.projectDate)}`, urgent: false };
}

type OpenChangeOrder = {
  id: string;
  title: string;
  status: string;
  createdAt: Date;
  startDate: Date | null;
  estLaborCents: number | null;
  estMaterialCents: number | null;
  estimatedCostCents: number | null;
  project: { id: string; jobTitle: string };
};

async function loadOpenChangeOrders(): Promise<OpenChangeOrder[]> {
  return prisma.projectChangeOrder.findMany({
    where: { status: { in: OPEN_CO_STATUSES } },
    select: {
      id: true, title: true, status: true, createdAt: true, startDate: true,
      estLaborCents: true, estMaterialCents: true, estimatedCostCents: true,
      project: { select: { id: true, jobTitle: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

function coMissingEstimate(co: OpenChangeOrder): boolean {
  return co.estimatedCostCents == null && co.estLaborCents == null && co.estMaterialCents == null;
}

const CO_STATUS_LABEL: Record<string, string> = { DRAFT: "Draft", SUBMITTED: "Submitted", APPROVED: "Approved" };

export async function loadWaitingOnMe(): Promise<DashboardCardData> {
  const [projects, changeOrders] = await Promise.all([loadWaitingProjects(), loadOpenChangeOrders()]);
  const todayKey = todayEasternKey();

  const projectRows: JobTabRow[] = projects.map((p) => {
    const start = startText(p, todayKey);
    const waited = daysBetween(todayEasternKey(p.createdAt), todayKey);
    return {
      id: p.id,
      href: `/erp/projects/${p.id}`,
      title: p.jobTitle,
      note: `Waiting ${plural(waited, "day")} · ${missingText(p)}`,
      value: start.value,
      negative: start.urgent,
    };
  });

  // Missing an estimate first, then oldest first within each group.
  const sortedCOs = [...changeOrders].sort((a, b) => Number(coMissingEstimate(b)) - Number(coMissingEstimate(a)));
  const coRows: JobTabRow[] = sortedCOs.map((co) => {
    const missing = coMissingEstimate(co);
    const waited = daysBetween(todayEasternKey(co.createdAt), todayKey);
    return {
      id: co.id,
      href: `/erp/projects/${co.project.id}/change-orders/${co.id}`,
      title: co.title,
      note: `${co.project.jobTitle} · ${CO_STATUS_LABEL[co.status] ?? co.status} · ${plural(waited, "day")} old`,
      value: missing ? "No estimate" : "Estimated",
      negative: missing,
    };
  });

  const urgentProjects = projects.filter((p) => isUrgent(p, todayKey)).length;
  const missingCOs = changeOrders.filter(coMissingEstimate).length;
  return {
    alertCount: urgentProjects + missingCOs,
    sections: [
      { key: "projects", label: "Projects", rows: projectRows, empty: "Every open job has its estimates.", alertCount: urgentProjects, href: "/erp/projects" },
      { key: "change-orders", label: "Change orders", rows: coRows, empty: "No open change orders.", alertCount: missingCOs },
    ],
  };
}

/** Red number for the Queue tab: jobs starting within a week with no estimate, plus change orders with no estimate. */
export async function countWaitingOnMeAlerts(): Promise<number> {
  const todayStart = todayEasternAsUtcMidnight();
  const urgentCutoff = new Date(todayStart.getTime() + URGENT_DAYS * DAY_MS);
  const [urgentProjects, missingCOs] = await Promise.all([
    prisma.project.count({
      where: {
        status: { notIn: DONE_STATUSES },
        projectDate: { not: null, lte: urgentCutoff },
        OR: [
          { turnoverRequestId: null, OR: [{ estLaborCents: null }, { estMaterialCents: null }] },
          { turnoverRequestId: { not: null }, contractValueCents: null },
        ],
      },
    }),
    prisma.projectChangeOrder.count({
      where: { status: { in: OPEN_CO_STATUSES }, estimatedCostCents: null, estLaborCents: null, estMaterialCents: null },
    }),
  ]);
  return urgentProjects + missingCOs;
}

// ── Completed jobs (shared by Accuracy and Pricing) ────────────────────────

type DoneJob = {
  id: string;
  jobTitle: string;
  segment: string;
  isTurnover: boolean;
  finishedKey: string;
  contractValueCents: number | null;
  estCostCents: number | null;
  /** Base project only, change orders left out (estimates are for the base job). */
  baseActualCents: number;
  /** Project plus change orders, for margin. */
  marginPct: number | null;
  totalValueCents: number | null;
  loggedHours: number;
  bedrooms: number | null;
  bathrooms: number | null;
};

/** Completed jobs that finished in the last LOOKBACK_DAYS. Finished = the
 * turnover completion day, else the project end date (same as Finance). */
const loadDoneJobs = cache(async (): Promise<DoneJob[]> => {
  const sinceKey = utcDateKey(new Date(todayEasternAsUtcMidnight().getTime() - LOOKBACK_DAYS * DAY_MS));
  const since = new Date(`${sinceKey}T00:00:00Z`);
  const laborSelect = { id: true, employeeId: true, workDate: true, createdAt: true, hours: true, hourlyRateCents: true } as const;
  const projects = await prisma.project.findMany({
    where: {
      status: { in: ["COMPLETE", "COMPLETED"] },
      OR: [{ turnoverCompletedAt: { gte: since } }, { turnoverCompletedAt: null, projectEndDate: { gte: since } }],
    },
    select: {
      id: true, jobTitle: true, segment: true, turnoverRequestId: true,
      projectEndDate: true, turnoverCompletedAt: true,
      contractValueCents: true, estLaborCents: true, estMaterialCents: true, estTravelCents: true,
      actualLaborCents: true, actualMaterialCents: true, actualTravelCents: true,
      laborEntries: { select: laborSelect },
      materialEntries: { select: { costCents: true } },
      contractorAssignments: { select: { costCents: true } },
      turnoverRequest: { select: { bedrooms: true, bathrooms: true } },
      changeOrders: {
        select: {
          status: true, contractValueCents: true, estimatedCostCents: true,
          actualLaborCents: true, actualMaterialCents: true, actualTravelCents: true,
          materialEntries: { select: { costCents: true } },
          laborers: { select: laborSelect },
          contractorAssignments: { select: { costCents: true } },
        },
      },
    },
  });
  const actuals = await computeProjectActualsWithChangeOrders(projects);

  return projects.flatMap((p): DoneJob[] => {
    // A janitorial-segment job not linked to a turnover request isn't a
    // real turnover (it has no rate-card price or hour budget), so it would
    // only show as a confusing one-job group. Left out on purpose.
    if (!p.turnoverRequestId && normalizeProjectSegment(p.segment) === "JANITORIAL_TURNOVER_REQUESTS") return [];
    const a = actuals.get(p.id);
    if (!a) return [];
    const finished = p.turnoverCompletedAt ? todayEasternKey(p.turnoverCompletedAt) : p.projectEndDate ? utcDateKey(p.projectEndDate) : null;
    if (!finished || finished < sinceKey) return [];
    const hasEstimate = p.estLaborCents != null || p.estMaterialCents != null;
    const baseActualCents = a.base.laborCents + a.base.contractorCents + a.base.materialCents + a.base.travelCents;
    const totalCost = a.actualLaborCents + a.actualMaterialCents + a.actualTravelCents;
    return [{
      id: p.id,
      jobTitle: p.jobTitle,
      segment: p.segment,
      isTurnover: !!p.turnoverRequestId,
      finishedKey: finished,
      contractValueCents: p.contractValueCents,
      estCostCents: hasEstimate ? (p.estLaborCents ?? 0) + (p.estMaterialCents ?? 0) + (p.estTravelCents ?? 0) : null,
      baseActualCents,
      totalValueCents: a.contractValueCents,
      marginPct: a.contractValueCents && a.contractValueCents > 0 && totalCost > 0 && a.marginCents != null
        ? (a.marginCents / a.contractValueCents) * 100
        : null,
      loggedHours: p.laborEntries.reduce((s, e) => s + e.hours, 0),
      bedrooms: p.turnoverRequest?.bedrooms ?? null,
      bathrooms: p.turnoverRequest?.bathrooms ?? null,
    }];
  });
});

function typeLabel(job: Pick<DoneJob, "isTurnover" | "segment">): string {
  return job.isTurnover ? "Turnovers" : projectSegmentLabel(job.segment);
}

// ── Estimate accuracy ──────────────────────────────────────────────────────

type Comparison = { job: DoneJob; planned: number; actual: number; unit: "cents" | "hours" };

/** What each finished job can be compared on, or null when it can't be. */
function comparisonFor(job: DoneJob): Comparison | null {
  if (job.isTurnover) {
    if (!job.contractValueCents || job.loggedHours <= 0) return null;
    return { job, planned: turnoverTotalHoursBudget(job.contractValueCents), actual: job.loggedHours, unit: "hours" };
  }
  if (!job.estCostCents || job.baseActualCents <= 0) return null;
  return { job, planned: job.estCostCents, actual: job.baseActualCents, unit: "cents" };
}

/** A cost estimate above the job's own price is almost always a typo, and
 * one of those can swing a whole group, so it gets called out. */
function estimateAbovePrice(c: Comparison): boolean {
  return c.unit === "cents" && !!c.job.contractValueCents && c.planned > c.job.contractValueCents;
}

function amountText(n: number, unit: Comparison["unit"]): string {
  return unit === "hours" ? `${Math.round(n)} hrs` : centsToDollarsCompact(n);
}

export async function loadEstimateAccuracy(): Promise<DashboardCardData> {
  const jobs = await loadDoneJobs();
  const comparisons = jobs.map(comparisonFor).filter((c): c is Comparison => c != null);
  const skipped = jobs.length - comparisons.length;

  const groups = new Map<string, Comparison[]>();
  for (const c of comparisons) {
    const key = typeLabel(c.job);
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }

  // Totals, not an average of percents, so one tiny job can't swing a group.
  const typeRows: JobTabRow[] = [...groups.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([label, list]) => {
      const unit = list[0].unit;
      const planned = list.reduce((s, c) => s + c.planned, 0);
      const actual = list.reduce((s, c) => s + c.actual, 0);
      const miss = missLabel(planned, actual);
      return {
        id: label,
        href: "/erp/projects",
        title: label,
        note: `${plural(list.length, "job")} · ${unit === "hours" ? "budget" : "est."} ${amountText(planned, unit)} vs actual ${amountText(actual, unit)}`,
        value: miss.text,
        negative: miss.over,
      };
    });

  // Top misses per type, under a heading each: small turnovers miss by big
  // percents (a 4 hr budget), which would otherwise crowd out every other type.
  const missRows: JobTabRow[] = [...groups.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .flatMap(([label, list]) => list
      .map((c) => ({ c, miss: missLabel(c.planned, c.actual), group: label }))
      .filter(({ miss }) => miss.text !== "On target")
      .sort((a, b) => Math.abs(b.miss.pct) - Math.abs(a.miss.pct))
      .slice(0, MISSES_PER_TYPE))
    .map(({ c, miss, group }) => ({
      group,
      id: c.job.id,
      href: `/erp/projects/${c.job.id}`,
      title: c.job.jobTitle,
      note: estimateAbovePrice(c)
        ? "Estimate is higher than the price, check it"
        : `Finished ${shortDate(new Date(`${c.job.finishedKey}T00:00:00Z`))}`,
      value: miss.text,
      negative: miss.over,
      secondary: `${amountText(c.actual, c.unit)} of ${amountText(c.planned, c.unit)}`,
    }));

  const aboveCount = comparisons.filter(estimateAbovePrice).length;
  const skippedNote = [
    skipped ? `${plural(skipped, "job")} skipped, no estimate or no costs logged` : null,
    aboveCount ? `${aboveCount} with an estimate above the price` : null,
  ].filter(Boolean).join(" · ") || undefined;
  return {
    sections: [
      { key: "by-type", label: "By type", rows: typeRows, empty: "No finished jobs to compare yet.", footer: skippedNote },
      { key: "misses", label: "Biggest misses", rows: missRows, empty: "Every job landed within 5% of its estimate." },
    ],
  };
}

// ── Pricing check ──────────────────────────────────────────────────────────

type PriceGroup = { label: string; sortKey: string; jobs: DoneJob[] };

function priceRow(g: PriceGroup): JobTabRow {
  const priced = g.jobs.filter((j) => j.totalValueCents != null && j.totalValueCents > 0);
  const avgPrice = priced.length ? priced.reduce((s, j) => s + (j.totalValueCents ?? 0), 0) / priced.length : 0;
  const withMargin = g.jobs.filter((j) => j.marginPct != null && j.totalValueCents);
  // Margin over the group's totals, so big jobs count for more than small ones.
  const value = withMargin.reduce((s, j) => s + (j.totalValueCents ?? 0), 0);
  const margin = value > 0 ? withMargin.reduce((s, j) => s + ((j.marginPct ?? 0) / 100) * (j.totalValueCents ?? 0), 0) / value * 100 : null;
  return {
    id: g.label,
    href: "/erp/projects",
    title: g.label,
    note: `${plural(g.jobs.length, "job")}${margin != null ? ` · ${Math.round(margin)}% margin` : ""}`,
    value: priced.length ? `${centsToDollarsCompact(Math.round(avgPrice))} avg` : "No prices",
    negative: margin != null && margin < LOW_MARGIN_PCT,
  };
}

function sizeLabel(j: DoneJob): { label: string; sortKey: string } {
  if (j.bedrooms == null && j.bathrooms == null) return { label: "Size not set", sortKey: "zz" };
  const bed = j.bedrooms == null ? "?" : j.bedrooms === 0 ? "Studio" : `${j.bedrooms} bed`;
  const bath = j.bathrooms == null ? "? bath" : `${j.bathrooms} bath`;
  return { label: `${bed} / ${bath}`, sortKey: `${String(j.bedrooms ?? 99).padStart(2, "0")}-${String(j.bathrooms ?? 99).padStart(2, "0")}` };
}

export async function loadPricingCheck(): Promise<DashboardCardData> {
  const jobs = await loadDoneJobs();

  const byType = new Map<string, PriceGroup>();
  for (const j of jobs) {
    const label = typeLabel(j);
    const g = byType.get(label) ?? { label, sortKey: label, jobs: [] };
    g.jobs.push(j);
    byType.set(label, g);
  }

  const bySize = new Map<string, PriceGroup>();
  for (const j of jobs.filter((x) => x.isTurnover)) {
    const { label, sortKey } = sizeLabel(j);
    const g = bySize.get(label) ?? { label, sortKey, jobs: [] };
    g.jobs.push(j);
    bySize.set(label, g);
  }

  return {
    sections: [
      {
        key: "by-type",
        label: "By type",
        rows: [...byType.values()].sort((a, b) => b.jobs.length - a.jobs.length).map(priceRow),
        empty: "No finished jobs yet.",
        footer: "Finished in the last 6 months",
      },
      {
        key: "turnover-size",
        label: "Turnovers by size",
        rows: [...bySize.values()].sort((a, b) => a.sortKey.localeCompare(b.sortKey)).map(priceRow),
        empty: "No finished turnovers yet.",
        footer: "Price per sq ft comes with the sq ft pricing update",
      },
    ],
  };
}
