import { prisma } from "@/lib/prisma";
import { matchSovItem } from "@/lib/hubspot/billingMatch";
import { fetchDealInvoices, type DealInvoice } from "@/lib/hubspot/dealDocuments";
import { invoiceSnapshot } from "@/lib/hubspot/syncUnitInvoices";

/**
 * Project-side twin of syncUnitInvoices: mirrors every invoice on a
 * project's own HubSpot deal into HubSpotSovInvoice, one row per (invoice,
 * SOV item or change order), so SOV lines can show their invoice.
 *
 * Matching per line item, same order the paid-invoice sync uses: its own
 * settled match, then a confirmed alias, then word scoring against SOV item
 * descriptions and change order titles. Display-only: never touches
 * billingStatus or the review queue. Invoices linked by hand are left alone
 * apart from refreshing their HubSpot details.
 */

const SETTLED = new Set(["AUTO_APPLIED", "ALIAS_APPLIED", "RESOLVED", "ALREADY_PAID_SKIPPED"]);

type Target = { key: string; sovItemId: string | null; changeOrderId: string | null; description: string };

export async function syncProjectInvoices(
  projectId: string,
  dealId: string,
  prefetched?: DealInvoice[],
): Promise<{ rows: number; unmatchedLines: number }> {
  const invoices = prefetched ?? (await fetchDealInvoices(dealId));

  const manualInvoiceIds = new Set(
    (
      await prisma.hubSpotSovInvoice.findMany({ where: { projectId, manual: true }, select: { hubspotInvoiceId: true }, distinct: ["hubspotInvoiceId"] })
    ).map((r) => r.hubspotInvoiceId),
  );

  const [sovItems, changeOrders, aliases, ledger] = await Promise.all([
    prisma.projectSOVItem.findMany({ where: { sov: { projectId } }, select: { id: true, description: true } }),
    prisma.projectChangeOrder.findMany({ where: { projectId }, select: { id: true, title: true } }),
    prisma.hubSpotSovAlias.findMany({ where: { projectId, active: true }, select: { hubspotText: true, sovItemId: true } }),
    prisma.hubSpotInvoiceLineItemMatch.findMany({
      where: { hubspotLineItemId: { in: invoices.flatMap((i) => i.lineItems.map((li) => li.id)) } },
      select: { hubspotLineItemId: true, status: true, matchedSovItemId: true },
    }),
  ]);

  const targets: Target[] = [
    ...sovItems.map((i) => ({ key: `sov:${i.id}`, sovItemId: i.id, changeOrderId: null, description: i.description })),
    ...changeOrders.map((c) => ({ key: `co:${c.id}`, sovItemId: null, changeOrderId: c.id, description: c.title })),
  ];
  const targetByKey = new Map(targets.map((t) => [t.key, t]));
  const aliasByText = new Map(aliases.map((a) => [a.hubspotText, a.sovItemId]));
  const ledgerByLine = new Map(ledger.map((l) => [l.hubspotLineItemId, l]));

  let unmatchedLines = 0;
  const rows: Array<{ invoice: DealInvoice; target: Target; amountCents: number }> = [];

  for (const invoice of invoices) {
    if (manualInvoiceIds.has(invoice.id)) continue;
    const byTarget = new Map<string, number>();
    for (const li of invoice.lineItems) {
      const settled = ledgerByLine.get(li.id);
      let sovItemId: string | null = settled && SETTLED.has(settled.status) ? settled.matchedSovItemId : null;
      if (!sovItemId) sovItemId = aliasByText.get(li.haystack) ?? null;
      let key = sovItemId ? `sov:${sovItemId}` : null;
      if (!key) {
        const m = matchSovItem(li.haystack, targets, 0.8);
        key = m.kind === "match" ? m.candidate.key : null;
      }
      if (!key || !targetByKey.has(key)) {
        unmatchedLines += 1;
        continue;
      }
      byTarget.set(key, (byTarget.get(key) ?? 0) + (li.amountCents ?? 0));
    }
    for (const [key, amountCents] of byTarget) rows.push({ invoice, target: targetByKey.get(key)!, amountCents });
  }

  // Auto rows are rebuilt from scratch each time: there's no natural unique
  // key (sovItemId/changeOrderId are each nullable), and a project has at
  // most a few dozen invoice lines.
  await prisma.$transaction([
    prisma.hubSpotSovInvoice.deleteMany({
      where: {
        projectId,
        OR: [{ manual: false }, { manual: true, hubspotInvoiceId: { notIn: invoices.map((i) => i.id) } }],
      },
    }),
    prisma.hubSpotSovInvoice.createMany({
      data: rows.map((r) => ({
        projectId,
        hubspotInvoiceId: r.invoice.id,
        sovItemId: r.target.sovItemId,
        changeOrderId: r.target.changeOrderId,
        amountCents: r.amountCents,
        ...invoiceSnapshot(r.invoice),
      })),
    }),
    ...invoices
      .filter((i) => manualInvoiceIds.has(i.id))
      .map((i) => prisma.hubSpotSovInvoice.updateMany({ where: { projectId, hubspotInvoiceId: i.id }, data: invoiceSnapshot(i) })),
  ]);

  return { rows: rows.length, unmatchedLines };
}

export async function syncAllProjectInvoices(): Promise<{ projects: number; rows: number; errors: string[] }> {
  const projects = await prisma.project.findMany({
    where: { hubspotDealId: { not: null }, turnoverRequestId: null },
    select: { id: true, jobTitle: true, hubspotDealId: true },
  });
  let rows = 0;
  const errors: string[] = [];
  for (const p of projects) {
    try {
      rows += (await syncProjectInvoices(p.id, p.hubspotDealId!)).rows;
    } catch (e) {
      errors.push(`${p.jobTitle}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { projects: projects.length, rows, errors };
}
