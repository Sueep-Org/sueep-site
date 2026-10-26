import { prisma } from "@/lib/prisma";
import { amountReconciles, AMOUNT_TOLERANCE_CENTS } from "@/lib/hubspot/billingMatch";
import { normalizeBillingStatus } from "@/lib/erp/billingStatus";
import { unitChangeOrderProjects, contractMonthLinks } from "@/lib/hubspot/syncUnitInvoices";
import { periodTotalCents } from "@/lib/erp/recurringContracts";
import { markSovItemPaid, syncSovPercentDone, syncProjectBillingFromSOV, syncProjectBillingFromRequest, setRequestPaidDate } from "@/lib/sovSync";

/**
 * Keeps a line's billing status in step with the HubSpot invoices linked to
 * it: Billed while any of them is open, Paid once all of them are paid.
 * Works off the saved links (HubSpotSovInvoice, HubSpotUnitInvoice), so it
 * makes no HubSpot calls and is safe to run any number of times.
 *
 * The rules:
 *  - draft and voided invoices don't count;
 *  - a line only moves forward (Not billed, Billed, Paid), never back;
 *  - each link moves its line once (billedAppliedAt, paidAppliedAt). If
 *    someone moves the line back afterwards, that's their call and it's left
 *    alone. Linking the invoice again by hand resets it;
 *  - a line that was already Paid when its invoices are first counted takes
 *    the invoice's paid date, since the date it had is only the day someone
 *    marked it. That happens once too, so a date typed afterwards stays.
 */

type Link = {
  id: string;
  hubspotInvoiceId: string;
  status: string | null;
  amountCents: number;
  paidDate: Date | null;
  paidAppliedAt: Date | null;
  billedAppliedAt: Date | null;
};

/** Invoices that count toward a line's status. */
const LIVE_STATUSES = ["open", "paid"];

function paidOnOf(links: Array<{ paidDate: Date | null }>): Date | null {
  return links.reduce<Date | null>((latest, l) => (l.paidDate && (!latest || l.paidDate > latest) ? l.paidDate : latest), null);
}

/** Where a line should move to, or null to leave it. */
function nextStatus(links: Link[], billingStatus: string | null): "PAID" | "BILLED" | null {
  const status = normalizeBillingStatus(billingStatus);
  if (links.length === 0 || status === "PAID") return null;
  if (links.every((l) => l.status === "paid") && !links.some((l) => l.paidAppliedAt)) return "PAID";
  if (status === "NOT_BILLED" && !links.some((l) => l.billedAppliedAt)) return "BILLED";
  return null;
}

/** The invoice's paid date for a line that's already Paid, the first time
 * its invoices are counted. Null when there's nothing to move. */
function firstPaidOn(links: Link[]): Date | null {
  const paid = links.filter((l) => l.status === "paid");
  return paid.length === 0 || paid.some((l) => l.paidAppliedAt) ? null : paidOnOf(paid);
}

/** Links to stamp now that their line has been brought in step. */
function toStamp(links: Link[], lineIsPaid: boolean) {
  return {
    billed: links.filter((l) => !l.billedAppliedAt).map((l) => l.id),
    paid: lineIsPaid ? links.filter((l) => l.status === "paid" && !l.paidAppliedAt).map((l) => l.id) : [],
  };
}

function groupBy<T>(rows: T[], key: (r: T) => string | null): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    if (k) out.set(k, [...(out.get(k) ?? []), r]);
  }
  return out;
}

export type PaidLinksResult = { sovItems: number; changeOrders: number; units: number; contractMonths: number; reviewCleared: number };

const linkSelect = { id: true, hubspotInvoiceId: true, status: true, amountCents: true, paidDate: true, paidAppliedAt: true, billedAppliedAt: true } as const;

/** Pass a projectId or buildingId to limit it to one, e.g. right after a link is saved by hand.
 * A building covers its units, the change orders on its unit projects and
 * the months of its janitorial contract. */
export async function applyPaidInvoiceLinks(scope: { projectId?: string; buildingId?: string } = {}): Promise<PaidLinksResult> {
  const result: PaidLinksResult = { sovItems: 0, changeOrders: 0, units: 0, contractMonths: 0, reviewCleared: 0 };

  {
    const links = await prisma.hubSpotSovInvoice.findMany({
      where: {
        status: { in: LIVE_STATUSES },
        ...(scope.projectId ? { projectId: scope.projectId } : {}),
        ...(scope.buildingId ? { project: unitChangeOrderProjects(scope.buildingId) } : {}),
      },
      select: { ...linkSelect, projectId: true, sovItemId: true, changeOrderId: true },
    });
    const stampBilled: string[] = [];
    const stampPaid: string[] = [];

    const bySov = groupBy(links, (l) => l.sovItemId);
    const sovItems = await prisma.projectSOVItem.findMany({
      where: { id: { in: [...bySov.keys()] } },
      select: { id: true, billingStatus: true, sov: { select: { projectId: true } } },
    });
    const touchedProjects = new Set<string>();
    for (const item of sovItems) {
      const group = bySov.get(item.id)!;
      const next = nextStatus(group, item.billingStatus);
      if (next === "PAID") {
        await markSovItemPaid(item.id, paidOnOf(group));
      } else if (next === "BILLED") {
        await prisma.projectSOVItem.updateMany({ where: { id: item.id, billingStatus: "NOT_BILLED" }, data: { billingStatus: "BILLED" } });
      } else if (item.billingStatus === "PAID") {
        const paidOn = firstPaidOn(group);
        if (paidOn) await prisma.projectSOVItem.update({ where: { id: item.id }, data: { paidAt: paidOn } });
      }
      if (next) {
        touchedProjects.add(item.sov.projectId);
        result.sovItems += 1;
      }
      const stamp = toStamp(group, next === "PAID" || item.billingStatus === "PAID");
      stampBilled.push(...stamp.billed);
      stampPaid.push(...stamp.paid);
    }
    // Same follow-ups the billing page runs after a SOV line's status changes.
    for (const projectId of touchedProjects) {
      await syncSovPercentDone(projectId);
      await syncProjectBillingFromSOV(projectId);
    }

    const byCo = groupBy(links, (l) => l.changeOrderId);
    const changeOrders = await prisma.projectChangeOrder.findMany({
      where: { id: { in: [...byCo.keys()] } },
      select: { id: true, billingStatus: true, status: true, completedAt: true },
    });
    for (const co of changeOrders) {
      const group = byCo.get(co.id)!;
      const isPaid = normalizeBillingStatus(co.billingStatus) === "PAID";
      const next = nextStatus(group, co.billingStatus);
      if (next === "PAID") {
        // Same as marking it Paid by hand (see the change order PATCH route):
        // a paid change order is also a finished one.
        await prisma.projectChangeOrder.update({
          where: { id: co.id },
          data: {
            billingStatus: "PAID",
            paidAt: paidOnOf(group) ?? new Date(),
            ...(co.status !== "COMPLETED" ? { status: "COMPLETED", ...(co.completedAt ? {} : { completedAt: new Date() }) } : {}),
          },
        });
      } else if (next === "BILLED") {
        await prisma.projectChangeOrder.update({ where: { id: co.id }, data: { billingStatus: "BILLED" } });
      } else if (isPaid) {
        const paidOn = firstPaidOn(group);
        if (paidOn) await prisma.projectChangeOrder.update({ where: { id: co.id }, data: { paidAt: paidOn } });
      }
      if (next) result.changeOrders += 1;
      const stamp = toStamp(group, next === "PAID" || isPaid);
      stampBilled.push(...stamp.billed);
      stampPaid.push(...stamp.paid);
    }

    if (stampBilled.length > 0) await prisma.hubSpotSovInvoice.updateMany({ where: { id: { in: stampBilled } }, data: { billedAppliedAt: new Date() } });
    if (stampPaid.length > 0) await prisma.hubSpotSovInvoice.updateMany({ where: { id: { in: stampPaid } }, data: { paidAppliedAt: new Date() } });

    result.reviewCleared += await clearCoveredReviewRows(links.filter((l) => l.status === "paid"));
  }

  if (!scope.projectId) {
    // Units, automatic matches included.
    const unitLinks = await prisma.hubSpotUnitInvoice.findMany({
      where: { status: { in: LIVE_STATUSES }, turnoverRequestId: { not: null }, ...(scope.buildingId ? { buildingId: scope.buildingId } : {}) },
      select: { ...linkSelect, turnoverRequestId: true },
    });
    const byTurn = groupBy(unitLinks, (l) => l.turnoverRequestId);
    const turns = await prisma.turnoverRequest.findMany({
      where: { id: { in: [...byTurn.keys()] } },
      select: { id: true, billingStatus: true },
    });
    const stampBilled: string[] = [];
    const stampPaid: string[] = [];
    for (const turn of turns) {
      const group = byTurn.get(turn.id)!;
      const isPaid = normalizeBillingStatus(turn.billingStatus) === "PAID";
      const next = nextStatus(group, turn.billingStatus);
      if (next) {
        await prisma.turnoverRequest.update({ where: { id: turn.id }, data: { billingStatus: next } });
        await syncProjectBillingFromRequest(turn.id, next, next === "PAID" ? paidOnOf(group) : null);
        result.units += 1;
      } else if (isPaid) {
        const paidOn = firstPaidOn(group);
        if (paidOn) await setRequestPaidDate(turn.id, paidOn);
      }
      const stamp = toStamp(group, next === "PAID" || isPaid);
      stampBilled.push(...stamp.billed);
      stampPaid.push(...stamp.paid);
    }
    if (stampBilled.length > 0) await prisma.hubSpotUnitInvoice.updateMany({ where: { id: { in: stampBilled } }, data: { billedAppliedAt: new Date() } });
    if (stampPaid.length > 0) await prisma.hubSpotUnitInvoice.updateMany({ where: { id: { in: stampPaid } }, data: { paidAppliedAt: new Date() } });

    // Janitorial contract months: always linked by hand, and a month can
    // hold several invoices, so they're added up against the month's total
    // (flat amount plus extras).
    const monthLinks = (
      await prisma.hubSpotContractInvoice.findMany({
        where: { status: "paid", ...(scope.buildingId ? contractMonthLinks(scope.buildingId) : {}) },
        select: { id: true, periodId: true, amountCents: true, paidDate: true, paidAppliedAt: true },
      })
    );
    const byPeriod = groupBy(monthLinks, (l) => l.periodId);
    const periods = await prisma.recurringContractPeriod.findMany({
      where: { id: { in: [...byPeriod.keys()] } },
      select: { id: true, billingStatus: true, amountCents: true, charges: { select: { amountCents: true } } },
    });
    const countedMonths: string[] = [];
    for (const period of periods) {
      const group = byPeriod.get(period.id)!;
      const counted = group.some((l) => l.paidAppliedAt);
      if (period.billingStatus !== "PAID") {
        // Moved back by a person after it was counted, or not paid in full yet.
        const sumCents = group.reduce((s, l) => s + l.amountCents, 0);
        if (counted || !amountReconciles(sumCents, periodTotalCents(period), AMOUNT_TOLERANCE_CENTS)) continue;
        // Same as marking the month Paid by hand (see the period PATCH route).
        await prisma.recurringContractPeriod.update({ where: { id: period.id }, data: { billingStatus: "PAID", paidAt: paidOnOf(group) ?? new Date() } });
        result.contractMonths += 1;
      } else {
        const paidOn = counted ? null : paidOnOf(group);
        if (paidOn) await prisma.recurringContractPeriod.update({ where: { id: period.id }, data: { paidAt: paidOn } });
      }
      countedMonths.push(...group.filter((l) => !l.paidAppliedAt).map((l) => l.id));
    }
    if (countedMonths.length > 0) {
      await prisma.hubSpotContractInvoice.updateMany({ where: { id: { in: countedMonths } }, data: { paidAppliedAt: new Date() } });
    }
  }

  return result;
}

/**
 * Marks an invoice's lines in the match record as settled once the links
 * account for all of it and everything it's linked to is Paid, so the record
 * doesn't show them as unresolved.
 */
async function clearCoveredReviewRows(
  links: Array<{ hubspotInvoiceId: string; sovItemId: string | null; changeOrderId: string | null; amountCents: number }>,
): Promise<number> {
  const byInvoice = groupBy(links, (l) => l.hubspotInvoiceId);
  const pending = await prisma.hubSpotInvoiceLineItemMatch.findMany({
    where: { hubspotInvoiceId: { in: [...byInvoice.keys()] }, projectId: { not: null } },
    select: { id: true, hubspotInvoiceId: true, amountCents: true, status: true },
  });
  if (!pending.some((r) => r.status === "PENDING_REVIEW")) return 0;

  const [paidSov, paidCo] = await Promise.all([
    prisma.projectSOVItem.findMany({ where: { id: { in: links.flatMap((l) => l.sovItemId ?? []) }, billingStatus: "PAID" }, select: { id: true } }),
    prisma.projectChangeOrder.findMany({ where: { id: { in: links.flatMap((l) => l.changeOrderId ?? []) } }, select: { id: true, billingStatus: true } }),
  ]);
  const paidIds = new Set([...paidSov.map((i) => i.id), ...paidCo.filter((c) => normalizeBillingStatus(c.billingStatus) === "PAID").map((c) => c.id)]);

  const toClear: string[] = [];
  for (const [invoiceId, group] of byInvoice) {
    const lines = pending.filter((r) => r.hubspotInvoiceId === invoiceId);
    if (!group.every((l) => paidIds.has((l.sovItemId ?? l.changeOrderId)!))) continue;
    const linked = group.reduce((s, l) => s + l.amountCents, 0);
    const invoiced = lines.reduce((s, r) => s + r.amountCents, 0);
    if (!amountReconciles(linked, invoiced, AMOUNT_TOLERANCE_CENTS)) continue;
    toClear.push(...lines.filter((r) => r.status === "PENDING_REVIEW").map((r) => r.id));
  }
  if (toClear.length === 0) return 0;
  await prisma.hubSpotInvoiceLineItemMatch.updateMany({
    where: { id: { in: toClear } },
    data: { status: "RESOLVED", resolvedAt: new Date(), resolvedByName: "Linked invoice" },
  });
  return toClear.length;
}
