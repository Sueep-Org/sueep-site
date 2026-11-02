import { prisma } from "@/lib/prisma";
import { applyPaidInvoiceLinks } from "@/lib/hubspot/applyPaidLinks";
import { QUICKBOOKS_LINKS } from "./invoiceLinkSource";

/**
 * Paid status for invoices the ERP made in QuickBooks (ERP_QBO_INVOICING_PLAN.md
 * Phase 2, QUICKBOOKS_PLAN.md step A). After the nightly sync saves
 * QuickBooks' invoices and payments, each QuickBooks link row gets the
 * invoice's status, balance and paid date, and the usual rules in
 * applyPaidLinks.ts move its lines to Billed or Paid (once, hand edits win).
 *
 * - balance left: open
 * - nothing left: paid, on the day of the last payment applied to it
 * - total of zero: voided (QuickBooks keeps a voided invoice at $0)
 * An invoice the sync didn't read (older than its window) is left as it was.
 */

/** A QuickBooks day ("YYYY-MM-DD") at noon UTC, the same day in New York, like other paid dates. */
const dayAtNoon = (key: string) => new Date(`${key}T12:00:00Z`);

export async function refreshQuickBooksLinks(): Promise<{ updated: number }> {
  const where = { ...QUICKBOOKS_LINKS, qboInvoiceId: { not: null } };
  const select = { id: true, qboInvoiceId: true, status: true, balanceDueCents: true, invoiceTotalCents: true, paidDate: true } as const;
  const [units, lines, months] = await Promise.all([
    prisma.hubSpotUnitInvoice.findMany({ where, select }),
    prisma.hubSpotSovInvoice.findMany({ where, select }),
    prisma.hubSpotContractInvoice.findMany({ where, select }),
  ]);
  const ids = [...new Set([...units, ...lines, ...months].map((r) => r.qboInvoiceId!))];
  if (ids.length === 0) return { updated: 0 };

  const [invoices, payments] = await Promise.all([
    prisma.qboInvoice.findMany({ where: { qboId: { in: ids } }, select: { qboId: true, totalCents: true, balanceCents: true } }),
    prisma.qboPayment.findMany({ select: { txnDate: true, links: true } }),
  ]);
  const lastPaid = new Map<string, string>();
  for (const p of payments) {
    if (!p.txnDate) continue;
    for (const l of (p.links as { invoiceQboId?: string }[]) ?? []) {
      const prev = l.invoiceQboId ? lastPaid.get(l.invoiceQboId) : undefined;
      if (l.invoiceQboId && (!prev || p.txnDate > prev)) lastPaid.set(l.invoiceQboId, p.txnDate);
    }
  }
  const stateOf = new Map(
    invoices.map((i) => {
      const status = i.totalCents === 0 ? "voided" : i.balanceCents === 0 ? "paid" : "open";
      const paidKey = status === "paid" ? lastPaid.get(i.qboId) : undefined;
      return [i.qboId, { status, balanceDueCents: i.balanceCents, invoiceTotalCents: i.totalCents, paidDate: paidKey ? dayAtNoon(paidKey) : null }];
    }),
  );

  let updated = 0;
  const changed = (r: (typeof units)[number]) => {
    const s = stateOf.get(r.qboInvoiceId!);
    if (!s) return null;
    const same =
      r.status === s.status && r.balanceDueCents === s.balanceDueCents && r.invoiceTotalCents === s.invoiceTotalCents && (r.paidDate?.getTime() ?? null) === (s.paidDate?.getTime() ?? null);
    return same ? null : s;
  };
  for (const r of units) {
    const s = changed(r);
    if (!s) continue;
    await prisma.hubSpotUnitInvoice.update({ where: { id: r.id }, data: s });
    updated++;
  }
  for (const r of lines) {
    const s = changed(r);
    if (!s) continue;
    await prisma.hubSpotSovInvoice.update({ where: { id: r.id }, data: s });
    updated++;
  }
  for (const r of months) {
    const s = changed(r);
    if (!s) continue;
    await prisma.hubSpotContractInvoice.update({ where: { id: r.id }, data: s });
    updated++;
  }
  if (updated > 0) await applyPaidInvoiceLinks();
  return { updated };
}
