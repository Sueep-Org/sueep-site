import { prisma } from "@/lib/prisma";
import { matchSovItem } from "@/lib/hubspot/billingMatch";
import { fetchDealInvoices, type DealInvoice } from "@/lib/hubspot/dealDocuments";
import { invoiceSnapshot } from "@/lib/hubspot/syncUnitInvoices";
import { applyPaidInvoiceLinks } from "@/lib/hubspot/applyPaidLinks";

/**
 * Project-side twin of syncUnitInvoices: mirrors every invoice on a
 * project's own HubSpot deal into HubSpotSovInvoice, one row per (invoice,
 * SOV item or change order), so SOV lines can show their invoice.
 *
 * Matching per line item, same order the paid-invoice sync uses: its own
 * settled match, then a confirmed alias, then word scoring against SOV item
 * descriptions and change order titles. This only saves the links; whether
 * a paid link marks its line Paid is decided by applyPaidInvoiceLinks, which
 * syncAllProjectInvoices runs afterwards. Invoices linked by hand are left
 * alone apart from refreshing their HubSpot details.
 *
 * The automatic match gives a line one invoice at most, though one invoice
 * can cover many lines. Only a person can put a second invoice on a line.
 * A line someone linked by hand gets no new automatic invoice (one it already
 * had stays), and when two invoices both match the same line only the one
 * whose amount fits it best is kept; the other shows as not linked for a
 * person to place.
 */

const SETTLED = new Set(["AUTO_APPLIED", "ALIAS_APPLIED", "RESOLVED", "ALREADY_PAID_SKIPPED"]);

type Target = { key: string; sovItemId: string | null; changeOrderId: string | null; description: string; valueCents: number | null };

export async function syncProjectInvoices(
  projectId: string,
  dealId: string,
  prefetched?: DealInvoice[],
): Promise<{ rows: number; unmatchedLines: number }> {
  const invoices = prefetched ?? (await fetchDealInvoices(dealId));

  const manualRows = await prisma.hubSpotSovInvoice.findMany({
    where: { projectId, manual: true },
    select: { hubspotInvoiceId: true, sovItemId: true, changeOrderId: true },
  });
  // Automatic rows are rebuilt below, so remember which ones existed (a hand
  // link added beside one keeps it) and which the sync has already counted
  // as billed or paid, to carry that across (see applyPaidLinks.ts).
  const autoRows = new Map(
    (
      await prisma.hubSpotSovInvoice.findMany({
        where: { projectId, manual: false },
        select: { hubspotInvoiceId: true, sovItemId: true, changeOrderId: true, paidAppliedAt: true, billedAppliedAt: true },
      })
    ).map((r) => [
      `${r.hubspotInvoiceId}|${r.sovItemId ? `sov:${r.sovItemId}` : `co:${r.changeOrderId}`}`,
      { paidAppliedAt: r.paidAppliedAt, billedAppliedAt: r.billedAppliedAt },
    ]),
  );
  const manualInvoiceIds = new Set(manualRows.map((r) => r.hubspotInvoiceId));
  // Lines a person already gave to an invoice that is still on the deal.
  const onDeal = new Set(invoices.map((i) => i.id));
  const heldByHand = new Set(
    manualRows
      .filter((r) => onDeal.has(r.hubspotInvoiceId))
      .flatMap((r) => (r.sovItemId ? [`sov:${r.sovItemId}`] : r.changeOrderId ? [`co:${r.changeOrderId}`] : [])),
  );

  const [sovItems, changeOrders, aliases, ledger] = await Promise.all([
    prisma.projectSOVItem.findMany({ where: { sov: { projectId } }, select: { id: true, description: true, scheduledValueCents: true } }),
    prisma.projectChangeOrder.findMany({ where: { projectId }, select: { id: true, title: true, contractValueCents: true } }),
    prisma.hubSpotSovAlias.findMany({ where: { projectId, active: true }, select: { hubspotText: true, sovItemId: true } }),
    prisma.hubSpotInvoiceLineItemMatch.findMany({
      where: { hubspotLineItemId: { in: invoices.flatMap((i) => i.lineItems.map((li) => li.id)) } },
      select: { hubspotLineItemId: true, status: true, matchedSovItemId: true },
    }),
  ]);

  const targets: Target[] = [
    ...sovItems.map((i) => ({ key: `sov:${i.id}`, sovItemId: i.id, changeOrderId: null, description: i.description, valueCents: i.scheduledValueCents })),
    ...changeOrders.map((c) => ({ key: `co:${c.id}`, sovItemId: null, changeOrderId: c.id, description: c.title, valueCents: c.contractValueCents })),
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
    for (const [key, amountCents] of byTarget) {
      // A line linked by hand only keeps an automatic invoice it already had.
      if (heldByHand.has(key) && !autoRows.has(`${invoice.id}|${key}`)) {
        unmatchedLines += 1;
        continue;
      }
      rows.push({ invoice, target: targetByKey.get(key)!, amountCents });
    }
  }

  // One invoice per line: where several matched the same line, keep the one
  // closest to the line's value, then the earliest.
  const winnerByTarget = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const current = winnerByTarget.get(r.target.key);
    if (!current) {
      winnerByTarget.set(r.target.key, r);
      continue;
    }
    const off = (x: typeof r) => Math.abs(x.amountCents - (x.target.valueCents ?? 0));
    const date = (x: typeof r) => x.invoice.invoiceDate ?? "";
    if (off(r) < off(current) || (off(r) === off(current) && date(r) < date(current))) winnerByTarget.set(r.target.key, r);
  }
  unmatchedLines += rows.length - winnerByTarget.size;
  const keptRows = [...winnerByTarget.values()];

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
      data: keptRows.map((r) => ({
        projectId,
        hubspotInvoiceId: r.invoice.id,
        sovItemId: r.target.sovItemId,
        changeOrderId: r.target.changeOrderId,
        amountCents: r.amountCents,
        ...(autoRows.get(`${r.invoice.id}|${r.target.key}`) ?? {}),
        ...invoiceSnapshot(r.invoice),
      })),
    }),
    ...invoices
      .filter((i) => manualInvoiceIds.has(i.id))
      .map((i) => prisma.hubSpotSovInvoice.updateMany({ where: { projectId, hubspotInvoiceId: i.id }, data: invoiceSnapshot(i) })),
  ]);

  return { rows: keptRows.length, unmatchedLines };
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
  try {
    await applyPaidInvoiceLinks();
  } catch (e) {
    errors.push(`linked invoices: ${e instanceof Error ? e.message : String(e)}`);
  }
  return { projects: projects.length, rows, errors };
}
