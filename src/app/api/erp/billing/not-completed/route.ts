import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseHubSpotPipelineStageMap } from "@/lib/hubspot/pipelineStages";
import { JANITORIAL_BILLING_SEGMENTS } from "@/lib/erp/billingStatus";
import { todayEasternAsUtcMidnight } from "@/lib/erp/dates";
import { dayKey } from "@/lib/erp/schedule";

// Change orders in these statuses are done or never happened.
const CO_CLOSED = ["COMPLETED", "BILLING", "REJECTED", "VOID"];

export type NotCompletedRow = {
  kind: "project" | "co";
  id: string;
  projectId: string;
  title: string;
  /** The parent job, for a change order */
  projectTitle: string | null;
  /** Last day the job was scheduled for (YYYY-MM-DD) */
  lastDayKey: string;
  daysAgo: number;
};

/** The latest of these dates, or null. */
function latest(dates: (Date | null | undefined)[]): Date | null {
  const ds = dates.filter((d): d is Date => !!d);
  return ds.length ? new Date(Math.max(...ds.map((d) => d.getTime()))) : null;
}

/**
 * Jobs and change orders whose last scheduled day has passed but that
 * aren't marked complete, so they never reach the Billing lists. Last
 * scheduled day = the latest of the end date and the last planned day on the
 * calendar (start date too, for a change order). Split by Billing tab.
 */
export async function GET() {
  const today = todayEasternAsUtcMidnight();
  const postConPipelineId = parseHubSpotPipelineStageMap()?.postConstruction.pipelineId ?? null;
  const tabFor = (p: { segment: string; hubspotPipelineId: string | null }) =>
    JANITORIAL_BILLING_SEGMENTS.includes(p.segment) && (!postConPipelineId || p.hubspotPipelineId !== postConPipelineId) ? "janitorial" : "postConstruction";

  const [projects, changeOrders] = await Promise.all([
    prisma.project.findMany({
      where: { status: { not: "COMPLETE" } },
      select: {
        id: true,
        jobTitle: true,
        segment: true,
        hubspotPipelineId: true,
        projectEndDate: true,
        dayAssignments: { select: { date: true }, orderBy: { date: "desc" }, take: 1 },
      },
    }),
    prisma.projectChangeOrder.findMany({
      where: { status: { notIn: CO_CLOSED } },
      select: {
        id: true,
        title: true,
        projectId: true,
        startDate: true,
        endDate: true,
        requestedDate: true,
        dayAssignments: { select: { date: true }, orderBy: { date: "desc" }, take: 1 },
        project: { select: { jobTitle: true, segment: true, hubspotPipelineId: true } },
      },
    }),
  ]);

  const out: Record<"janitorial" | "postConstruction", NotCompletedRow[]> = { janitorial: [], postConstruction: [] };
  const daysAgo = (d: Date) => Math.round((today.getTime() - d.getTime()) / 86_400_000);
  for (const p of projects) {
    const last = latest([p.projectEndDate, p.dayAssignments[0]?.date]);
    if (!last || last >= today) continue;
    out[tabFor(p)].push({ kind: "project", id: p.id, projectId: p.id, title: p.jobTitle, projectTitle: null, lastDayKey: dayKey(last), daysAgo: daysAgo(last) });
  }
  for (const co of changeOrders) {
    const last = latest([co.endDate, co.startDate ?? co.requestedDate, co.dayAssignments[0]?.date]);
    if (!last || last >= today) continue;
    out[tabFor(co.project)].push({ kind: "co", id: co.id, projectId: co.projectId, title: co.title, projectTitle: co.project.jobTitle, lastDayKey: dayKey(last), daysAgo: daysAgo(last) });
  }
  for (const rows of Object.values(out)) rows.sort((a, b) => a.daysAgo - b.daysAgo);
  return NextResponse.json(out);
}
