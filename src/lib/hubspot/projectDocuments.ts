import { prisma } from "@/lib/prisma";
import { normalizeBillingStatus } from "@/lib/erp/billingStatus";
import { fetchDealInvoices, type DealInvoice, type DealQuote } from "@/lib/hubspot/dealDocuments";

/**
 * HubSpot invoice/quote helpers for post-construction projects, where each
 * project has its own deal (unlike turns, which share their building's deal).
 * Read-only toward the ERP: nothing here changes billing status.
 */

/** Within a dollar counts as equal (rounding on HubSpot's side). */
const SAME_CENTS = 100;

export type BillingTotals = { invoicedCents: number; paidCents: number };

/** What the ERP says has been billed and paid on each project: SOV items
 * plus change orders, or the whole-project contract when it has neither
 * (same fallback as the post-construction billing tab). */
export async function erpBillingTotals(projectIds: string[]): Promise<Map<string, BillingTotals>> {
  const [projects, items, cos] = await Promise.all([
    prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, billingStatus: true, contractValueCents: true } }),
    prisma.projectSOVItem.findMany({
      where: { sov: { projectId: { in: projectIds } } },
      select: { scheduledValueCents: true, billingStatus: true, sov: { select: { projectId: true } } },
    }),
    prisma.projectChangeOrder.findMany({
      where: { projectId: { in: projectIds } },
      select: { projectId: true, contractValueCents: true, billingStatus: true },
    }),
  ]);

  const out = new Map<string, BillingTotals>();
  const hasDetail = new Set<string>();
  const add = (projectId: string, cents: number, rawStatus: string | null) => {
    const status = normalizeBillingStatus(rawStatus);
    const t = out.get(projectId) ?? { invoicedCents: 0, paidCents: 0 };
    if (status !== "NOT_BILLED") t.invoicedCents += cents;
    if (status === "PAID") t.paidCents += cents;
    out.set(projectId, t);
  };
  for (const i of items) {
    hasDetail.add(i.sov.projectId);
    add(i.sov.projectId, i.scheduledValueCents, i.billingStatus);
  }
  for (const c of cos) {
    hasDetail.add(c.projectId);
    add(c.projectId, c.contractValueCents ?? 0, c.billingStatus);
  }
  for (const p of projects) {
    if (!hasDetail.has(p.id)) add(p.id, p.contractValueCents ?? 0, p.billingStatus);
  }
  return out;
}

/** HubSpot's side of the same totals. Drafts and voided invoices don't count. */
export function hubspotBillingTotals(invoices: DealInvoice[]): BillingTotals {
  let invoicedCents = 0;
  let paidCents = 0;
  for (const i of invoices) {
    if (i.status !== "open" && i.status !== "paid") continue;
    const billed = i.billedCents ?? 0;
    invoicedCents += billed;
    paidCents += billed - (i.balanceDueCents ?? 0);
  }
  return { invoicedCents, paidCents };
}

export function totalsDisagree(a: BillingTotals, b: BillingTotals): boolean {
  return Math.abs(a.invoicedCents - b.invoicedCents) > SAME_CENTS || Math.abs(a.paidCents - b.paidCents) > SAME_CENTS;
}

/** The project's contract: SOV total when it has an SOV, else contractValueCents. */
export async function projectContractCents(projectId: string): Promise<number | null> {
  const [project, sov] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { contractValueCents: true } }),
    prisma.projectSOVItem.aggregate({ where: { sov: { projectId } }, _sum: { scheduledValueCents: true }, _count: true }),
  ]);
  if (sov._count > 0) return sov._sum.scheduledValueCents ?? 0;
  return project?.contractValueCents ?? null;
}

/** The quote whose total equals the contract, checked both with tax
 * (quote amount) and before tax (sum of its lines). Sent quotes win over
 * drafts, and newer over older, so a revised quote wins over the one it
 * replaced. */
export function quoteMatchingContract(quotes: DealQuote[], contractCents: number): DealQuote | null {
  const same = (c: number | null) => c != null && Math.abs(c - contractCents) <= SAME_CENTS;
  const matches = quotes.filter((q) => {
    const preTax = q.lineItems.reduce((s, li) => s + (li.amountCents ?? 0), 0);
    return same(q.amountCents) || (q.lineItems.length > 0 && same(preTax));
  });
  return matches.find((q) => q.status !== "DRAFT") ?? matches[0] ?? null;
}

// Short cache so paging through the Billing page doesn't refetch the same
// deals from HubSpot every time. Per server instance, display-only data.
const CACHE_MS = 5 * 60 * 1000;
const invoiceCache = new Map<string, { at: number; invoices: DealInvoice[] }>();

export async function cachedDealInvoices(dealId: string): Promise<DealInvoice[]> {
  const hit = invoiceCache.get(dealId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.invoices;
  const invoices = await fetchDealInvoices(dealId);
  invoiceCache.set(dealId, { at: Date.now(), invoices });
  return invoices;
}
