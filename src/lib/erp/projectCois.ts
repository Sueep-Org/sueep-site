/**
 * COIs given out per project (ProjectCoi). The newest COI per holder on a
 * project is the current one; older ones are history and don't raise
 * warnings. A project's COI status is the worst of its current COIs.
 */

import { expiryStatus, normalizeHolderName, type ExpiryStatus } from "./insurance";
import { todayEasternKey } from "./dates";

export type CoiForStatus = {
  id: string;
  holderId: string | null;
  holderName: string;
  issuedOn: Date;
  createdAt: Date;
  expiresAt: Date;
};

function holderKey(c: CoiForStatus): string {
  return c.holderId ?? `name:${normalizeHolderName(c.holderName)}`;
}

/** Ids of the newest COI per holder (by issue date, then when it was added). */
export function currentCoiIds(cois: CoiForStatus[]): Set<string> {
  const latest = new Map<string, CoiForStatus>();
  for (const c of cois) {
    const k = holderKey(c);
    const prev = latest.get(k);
    if (
      !prev ||
      c.issuedOn.getTime() > prev.issuedOn.getTime() ||
      (c.issuedOn.getTime() === prev.issuedOn.getTime() && c.createdAt.getTime() > prev.createdAt.getTime())
    ) {
      latest.set(k, c);
    }
  }
  return new Set([...latest.values()].map((c) => c.id));
}

export type ProjectCoiStatus = ExpiryStatus & { holderName: string; expiresAt: Date };

const RANK = { EXPIRED: 0, EXPIRING: 1, CURRENT: 2 } as const;

/** The most urgent current COI on a project, or null when it has none. */
export function projectCoiStatus(cois: CoiForStatus[], todayKey: string = todayEasternKey()): ProjectCoiStatus | null {
  const current = currentCoiIds(cois);
  let worst: ProjectCoiStatus | null = null;
  for (const c of cois) {
    if (!current.has(c.id)) continue;
    const s = { ...expiryStatus(c.expiresAt, todayKey), holderName: c.holderName, expiresAt: c.expiresAt };
    if (!worst || RANK[s.status] < RANK[worst.status] || (s.status === worst.status && s.daysLeft < worst.daysLeft)) worst = s;
  }
  return worst;
}

/** Short text for a warning pill, or null when nothing needs attention. */
export function coiWarningLabel(s: ProjectCoiStatus | null): string | null {
  if (!s || s.status === "CURRENT") return null;
  if (s.status === "EXPIRED") return "COI expired";
  return s.daysLeft === 0 ? "COI expires today" : `COI expires in ${s.daysLeft}d`;
}

/**
 * Projects whose COIs still matter: not archived and not fully paid, since
 * a GC can hold payment on an expired COI right up until the last invoice.
 */
export const COI_WATCH_PROJECT_WHERE = {
  status: { not: "ARCHIVED" },
  OR: [{ billingStatus: null }, { billingStatus: { notIn: ["PAID", "INVOICE_PAID"] } }],
};
