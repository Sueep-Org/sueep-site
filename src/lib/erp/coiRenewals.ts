/**
 * Which COIs we gave out need a new version: on unpaid projects, the
 * current COI per holder, when one of its policies has since renewed (the
 * policy's expiration is now later than what the PDF shows), was replaced,
 * or the COI is expired or expiring.
 */

import { prisma } from "@/lib/prisma";
import { expiryStatus, policyTypeLabel, type ExpiryStatus } from "./insurance";
import { COI_WATCH_PROJECT_WHERE, currentCoiIds } from "./projectCois";
import { utcDateKey } from "./dates";

export type ReissueRow = {
  coiId: string;
  projectId: string;
  jobTitle: string;
  holderName: string;
  expiresAt: string;
  status: ExpiryStatus;
  sentTo: string | null;
  /** Short reasons, e.g. "Umbrella renewed" */
  reasons: string[];
  /** Policy ids whose renewal caused this */
  renewedPolicyIds: string[];
};

export async function loadReissueList(): Promise<ReissueRow[]> {
  const [projects, policies] = await Promise.all([
    prisma.project.findMany({
      where: { ...COI_WATCH_PROJECT_WHERE, cois: { some: {} } },
      select: {
        id: true,
        jobTitle: true,
        cois: {
          select: {
            id: true,
            holderId: true,
            holderName: true,
            issuedOn: true,
            createdAt: true,
            expiresAt: true,
            sentTo: true,
            policies: { select: { policyId: true, policyType: true, expiresAt: true } },
          },
        },
      },
    }),
    prisma.insurancePolicy.findMany({ select: { id: true, active: true, expiresAt: true } }),
  ]);
  const live = new Map(policies.map((p) => [p.id, p]));

  const rows: ReissueRow[] = [];
  for (const project of projects) {
    const current = currentCoiIds(project.cois);
    for (const c of project.cois) {
      if (!current.has(c.id)) continue;
      const reasons: string[] = [];
      const renewedPolicyIds: string[] = [];
      for (const p of c.policies) {
        const now = p.policyId ? live.get(p.policyId) : undefined;
        const label = policyTypeLabel(p.policyType);
        if (!now || !now.active) {
          reasons.push(`${label} replaced`);
        } else if (now.expiresAt.getTime() > p.expiresAt.getTime()) {
          reasons.push(`${label} renewed`);
          renewedPolicyIds.push(now.id);
        }
      }
      const status = expiryStatus(c.expiresAt);
      if (status.status === "EXPIRED") reasons.push("Expired");
      else if (status.status === "EXPIRING") reasons.push(status.daysLeft === 0 ? "Expires today" : `Expires in ${status.daysLeft} days`);
      if (!reasons.length) continue;

      rows.push({
        coiId: c.id,
        projectId: project.id,
        jobTitle: project.jobTitle,
        holderName: c.holderName,
        expiresAt: utcDateKey(c.expiresAt),
        status,
        sentTo: c.sentTo,
        reasons,
        renewedPolicyIds,
      });
    }
  }
  return rows.sort((a, b) => a.expiresAt.localeCompare(b.expiresAt) || a.jobTitle.localeCompare(b.jobTitle));
}
