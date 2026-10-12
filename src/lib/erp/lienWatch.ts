/**
 * Post-construction jobs with finished work that hasn't been paid, and how
 * long is left to file a lien on each. Lien rights run out on a fixed date
 * whether or not anyone is looking at that month's billing, so this isn't
 * limited to a date range.
 */

import { prisma } from "@/lib/prisma";
import { parseHubSpotPipelineStageMap } from "@/lib/hubspot/pipelineStages";
import { isPaidStatus } from "./billingStatus";
import { utcDateKey } from "./dates";
import { detectLienState, lienDeadline, parseLienRole, parseLienState, type LienDeadline } from "./lienDeadline";

export type LienWatchRow = {
  projectId: string;
  jobTitle: string;
  /** Finished work that isn't marked paid yet, billed or not */
  unpaidCents: number;
  state: string | null;
  /**
   * Where the state came from: SET = picked on the project, SITE_ADDRESS =
   * read from the work order's site address, TITLE = read from the job title.
   */
  stateSource: "SET" | "SITE_ADDRESS" | "TITLE" | null;
  role: string | null;
  residential: boolean;
  /**
   * The day the clock starts: the End date of a completed project. That is
   * the only place the last day of work is kept, so it's edited there.
   */
  completedKey: string | null;
  deadline: LienDeadline | null;
  /**
   * Why there's no deadline yet. NOT_COMPLETE = the job is still open, so no
   * clock is running. NO_END_DATE = marked complete without an End date.
   */
  missing: "STATE" | "NOT_COMPLETE" | "NO_END_DATE" | null;
};

/**
 * Pass a projectId to get that one project whether or not it has anything
 * unpaid. Otherwise returns every post-construction project with an unpaid
 * balance.
 */
export async function loadLienWatch(opts: { projectId?: string } = {}): Promise<LienWatchRow[]> {
  const cfg = parseHubSpotPipelineStageMap();
  const postConPipelineId = cfg?.postConstruction.pipelineId ?? null;

  const projects = await prisma.project.findMany({
    where: opts.projectId
      ? { id: opts.projectId }
      : {
          status: { not: "ARCHIVED" },
          ...(postConPipelineId ? { hubspotPipelineId: postConPipelineId } : {}),
          // Unit turnovers and recurring janitorial work aren't construction,
          // so they never belong here, with or without a pipeline map.
          segment: { not: "JANITORIAL_TURNOVER_REQUESTS" },
          turnoverRequestId: null,
          recurringContractPeriodId: null,
        },
    select: {
      id: true,
      jobTitle: true,
      status: true,
      billingStatus: true,
      contractValueCents: true,
      projectEndDate: true,
      lienState: true,
      lienRole: true,
      lienResidential: true,
      workOrderRecord: { select: { siteAddress: true } },
      sov: { select: { items: { select: { completed: true, billingStatus: true, scheduledValueCents: true } } } },
      changeOrders: {
        where: { status: { in: ["BILLING", "COMPLETED"] } },
        select: { billingStatus: true, contractValueCents: true },
      },
    },
  });

  const unpaidById = new Map<string, number>();
  for (const p of projects) {
    const items = p.sov?.items ?? [];
    let unpaid = 0;
    for (const i of items) if (i.completed && !isPaidStatus(i.billingStatus)) unpaid += i.scheduledValueCents;
    for (const co of p.changeOrders) if (!isPaidStatus(co.billingStatus)) unpaid += co.contractValueCents ?? 0;
    // No line detail at all: the whole contract is what's owed once the job is done.
    if (items.length === 0 && p.changeOrders.length === 0 && p.status === "COMPLETE" && !isPaidStatus(p.billingStatus)) {
      unpaid += p.contractValueCents ?? 0;
    }
    unpaidById.set(p.id, unpaid);
  }

  const watched = opts.projectId ? projects : projects.filter((p) => (unpaidById.get(p.id) ?? 0) > 0);
  if (watched.length === 0) return [];

  return watched.map((p) => {
    const completedOn = p.status === "COMPLETE" ? p.projectEndDate : null;
    // A state picked on the project wins. Otherwise read it off the site
    // address, then the job title, so most jobs need nothing typed in.
    const setState = parseLienState(p.lienState);
    const siteState = setState ? null : detectLienState(p.workOrderRecord?.siteAddress);
    const titleState = setState || siteState ? null : detectLienState(p.jobTitle);
    const state = setState ?? siteState ?? titleState;
    const stateSource: LienWatchRow["stateSource"] = setState ? "SET" : siteState ? "SITE_ADDRESS" : titleState ? "TITLE" : null;
    const deadline = lienDeadline({ state, role: p.lienRole, residential: p.lienResidential, lastWorkDate: completedOn });
    return {
      projectId: p.id,
      jobTitle: p.jobTitle,
      unpaidCents: unpaidById.get(p.id) ?? 0,
      state,
      stateSource,
      role: parseLienRole(p.lienRole),
      residential: p.lienResidential,
      completedKey: completedOn ? utcDateKey(completedOn) : null,
      deadline,
      missing: !state ? "STATE" : completedOn ? null : p.status === "COMPLETE" ? "NO_END_DATE" : "NOT_COMPLETE",
    };
  });
}
