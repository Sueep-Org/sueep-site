import { prisma } from "@/lib/prisma";
import { amountReconciles, AMOUNT_TOLERANCE_CENTS } from "@/lib/hubspot/billingMatch";
import { normalizeBillingStatus } from "@/lib/erp/billingStatus";
import { unitChangeOrderProjects, contractMonthLinks } from "@/lib/hubspot/syncUnitInvoices";
import { periodTotalCents } from "@/lib/erp/recurringContracts";
import { markSovItemPaid, syncSovPercentDone, syncProjectBillingFromSOV, syncProjectBillingFromRequest } from "@/lib/sovSync";

/**
 * Marks a line Paid when the HubSpot invoices linked to it are paid and add
 * up to its value. Works off the saved links (HubSpotSovInvoice,
 * HubSpotUnitInvoice), so it makes no HubSpot calls and is safe to run any
 * number of times.
 *
 * This covers what the line-by-line paid sync (processPaidInvoices) can't:
 * change orders, which that sync doesn't know about, and invoices a person
 * linked by hand. The rules:
 *  - the line's paid invoice (a line holds one; older data can have more,
 *    which are added up) has to be within AMOUNT_TOLERANCE_CENTS of the
 *    line's value;
 *  - a line still Not billed is only moved when a person made the link,
 *    since jumping straight to Paid on an automatic match is a sign the
 *    match is wrong;
 *  - each invoice is applied to its line once (paidAppliedAt). If someone
 *    moves the line back to Billed or Not billed afterwards, that's their
 *    call and it's left alone. Linking the invoice again by hand resets it.
 */

type Link = { id: string; hubspotInvoiceId: string; amountCents: number; manual: boolean; paidDate: Date | null; paidAppliedAt: Date | null };

function summarize(links: Link[]) {
  const paidOn = links.reduce<Date | null>((latest, l) => (l.paidDate && (!latest || l.paidDate > latest) ? l.paidDate : latest), null);
  return { sumCents: links.reduce((s, l) => s + l.amountCents, 0), anyManual: links.some((l) => l.manual), paidOn };
}

function canApply(links: Link[], billingStatus: string | null, valueCents: number | null): boolean {
  const status = normalizeBillingStatus(billingStatus);
  if (status === "PAID" || valueCents == null) return false;
  // Already counted once and the line isn't Paid now: a person moved it back.
  if (links.some((l) => l.paidAppliedAt)) return false;
  const { sumCents, anyManual } = summarize(links);
  if (status === "NOT_BILLED" && !anyManual) return false;
  return amountReconciles(sumCents, valueCents, AMOUNT_TOLERANCE_CENTS);
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

/** Pass a projectId or buildingId to limit it to one, e.g. right after a link is saved by hand.
 * A building covers its units, the change orders on its unit projects and
 * the months of its janitorial contract. */
export async function applyPaidInvoiceLinks(scope: { projectId?: string; buildingId?: string } = {}): Promise<PaidLinksResult> {
  const result: PaidLinksResult = { sovItems: 0, changeOrders: 0, units: 0, contractMonths: 0, reviewCleared: 0 };

  {
    const links = await prisma.hubSpotSovInvoice.findMany({
      where: {
        status: "paid",
        ...(scope.projectId ? { projectId: scope.projectId } : {}),
        ...(scope.buildingId ? { project: unitChangeOrderProjects(scope.buildingId) } : {}),
      },
      select: { id: true, projectId: true, sovItemId: true, changeOrderId: true, hubspotInvoiceId: true, amountCents: true, manual: true, paidDate: true, paidAppliedAt: true },
    });
    // Links whose line is Paid by the end of this pass, to stamp as counted.
    const counted: string[] = [];

    const bySov = groupBy(links, (l) => l.sovItemId);
    const sovItems = await prisma.projectSOVItem.findMany({
      where: { id: { in: [...bySov.keys()] } },
      select: { id: true, billingStatus: true, scheduledValueCents: true, sov: { select: { projectId: true } } },
    });
    const touchedProjects = new Set<string>();
    for (const item of sovItems) {
      const group = bySov.get(item.id)!;
      if (item.billingStatus === "PAID") {
        counted.push(...group.map((l) => l.id));
        continue;
      }
      if (!canApply(group, item.billingStatus, item.scheduledValueCents)) continue;
      await markSovItemPaid(item.id, summarize(group).paidOn);
      counted.push(...group.map((l) => l.id));
      touchedProjects.add(item.sov.projectId);
      result.sovItems += 1;
    }
    // Same follow-ups the billing page runs after a SOV line's status changes.
    for (const projectId of touchedProjects) {
      await syncSovPercentDone(projectId);
      await syncProjectBillingFromSOV(projectId);
    }

    const byCo = groupBy(links, (l) => l.changeOrderId);
    const changeOrders = await prisma.projectChangeOrder.findMany({
      where: { id: { in: [...byCo.keys()] } },
      select: { id: true, billingStatus: true, contractValueCents: true, status: true, completedAt: true },
    });
    for (const co of changeOrders) {
      const group = byCo.get(co.id)!;
      if (normalizeBillingStatus(co.billingStatus) === "PAID") {
        counted.push(...group.map((l) => l.id));
        continue;
      }
      if (!canApply(group, co.billingStatus, co.contractValueCents)) continue;
      const paidOn = summarize(group).paidOn ?? new Date();
      // Same as marking it Paid by hand (see the change order PATCH route):
      // a paid change order is also a finished one.
      await prisma.projectChangeOrder.update({
        where: { id: co.id },
        data: {
          billingStatus: "PAID",
          paidAt: paidOn,
          ...(co.status !== "COMPLETED" ? { status: "COMPLETED", ...(co.completedAt ? {} : { completedAt: new Date() }) } : {}),
        },
      });
      counted.push(...group.map((l) => l.id));
      result.changeOrders += 1;
    }

    const toStamp = counted.filter((id) => !links.find((l) => l.id === id)?.paidAppliedAt);
    if (toStamp.length > 0) {
      await prisma.hubSpotSovInvoice.updateMany({ where: { id: { in: toStamp } }, data: { paidAppliedAt: new Date() } });
    }

    result.reviewCleared += await clearCoveredReviewRows(links);
  }

  if (!scope.projectId) {
    // Units: only invoices linked by hand. Automatic unit matches are
    // already handled, as a group per unit, by processPaidInvoices.
    const unitLinks = await prisma.hubSpotUnitInvoice.findMany({
      where: { status: "paid", manual: true, turnoverRequestId: { not: null }, ...(scope.buildingId ? { buildingId: scope.buildingId } : {}) },
      select: { id: true, turnoverRequestId: true, hubspotInvoiceId: true, amountCents: true, manual: true, paidDate: true, paidAppliedAt: true },
    });
    const byTurn = groupBy(unitLinks, (l) => l.turnoverRequestId);
    const turns = await prisma.turnoverRequest.findMany({
      where: { id: { in: [...byTurn.keys()] } },
      select: { id: true, billingStatus: true, priceCents: true, approvedPriceCents: true },
    });
    const countedUnits: string[] = [];
    for (const turn of turns) {
      const group = byTurn.get(turn.id)!;
      if (turn.billingStatus !== "PAID") {
        if (!canApply(group, turn.billingStatus, turn.approvedPriceCents ?? turn.priceCents)) continue;
        await prisma.turnoverRequest.update({ where: { id: turn.id }, data: { billingStatus: "PAID" } });
        await syncProjectBillingFromRequest(turn.id, "PAID");
        result.units += 1;
      }
      countedUnits.push(...group.filter((l) => !l.paidAppliedAt).map((l) => l.id));
    }
    if (countedUnits.length > 0) {
      await prisma.hubSpotUnitInvoice.updateMany({ where: { id: { in: countedUnits } }, data: { paidAppliedAt: new Date() } });
    }

    // Janitorial contract months: always linked by hand, and a month can
    // hold several invoices, so they're added up against the month's total
    // (flat amount plus extras).
    const monthLinks = (
      await prisma.hubSpotContractInvoice.findMany({
        where: { status: "paid", ...(scope.buildingId ? contractMonthLinks(scope.buildingId) : {}) },
        select: { id: true, periodId: true, hubspotInvoiceId: true, amountCents: true, paidDate: true, paidAppliedAt: true },
      })
    ).map((l) => ({ ...l, manual: true }));
    const byPeriod = groupBy(monthLinks, (l) => l.periodId);
    const periods = await prisma.recurringContractPeriod.findMany({
      where: { id: { in: [...byPeriod.keys()] } },
      select: { id: true, billingStatus: true, amountCents: true, charges: { select: { amountCents: true } } },
    });
    const countedMonths: string[] = [];
    for (const period of periods) {
      const group = byPeriod.get(period.id)!;
      if (period.billingStatus !== "PAID") {
        if (!canApply(group, period.billingStatus, periodTotalCents(period))) continue;
        // Same as marking the month Paid by hand (see the period PATCH route).
        await prisma.recurringContractPeriod.update({ where: { id: period.id }, data: { billingStatus: "PAID", paidAt: summarize(group).paidOn ?? new Date() } });
        result.contractMonths += 1;
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
