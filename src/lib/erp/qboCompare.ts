/**
 * Compare with QuickBooks (Finance tab): each finished month's money in and
 * costs, ERP next to QuickBooks, with a few plain sentences on why they
 * differ. Built on the QuickBooks details check (qboCheck.ts). Explains
 * only; it never changes either side.
 */
import { prisma } from "@/lib/prisma";
import { CHECK_LINE_LABELS, loadMonthlyCheck } from "./qboCheck";
import { FINANCE_DATA_START } from "./financeSummary";
import { cachedFinanceSummary } from "./financeSummaryCached";
import { QBO_COST_SECTIONS } from "./qboOverhead";

export type CompareReason = { text: string; cents: number };
export type CompareMonth = {
  month: string;
  /** QuickBooks isn't finished for this month yet (its costs look incomplete), so its numbers will still change. */
  unfinished: boolean;
  revenue: { erpCents: number; qboCents: number; reasons: CompareReason[] };
  costs: { erpCents: number; qboCents: number; reasons: CompareReason[] };
};

/** Differences smaller than this aren't worth a sentence. */
const MIN_REASON_CENTS = 10_000;
const MAX_REASONS = 3;

const money = (c: number) => `$${Math.round(Math.abs(c) / 100).toLocaleString("en-US")}`;

/** What each revenue group from the check means, in one sentence. */
const REVENUE_WORDS: Record<string, (cents: number) => string> = {
  "qbo-other": (c) => `${money(c)} was paid in QuickBooks this month, but the ERP counts that work in another month (timing).`,
  "erp-other": (c) => `${money(c)} of work the ERP counts this month was paid in QuickBooks in another month (timing).`,
  "qbo-only": (c) => `${money(c)} of paid invoices are in QuickBooks but not tied to any ERP job.`,
  "no-invoice": (c) => `${money(c)} of QuickBooks deposits have no invoice behind them, often a payment counted twice there.`,
  "erp-no-payment": (c) => `${money(c)} the ERP counts as paid has no payment in QuickBooks.`,
  "erp-no-invoice": (c) => `${money(c)} of ERP work has no invoice linked, so it can't be matched.`,
  matched: (c) => `${money(c)} difference on invoices in both, from partial payments or different amounts.`,
};

/**
 * Without QuickBooks' transaction detail, explain revenue from its invoice
 * payments: income that isn't a payment on any invoice, and ERP paid work
 * that doesn't line up with this month's payments.
 */
function paymentReasons(erpCents: number, qboIncomeCents: number, paidOnInvoicesCents: number): CompareReason[] {
  const reasons: CompareReason[] = [];
  const notInvoices = qboIncomeCents - paidOnInvoicesCents;
  if (notInvoices > 0) {
    reasons.push({ text: `${money(notInvoices)} of QuickBooks income isn't a payment on any invoice: deposits recorded straight as income, often the same money counted twice.`, cents: notInvoices });
  }
  const timing = erpCents - paidOnInvoicesCents;
  if (timing > 0) {
    reasons.push({ text: `${money(timing)} the ERP counts as paid this month has no QuickBooks payment this month: paid on another day there, or marked paid without a payment.`, cents: timing });
  } else if (timing < 0) {
    reasons.push({ text: `${money(timing)} of invoice payments in QuickBooks this month are counted by the ERP in another month, or are on invoices the ERP doesn't have.`, cents: timing });
  }
  return reasons;
}

const top = (reasons: CompareReason[]) =>
  reasons
    .filter((r) => Math.abs(r.cents) >= MIN_REASON_CENTS)
    .sort((a, b) => Math.abs(b.cents) - Math.abs(a.cents))
    .slice(0, MAX_REASONS);

export async function loadQuickBooksComparison(): Promise<CompareMonth[]> {
  // The summary first: loadMonthlyCheck reads the same one, and two cold
  // requests at once would each do the whole calculation.
  const summary = await cachedFinanceSummary("paid", { startKey: FINANCE_DATA_START });
  const [checks, qboCostLines, payments] = await Promise.all([
    loadMonthlyCheck(),
    prisma.qboPnlLine.findMany({ where: { month: { gte: FINANCE_DATA_START }, section: { in: [...QBO_COST_SECTIONS] } }, select: { month: true, amountCents: true } }),
    prisma.qboPayment.findMany({ where: { txnDate: { gte: `${FINANCE_DATA_START}-01` } }, select: { txnDate: true, links: true } }),
  ]);
  // Invoice payments QuickBooks recorded each month (the part of its income tied to an invoice).
  const paidOnInvoices = new Map<string, number>();
  for (const p of payments) {
    const mk = p.txnDate!.slice(0, 7);
    const cents = ((p.links ?? []) as { amountCents: number }[]).reduce((sum, l) => sum + l.amountCents, 0);
    paidOnInvoices.set(mk, (paidOnInvoices.get(mk) ?? 0) + cents);
  }

  return checks.map((check) => {
    const revenueLine = check.lines.find((l) => l.line === "REVENUE")!;
    const m = summary.months.find((x) => x.key === check.month);
    const revenueReasons: CompareReason[] = revenueLine.groups.length
      ? revenueLine.groups.map((g) => {
          const cents = g.key === "matched" ? g.qboCents - g.erpCents : g.qboCents || g.erpCents;
          return { text: (REVENUE_WORDS[g.key] ?? ((c: number) => `${money(c)}: ${g.label}.`))(cents), cents };
        })
      : paymentReasons(revenueLine.erpCents, revenueLine.qboCents, paidOnInvoices.get(check.month) ?? 0);

    const erpCosts = m ? m.laborCents + m.materialCents + m.overheadCents : 0;
    const qboCosts = qboCostLines.filter((l) => l.month === check.month).reduce((s, l) => s + l.amountCents, 0);
    const costReasons: CompareReason[] = check.lines
      .filter((l) => l.line !== "REVENUE" && l.status !== "MATCH")
      .map((l) => ({
        text: `${CHECK_LINE_LABELS[l.line].label}: ERP ${money(l.erpCents)}, QuickBooks ${money(l.qboCents)}. ${l.note ?? CHECK_LINE_LABELS[l.line].reasons}`,
        cents: l.qboCents - l.erpCents,
      }));

    return {
      month: check.month,
      unfinished: !!m && m.qboEstimatedCents > 0,
      revenue: { erpCents: revenueLine.erpCents, qboCents: revenueLine.qboCents, reasons: top(revenueReasons) },
      costs: { erpCents: erpCosts, qboCents: qboCosts, reasons: top(costReasons) },
    };
  });
}
