import { cache } from "react";
import { prisma } from "@/lib/prisma";
import type { CardBadge, CardRow, DashboardCardData } from "@/app/erp/(shell)/_dashboard/DashboardCard";
import { todayEasternAsUtcMidnight, todayEasternKey, utcDateKey } from "./dates";
import { centsToDollarsCompact } from "./money";
import { deriveProjectLifecycle, hasActiveChangeOrder } from "./projectLifecycle";
import { computeProjectActualsWithChangeOrders, isQualifyingChangeOrder } from "./projectMargin";
import { turnoverImpliedMarginPct, turnoverMarginSeverity, turnoverTotalHoursBudget } from "./turnoverHoursBudget";
import { loadCoiAlerts } from "./coiAlerts";

/**
 * Jobs tab: Job status board (DASHBOARDS_PLAN.md Phase 6). Every active job
 * with four lights, each reusing the rule another screen already uses so
 * they can't disagree:
 * - Schedule: past its end date and still open.
 * - Budget: turnovers use the Supervisor dashboard's hour-budget tiers;
 *   other jobs compare cost (or hours) so far with the estimate.
 * - Logs: scheduled days already passed with nothing logged, last 14 days
 *   (the Overview tab's "Needs labor logged" rule).
 * - COI: expired or expiring within 30 days (the COI alerts list).
 */

/** Share of the estimate used before a job shows on Over budget / goes amber. */
const BUDGET_WATCH_PCT = 80;
const LOG_WINDOW_DAYS = 14;
const DAY_MS = 86_400_000;

type Light = { badge: CardBadge; rank: number };
const RANK = { red: 3, orange: 2, amber: 1, green: 0 } as const;

function light(label: string, tone: CardBadge["tone"], title?: string): Light {
  return { badge: { label, tone, title }, rank: RANK[tone] };
}

function shortDate(key: string): string {
  return new Date(`${key}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function segmentKey(p: { turnoverRequestId: string | null; recurringContractPeriodId: string | null }): string {
  if (p.turnoverRequestId) return "turnovers";
  if (p.recurringContractPeriodId) return "janitorial";
  return "post-con";
}

const SEGMENT_LABEL: Record<string, string> = { "post-con": "Post-con", turnovers: "Turnover", janitorial: "Janitorial" };

type Budget = { pct: number; used: string; light: Light | null };

export type JobStatus = {
  row: CardRow;
  worst: number;
  redCount: number;
  budget: Budget | null;
  endKey: string | null;
};

/** Every active job's lights. Shared by the board and the Jobs tab's red count. */
export const loadJobStatuses = cache(async (): Promise<JobStatus[]> => {
  const todayKey = todayEasternKey();
  const todayStart = todayEasternAsUtcMidnight();
  const logWindowStart = new Date(todayStart.getTime() - (LOG_WINDOW_DAYS - 1) * DAY_MS);
  const laborSelect = { id: true, employeeId: true, workDate: true, createdAt: true, hours: true, hourlyRateCents: true } as const;

  const [projects, plannedDays, loggedDays, coiAlerts] = await Promise.all([
    prisma.project.findMany({
      where: { status: { notIn: ["COMPLETE", "COMPLETED", "ARCHIVED", "CANCELLED"] } },
      select: {
        id: true, jobTitle: true, status: true, projectDate: true, projectEndDate: true,
        turnoverRequestId: true, recurringContractPeriodId: true,
        contractValueCents: true, estLaborCents: true, estMaterialCents: true, estTravelCents: true, estHours: true,
        actualLaborCents: true, actualMaterialCents: true, actualTravelCents: true,
        laborEntries: { select: laborSelect },
        materialEntries: { select: { costCents: true } },
        contractorAssignments: { select: { costCents: true } },
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
    }),
    prisma.projectDayAssignment.findMany({
      where: { date: { gte: logWindowStart, lt: todayStart } },
      select: { projectId: true, date: true },
    }),
    prisma.laborEntry.findMany({
      where: { workDate: { gte: logWindowStart, lt: todayStart } },
      select: { projectId: true, workDate: true },
    }),
    loadCoiAlerts(),
  ]);

  // Active = what the rest of the ERP calls Active (not upcoming, not on hold).
  const active = projects.filter(
    (p) => deriveProjectLifecycle(p.status, p.projectDate?.toISOString() ?? null, hasActiveChangeOrder(p.changeOrders)) === "ACTIVE",
  );
  const actuals = await computeProjectActualsWithChangeOrders(active);

  const logged = new Set(loggedDays.map((e) => `${e.projectId}::${utcDateKey(e.workDate)}`));
  const missedDays = new Map<string, Set<string>>();
  for (const a of plannedDays) {
    const key = utcDateKey(a.date);
    if (logged.has(`${a.projectId}::${key}`)) continue;
    missedDays.set(a.projectId, (missedDays.get(a.projectId) ?? new Set()).add(key));
  }
  const coiByProject = new Map(coiAlerts.map((c) => [c.projectId, c.status]));

  return active.map((p): JobStatus => {
    const lights: Light[] = [];
    const endKey = p.projectEndDate ? utcDateKey(p.projectEndDate) : null;

    // Schedule
    if (endKey && endKey < todayKey) lights.push(light(`Past end date (${shortDate(endKey)})`, "red", "The end date has passed and the job is still open"));

    // Budget
    const budget = budgetOf(p, actuals.get(p.id));
    if (budget?.light) lights.push(budget.light);

    // Logs
    const missed = missedDays.get(p.id);
    if (missed?.size) {
      const days = [...missed].sort().map(shortDate).join(", ");
      lights.push(light(`${missed.size} day${missed.size === 1 ? "" : "s"} not logged`, missed.size > 1 ? "red" : "amber", `Scheduled, nothing logged: ${days}`));
    }

    // COI
    const coi = coiByProject.get(p.id);
    if (coi) {
      lights.push(coi.status === "EXPIRED"
        ? light("COI expired", "red", `${coi.holderName}'s COI expired`)
        : light(`COI expires in ${coi.daysLeft}d`, "amber", `${coi.holderName}'s COI expires soon`));
    }

    const worst = Math.max(0, ...lights.map((l) => l.rank));
    const seg = segmentKey(p);
    return {
      worst,
      redCount: lights.filter((l) => l.rank === RANK.red).length,
      budget,
      endKey,
      row: {
        id: p.id,
        href: `/erp/projects/${p.id}`,
        title: p.jobTitle,
        note: `${SEGMENT_LABEL[seg]}${endKey ? ` · ends ${shortDate(endKey)}` : " · no end date"}`,
        value: budget ? `${Math.round(budget.pct)}% used` : "",
        secondary: budget?.used,
        badges: lights.length ? lights.sort((a, b) => b.rank - a.rank).map((l) => l.badge) : [{ label: "On track", tone: "green" }],
        filterKey: seg,
      },
    };
  });
});

type ProjectForBudget = {
  turnoverRequestId: string | null;
  contractValueCents: number | null;
  estLaborCents: number | null;
  estMaterialCents: number | null;
  estTravelCents: number | null;
  estHours: number | null;
  laborEntries: { hours: number }[];
  changeOrders: { status: string; estimatedCostCents: number | null }[];
};

/** How much of the job's budget is used, and its light, or null when it has no budget to compare with. */
function budgetOf(p: ProjectForBudget, a: { actualLaborCents: number; actualMaterialCents: number; actualTravelCents: number } | undefined): Budget | null {
  const hours = p.laborEntries.reduce((s, e) => s + e.hours, 0);

  // Turnovers: same tiers and labels as the Supervisor dashboard's badges.
  if (p.turnoverRequestId) {
    if (!p.contractValueCents) return null;
    const budgetHours = turnoverTotalHoursBudget(p.contractValueCents);
    const severity = turnoverMarginSeverity(turnoverImpliedMarginPct(p.contractValueCents, hours));
    const title = `${hours.toFixed(1)} of ${budgetHours.toFixed(1)} hr budget`;
    return {
      pct: budgetHours > 0 ? (hours / budgetHours) * 100 : 0,
      used: `${Math.round(hours)} of ${Math.round(budgetHours)} hrs`,
      light: severity === "bad" ? light("Over budget", "red", title)
        : severity === "critical" ? light("Margin <30%", "orange", title)
        : severity === "watch" ? light("Watch hours", "amber", title)
        : null,
    };
  }

  // Other jobs: cost so far vs the estimate (change order estimates included), else hours vs estimated hours.
  const hasEstimate = p.estLaborCents != null || p.estMaterialCents != null;
  const est = (p.estLaborCents ?? 0) + (p.estMaterialCents ?? 0) + (p.estTravelCents ?? 0)
    + p.changeOrders.filter(isQualifyingChangeOrder).reduce((s, co) => s + (co.estimatedCostCents ?? 0), 0);
  let pct: number;
  let used: string;
  if (hasEstimate && est > 0 && a) {
    const cost = a.actualLaborCents + a.actualMaterialCents + a.actualTravelCents;
    pct = (cost / est) * 100;
    used = `${centsToDollarsCompact(cost)} of ${centsToDollarsCompact(est)}`;
  } else if (p.estHours && p.estHours > 0) {
    pct = (hours / p.estHours) * 100;
    used = `${Math.round(hours)} of ${Math.round(p.estHours)} hrs`;
  } else {
    return null;
  }
  return {
    pct,
    used,
    light: pct >= 100 ? light("Over estimate", "red", `${used} used`) : pct >= BUDGET_WATCH_PCT ? light(`${Math.round(pct)}% of estimate`, "amber", `${used} used`) : null,
  };
}

export async function loadJobStatusBoard(): Promise<DashboardCardData> {
  const jobs = await loadJobStatuses();
  const byEnd = (a: JobStatus, b: JobStatus) => (a.endKey ?? "9999").localeCompare(b.endKey ?? "9999");
  const problems = jobs.filter((j) => j.worst > 0).sort((a, b) => b.worst - a.worst || b.redCount - a.redCount || byEnd(a, b));
  const all = [...jobs].sort((a, b) => b.worst - a.worst || byEnd(a, b));
  const overBudget = jobs.filter((j) => j.budget && j.budget.pct >= BUDGET_WATCH_PCT).sort((a, b) => b.budget!.pct - a.budget!.pct);
  const redJobs = jobs.filter((j) => j.redCount > 0).length;

  return {
    alertCount: redJobs,
    filters: [
      { key: "post-con", label: "Post-con" },
      { key: "turnovers", label: "Turnovers" },
      { key: "janitorial", label: "Janitorial" },
    ],
    sections: [
      { key: "problems", label: "Problems", rows: problems.map((j) => j.row), empty: "Every active job is on track.", alertCount: redJobs },
      { key: "all", label: "All", rows: all.map((j) => j.row), empty: "No active jobs.", footer: `${jobs.length} active job${jobs.length === 1 ? "" : "s"}`, href: "/erp/projects" },
      { key: "over-budget", label: "Over budget", rows: overBudget.map((j) => j.row), empty: `No active job has used ${BUDGET_WATCH_PCT}% of its budget.` },
    ],
  };
}

/** Red number on the Jobs tab: active jobs with at least one red light. */
export async function countRedJobs(): Promise<number> {
  return (await loadJobStatuses()).filter((j) => j.redCount > 0).length;
}
