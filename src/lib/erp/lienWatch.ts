/**
 * Post-construction jobs with finished work that hasn't been paid, and how
 * long is left to file a lien on each. Lien rights run out on a fixed date
 * whether or not anyone is looking at that month's billing, so this isn't
 * limited to a date range. Janitorial unit turns are liened per building,
 * see lienWatchBuildings.ts; both kinds share LienWatchRow.
 */

import { prisma } from "@/lib/prisma";
import { parseHubSpotPipelineStageMap } from "@/lib/hubspot/pipelineStages";
import { isPaidStatus } from "./billingStatus";
import { todayEasternKey, utcDateKey } from "./dates";
import { detectLienState, lienDeadline, lienReadiness, parseLienDecision, parseLienManualSteps, parseLienRole, parseLienState, type LienDeadline, type LienDecision, type LienReadiness } from "./lienDeadline";

export type LienWatchRow = {
  /** POST_CON = one post-construction job. BUILDING = a building's unpaid unit turns. */
  kind: "POST_CON" | "BUILDING";
  /** Unique across both kinds */
  key: string;
  /** Post-construction jobs only */
  projectId: string | null;
  /** Buildings only */
  buildingId: string | null;
  /** The job title, or the building name */
  jobTitle: string;
  /** Where the lien is set up (the Liens tab) */
  liensHref: string;
  /** Where the completion date is fixed when it's missing */
  setupHref: string;
  /** Buildings only: each unpaid turn, oldest first */
  units: LienWatchUnit[];
  /** Finished work that isn't marked paid yet, billed or not */
  unpaidCents: number;
  state: string | null;
  /**
   * Where the state came from: SET = picked on the project, SITE_ADDRESS =
   * read from the work order's site address, TITLE = read from the job title.
   */
  stateSource: "SET" | "SITE_ADDRESS" | "BUILDING_ADDRESS" | "TITLE" | null;
  role: string | null;
  residential: boolean;
  /**
   * The day the clock starts: the End date of a completed project. That is
   * the only place the last day of work is kept, so it's edited there.
   */
  completedKey: string | null;
  deadline: LienDeadline | null;
  /** Where the job stands and what a filing still depends on. Null when there's no deadline. */
  readiness: LienReadiness | null;
  /** "YYYY-MM-DD" a required notice went out, as recorded on the project */
  noticeSentKey: string | null;
  /** What someone decided about a lien here, and when. */
  decision: { value: LienDecision; note: string | null; onKey: string | null; by: string | null } | null;
  /** The furthest stage an alert email has gone out for */
  alertedStage: string | null;
  /**
   * Why there's no deadline yet. NOT_COMPLETE = the job is still open, so no
   * clock is running. NO_END_DATE = marked complete without an End date.
   */
  missing: "STATE" | "NOT_COMPLETE" | "NO_END_DATE" | null;
};

/** One unpaid unit turn under a building's lien. */
export type LienWatchUnit = {
  projectId: string;
  unitNumber: string | null;
  unpaidCents: number;
  completedKey: string | null;
  /** This turn's own last day to file, null until it's complete */
  deadlineKey: string | null;
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
      lienNoticeSentOn: true,
      lienNoticeTracking: true,
      lienOwnerName: true,
      lienOwnerAddress: true,
      lienGcName: true,
      lienGcAddress: true,
      lienSteps: true,
      lienDecision: true,
      lienDecisionNote: true,
      lienDecisionAt: true,
      lienDecisionBy: true,
      lienAlertedStage: true,
      workOrderRecord: { select: { siteAddress: true } },
      contracts: { where: { signingStatus: "SIGNED" }, select: { id: true }, take: 1 },
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

  // Open invoices linked to each job's lines, for "is anything past due".
  const openLinks = await prisma.hubSpotSovInvoice.findMany({
    where: { projectId: { in: watched.map((p) => p.id) }, status: "open" },
    select: { projectId: true, hubspotInvoiceId: true, invoiceNumber: true, dueDate: true },
    distinct: ["hubspotInvoiceId"],
  });

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
    const unpaidCents = unpaidById.get(p.id) ?? 0;
    const noticeSentKey = p.lienNoticeSentOn ? utcDateKey(p.lienNoticeSentOn) : null;
    const readiness = deadline
      ? lienReadiness(deadline, {
          unpaidCents,
          openInvoices: openLinks
            .filter((l) => l.projectId === p.id)
            .map((l) => ({ number: l.invoiceNumber, dueKey: l.dueDate ? utcDateKey(l.dueDate) : null })),
          noticeSentKey,
          noticeTracking: p.lienNoticeTracking,
          hasSignedContract: p.contracts.length > 0,
          decision: parseLienDecision(p.lienDecision),
          hasOwnerDetails: !!p.lienOwnerName?.trim() && !!p.lienOwnerAddress?.trim(),
          hasGcDetails: !!p.lienGcName?.trim() && !!p.lienGcAddress?.trim(),
          manual: parseLienManualSteps(p.lienSteps),
        })
      : null;
    return {
      kind: "POST_CON" as const,
      key: `project:${p.id}`,
      projectId: p.id,
      buildingId: null,
      jobTitle: p.jobTitle,
      liensHref: `/erp/projects/${p.id}?tab=Liens`,
      setupHref: `/erp/projects/${p.id}`,
      units: [],
      unpaidCents,
      state,
      stateSource,
      role: parseLienRole(p.lienRole),
      residential: p.lienResidential,
      completedKey: completedOn ? utcDateKey(completedOn) : null,
      deadline,
      readiness,
      noticeSentKey,
      decision: parseLienDecision(p.lienDecision)
        ? {
            value: parseLienDecision(p.lienDecision)!,
            note: p.lienDecisionNote,
            onKey: p.lienDecisionAt ? todayEasternKey(p.lienDecisionAt) : null,
            by: p.lienDecisionBy,
          }
        : null,
      alertedStage: p.lienAlertedStage,
      missing: !state ? "STATE" : completedOn ? null : p.status === "COMPLETE" ? "NO_END_DATE" : "NOT_COMPLETE",
    };
  });
}
