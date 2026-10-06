import { prisma } from "./prisma";
import { notifyReadyToBill, type ReadyToBillItem } from "@/lib/erp/notifyReadyToBill";

// Billed and paid are distinct — a request can be fully invoiced (BILLED)
// without the client having actually paid yet. Only PAID counts as paid for
// commission purposes.
function mapBillingToProject(status: string): { billingStatus: string | null; percentInvoiced: number } {
  if (status === "PAID") return { billingStatus: "PAID", percentInvoiced: 100 };
  if (status === "BILLED") return { billingStatus: "BILLED", percentInvoiced: 100 };
  return { billingStatus: "NOT_BILLED", percentInvoiced: 0 };
}

/**
 * Called after a TurnoverRequest billing status changes.
 * Projects link TO the request (Project.turnoverRequestId) — usually just
 * one, but looped individually (rather than updateMany) so each project's
 * own current billingCompletedAt can be checked before stamping it.
 */
export async function syncProjectBillingFromRequest(turnoverRequestId: string, billingStatus: string) {
  const data = mapBillingToProject(billingStatus);
  const projects = await prisma.project.findMany({
    where: { turnoverRequestId },
    select: { id: true, billingCompletedAt: true },
  });
  await Promise.all(
    projects.map((p) =>
      prisma.project.update({
        where: { id: p.id },
        data: {
          ...data,
          ...(data.billingStatus === "PAID" && !p.billingCompletedAt ? { billingCompletedAt: new Date() } : {}),
        },
      })
    )
  );
}

/**
 * Called after a SOV item billing status changes.
 * Looks at all items for the project and derives the aggregate status.
 */
export async function syncProjectBillingFromSOV(projectId: string) {
  const sov = await prisma.projectSOV.findUnique({
    where: { projectId },
    include: { items: { select: { billingStatus: true, scheduledValueCents: true } } },
  });
  if (!sov || sov.items.length === 0) return;

  const items = sov.items;
  const anyActive = items.some((i) => i.billingStatus === "BILLED" || i.billingStatus === "PAID");
  if (!anyActive) {
    await prisma.project.update({ where: { id: projectId }, data: { billingStatus: null, percentInvoiced: 0 } });
    return;
  }

  // percentInvoiced = how much of the SOV is billed out (BILLED or PAID
  // items) — matches "percent invoiced is based on percent of SOVs marked
  // billed". Being paid is a stricter, separate condition: every item must
  // individually be PAID, not merely billed.
  const allPaid = items.every((i) => i.billingStatus === "PAID");
  const total = items.reduce((s, i) => s + i.scheduledValueCents, 0);
  const activeTotal = items
    .filter((i) => i.billingStatus === "BILLED" || i.billingStatus === "PAID")
    .reduce((s, i) => s + i.scheduledValueCents, 0);
  const percentInvoiced = total > 0 ? Math.round((activeTotal / total) * 100) : 100;

  const current = await prisma.project.findUnique({ where: { id: projectId }, select: { billingCompletedAt: true } });

  await prisma.project.update({
    where: { id: projectId },
    data: {
      billingStatus: allPaid ? "PAID" : "BILLED",
      percentInvoiced,
      ...(allPaid && !current?.billingCompletedAt ? { billingCompletedAt: new Date() } : {}),
    },
  });
}

/** A date typed for an SOV line ("YYYY-MM-DD"), saved as UTC midnight like
 * any other picked date. Null when it's missing or not a real date. */
export function parseSovItemDate(raw: unknown): Date | null {
  const s = typeof raw === "string" ? raw.trim().slice(0, 10) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * The completedAt / paidAt change for one SOV line edit. A line that becomes
 * done or paid is stamped (with the typed date, or now), one that stops being
 * done or paid is cleared, and a typed date on a line that already is done or
 * paid replaces the old one.
 */
export function sovItemDateChanges(
  before: { completed: boolean; billingStatus: string },
  after: { completed: boolean; billingStatus: string },
  typed: { completedAt: Date | null; paidAt: Date | null },
): { completedAt?: Date | null; paidAt?: Date | null } {
  const changes: { completedAt?: Date | null; paidAt?: Date | null } = {};
  if (!after.completed) {
    if (before.completed) changes.completedAt = null;
  } else if (!before.completed) {
    changes.completedAt = typed.completedAt ?? new Date();
  } else if (typed.completedAt) {
    changes.completedAt = typed.completedAt;
  }
  const wasPaid = before.billingStatus === "PAID";
  if (after.billingStatus !== "PAID") {
    if (wasPaid) changes.paidAt = null;
  } else if (!wasPaid) {
    changes.paidAt = typed.paidAt ?? new Date();
  } else if (typed.paidAt) {
    changes.paidAt = typed.paidAt;
  }
  return changes;
}

/** Marks SOV lines done because work logged on them finished them, dated
 * `on` (the day of that work). Lines already done keep their own date. */
export async function markSovItemsCompleted(ids: string[], on: Date) {
  if (ids.length === 0) return;
  const newlyDone = await prisma.projectSOVItem.findMany({
    where: { id: { in: ids }, completed: false },
    select: { id: true, description: true, scheduledValueCents: true, billingStatus: true, sov: { select: { projectId: true } } },
  });
  if (newlyDone.length === 0) return;
  await prisma.projectSOVItem.updateMany({
    where: { id: { in: newlyDone.map((i) => i.id) }, completed: false },
    data: { completed: true, completedAt: on },
  });
  // One ready to bill email per project, listing every line this finished.
  const byProject = new Map<string, ReadyToBillItem[]>();
  for (const i of newlyDone) {
    if (i.billingStatus !== "NOT_BILLED") continue;
    const list = byProject.get(i.sov.projectId) ?? [];
    list.push({ kind: "SOV line", title: i.description, amountCents: i.scheduledValueCents });
    byProject.set(i.sov.projectId, list);
  }
  for (const [projectId, items] of byProject) await notifyReadyToBill(projectId, items);
}

/** Marks one SOV line paid (a payment matched from HubSpot), on the day
 * HubSpot says it was paid, or now when HubSpot has no payment date. */
export async function markSovItemPaid(id: string, paidOn: Date | null) {
  await prisma.projectSOVItem.updateMany({
    where: { id, billingStatus: { not: "PAID" } },
    data: { billingStatus: "PAID", paidAt: paidOn ?? new Date() },
  });
}

export async function syncSovPercentDone(projectId: string) {
  const sov = await prisma.projectSOV.findUnique({
    where: { projectId },
    include: { items: { select: { scheduledValueCents: true, completed: true } } },
  });
  if (!sov || sov.items.length === 0) return;

  const total = sov.items.reduce((s, i) => s + i.scheduledValueCents, 0);
  if (total === 0) return;

  const completedTotal = sov.items
    .filter((i) => i.completed)
    .reduce((s, i) => s + i.scheduledValueCents, 0);

  const percentDone = Math.round((completedTotal / total) * 1000) / 10;

  await prisma.project.update({ where: { id: projectId }, data: { percentDone } });
}
