import { prisma } from "@/lib/prisma";
import { buildReadyToBillEmail, sendEmail } from "@/lib/email";
import { parseHubSpotPipelineStageMap } from "@/lib/hubspot/pipelineStages";
import { normalizeBillingStatus } from "@/lib/erp/billingStatus";

export type ReadyToBillItem = { kind: "Project" | "Turnover" | "Change order" | "SOV line"; title: string; amountCents: number | null };

/**
 * Emails the "Ready to bill" list (Jennifer by default, set on the
 * Notifications page) when a project or turnover unit is marked complete, a
 * change order moves to Billing or Completed, or SOV lines are marked done.
 * Follows the Billing page: turnovers show on its Janitorial tab (one email
 * per unit, priced like that tab), everything else only when it's in the
 * post-construction pipeline, like the Post-construction tab. Never throws,
 * so a failed email can't undo the save that triggered it.
 */
export async function notifyReadyToBill(projectId: string, items: ReadyToBillItem[]): Promise<void> {
  if (items.length === 0) return;
  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        jobTitle: true,
        segment: true,
        hubspotPipelineId: true,
        contractValueCents: true,
        turnoverRequest: { select: { priceCents: true, approvedPriceCents: true, billingStatus: true } },
      },
    });
    if (!project) return;

    const isTurnover = project.segment === "JANITORIAL_TURNOVER_REQUESTS";
    if (isTurnover) {
      const tr = project.turnoverRequest;
      if (tr && normalizeBillingStatus(tr.billingStatus) !== "NOT_BILLED") return;
      const amountCents = tr?.approvedPriceCents ?? tr?.priceCents ?? project.contractValueCents;
      items = items.map((i) => (i.kind === "Project" ? { kind: "Turnover", title: "Unit marked complete", amountCents } : i));
    } else {
      const postConPipelineId = parseHubSpotPipelineStageMap()?.postConstruction.pipelineId ?? null;
      if (postConPipelineId && project.hubspotPipelineId !== postConPipelineId) return;
    }

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL?.trim() || "").replace(/\/$/, "");
    const what = items.length === 1 ? items[0]!.kind.toLowerCase() : `${items.length} items`;
    await sendEmail({
      type: "READY_TO_BILL",
      link: `/erp/projects/${projectId}`,
      subject: `Ready to bill: ${project.jobTitle} (${what})`,
      html: buildReadyToBillEmail({
        jobTitle: project.jobTitle,
        items,
        projectUrl: appUrl ? `${appUrl}/erp/projects/${projectId}` : null,
        billingUrl: appUrl ? `${appUrl}/erp/billing?tab=${isTurnover ? "janitorial" : "post-construction"}` : null,
      }),
    });
  } catch (e) {
    console.error(`Ready to bill email failed for project ${projectId}`, e);
  }
}
