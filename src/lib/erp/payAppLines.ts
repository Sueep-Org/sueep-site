/**
 * A job's full schedule of values as a pay app (INVOICE_TRACKING_PLAN.md
 * Phase 9): every SOV line and change order in order, with what earlier
 * invoices billed, what this invoice bills, and what's left. Shown on Needs
 * upload so the numbers can be copied straight into Procore.
 */
import { prisma } from "@/lib/prisma";
import { changeOrderValueCents, isQualifyingChangeOrder } from "./projectMargin";

export type PayAppLine = {
  kind: "SOV" | "CO";
  description: string;
  scheduledCents: number;
  previousCents: number;
  thisCents: number;
  toDateCents: number;
  /** Whole percent of the scheduled value billed to date, null when the value is 0 */
  percent: number | null;
  balanceCents: number;
};

export type PayApp = { lines: PayAppLine[]; totals: Omit<PayAppLine, "kind" | "description" | "percent"> & { percent: number | null } };

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : null);

/** Null when the job has no SOV lines or change orders, or the invoice isn't linked to any of them. */
export async function loadPayApp(projectId: string, invoice: { qboInvoiceId: string | null; hubspotInvoiceId: string | null }): Promise<PayApp | null> {
  const [items, changeOrders, links] = await Promise.all([
    prisma.projectSOVItem.findMany({ where: { sov: { projectId } }, select: { id: true, description: true, scheduledValueCents: true, billingStatus: true }, orderBy: [{ order: "asc" }, { createdAt: "asc" }] }),
    prisma.projectChangeOrder.findMany({ where: { projectId }, select: { id: true, title: true, status: true, billingStatus: true, contractValueCents: true, estimatedCostCents: true }, orderBy: { createdAt: "asc" } }),
    prisma.hubSpotSovInvoice.findMany({
      where: { projectId, NOT: { status: "voided" } },
      select: { sovItemId: true, changeOrderId: true, qboInvoiceId: true, hubspotInvoiceId: true, amountCents: true, invoiceDate: true, createdAt: true },
    }),
  ]);
  const isThis = (l: (typeof links)[number]) =>
    (!!invoice.qboInvoiceId && l.qboInvoiceId === invoice.qboInvoiceId) || (!!invoice.hubspotInvoiceId && l.hubspotInvoiceId === invoice.hubspotInvoiceId);
  const mine = links.filter(isThis);
  if (!mine.length) return null;
  // Earlier invoices: dated on or before this one, so a later invoice never counts as "previous".
  const thisDate = Math.min(...mine.map((l) => (l.invoiceDate ?? l.createdAt).getTime()));
  const earlier = links.filter((l) => !isThis(l) && (l.invoiceDate ?? l.createdAt).getTime() <= thisDate);

  const line = (kind: PayAppLine["kind"], description: string, scheduledCents: number, match: (l: (typeof links)[number]) => boolean): PayAppLine => {
    const previousCents = earlier.filter(match).reduce((s, l) => s + l.amountCents, 0);
    const thisCents = mine.filter(match).reduce((s, l) => s + l.amountCents, 0);
    const toDateCents = previousCents + thisCents;
    return { kind, description, scheduledCents, previousCents, thisCents, toDateCents, percent: pct(toDateCents, scheduledCents), balanceCents: scheduledCents - toDateCents };
  };
  const lines = [
    ...items.filter((i) => i.billingStatus !== "VOIDED").map((i) => line("SOV", i.description, i.scheduledValueCents, (l) => l.sovItemId === i.id)),
    ...changeOrders.filter((co) => isQualifyingChangeOrder(co) && co.billingStatus !== "VOIDED").map((co) => line("CO", co.title, changeOrderValueCents(co), (l) => l.changeOrderId === co.id)),
  ];
  const sum = (k: "scheduledCents" | "previousCents" | "thisCents" | "toDateCents" | "balanceCents") => lines.reduce((s, l) => s + l[k], 0);
  const totals = { scheduledCents: sum("scheduledCents"), previousCents: sum("previousCents"), thisCents: sum("thisCents"), toDateCents: sum("toDateCents"), balanceCents: sum("balanceCents") };
  return { lines, totals: { ...totals, percent: pct(totals.toDateCents, totals.scheduledCents) } };
}
