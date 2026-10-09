import { prisma } from "@/lib/prisma";
import { matchUnitNumber, amountReconciles } from "@/lib/hubspot/billingMatch";
import { fetchDealInvoices, type DealInvoice } from "@/lib/hubspot/dealDocuments";

/**
 * Mirrors every invoice (any status) on a building's HubSpot deal into
 * HubSpotUnitInvoice, one row per (invoice, unit), so a turn can show its
 * invoice number, status and PDF link.
 *
 * Only ever writes HubSpotUnitInvoice. It reads the paid-invoice sync's
 * ledger and aliases to agree with its unit matches, but never touches
 * billingStatus or the review queue, so unpaid invoices can't mark anything
 * paid or show up as items to review.
 */

// Ledger statuses where a human or the sync settled which unit a line is for.
const SETTLED = new Set(["AUTO_APPLIED", "ALIAS_APPLIED", "RESOLVED", "ALREADY_PAID_SKIPPED"]);

function toDate(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** The invoice fields copied onto every mirror row, auto or manual. */
export function invoiceSnapshot(inv: DealInvoice) {
  return {
    invoiceNumber: inv.number,
    status: inv.status,
    invoiceDate: toDate(inv.invoiceDate),
    dueDate: toDate(inv.dueDate),
    paidDate: toDate(inv.paidDate),
    invoiceTotalCents: inv.billedCents,
    balanceDueCents: inv.balanceDueCents,
    viewUrl: inv.viewUrl,
    pdfUrl: inv.pdfUrl,
  };
}

type Turn = {
  id: string;
  unitNumber: string | null;
  createdAt: Date;
  startDate: Date | null;
  priceCents: number | null;
  approvedPriceCents: number | null;
  billingStatus: string;
};

/** Which turn of this unit an invoice is most likely for: the paid sync's
 * own match if it made one, otherwise among turns whose work started by the
 * invoice date, prefer a matching price, then a billing status that agrees
 * with the invoice (paid invoice, PAID turn), then the most recent. Work
 * date, not createdAt, since older turns were often entered after the fact. */
function pickTurn(turns: Turn[], invoice: { date: Date | null; status: string | null }, amountCents: number, ledgerTurnId: string | null): string | null {
  if (ledgerTurnId && turns.some((t) => t.id === ledgerTurnId)) return ledgerTurnId;
  const workDate = (t: Turn) => (t.startDate ?? t.createdAt).getTime();
  // A day of slack: the invoice often goes out the same day the work starts.
  const cutoff = invoice.date ? invoice.date.getTime() + 24 * 60 * 60 * 1000 : Infinity;
  const wantStatus = invoice.status === "paid" ? "PAID" : invoice.status === "open" ? "BILLED" : null;
  const score = (t: Turn) =>
    (amountReconciles(amountCents, t.approvedPriceCents ?? t.priceCents ?? -1) ? 2 : 0) + (wantStatus && t.billingStatus === wantStatus ? 1 : 0);
  const eligible = turns
    .filter((t) => workDate(t) <= cutoff)
    .sort((a, b) => score(b) - score(a) || workDate(b) - workDate(a) || b.createdAt.getTime() - a.createdAt.getTime());
  return eligible[0]?.id ?? null;
}

export async function syncBuildingUnitInvoices(
  buildingId: string,
  dealId: string,
  prefetched?: DealInvoice[],
): Promise<{ rows: number; unmatchedLines: number }> {
  const invoices = prefetched ?? (await fetchDealInvoices(dealId));

  // Invoices someone linked by hand: only their HubSpot details get
  // refreshed, never which units they point at.
  const manualInvoiceIds = new Set(
    (
      await prisma.hubSpotUnitInvoice.findMany({ where: { buildingId, manual: true }, select: { hubspotInvoiceId: true }, distinct: ["hubspotInvoiceId"] })
    ).map((r) => r.hubspotInvoiceId),
  );

  const [turns, aliases, ledger] = await Promise.all([
    prisma.turnoverRequest.findMany({
      where: { buildingId, unitNumber: { not: null } },
      select: { id: true, unitNumber: true, createdAt: true, startDate: true, priceCents: true, approvedPriceCents: true, billingStatus: true },
    }),
    prisma.hubSpotUnitAlias.findMany({ where: { buildingId, active: true }, select: { hubspotText: true, unitNumber: true } }),
    prisma.hubSpotInvoiceLineItemMatch.findMany({
      where: { hubspotLineItemId: { in: invoices.flatMap((i) => i.lineItems.map((li) => li.id)) } },
      select: { hubspotLineItemId: true, status: true, matchedUnitNumber: true, matchedTurnoverRequestId: true },
    }),
  ]);

  const knownUnits = Array.from(new Set(turns.map((t) => t.unitNumber!)));
  const turnsByUnit = new Map<string, Turn[]>();
  for (const t of turns) turnsByUnit.set(t.unitNumber!, [...(turnsByUnit.get(t.unitNumber!) ?? []), t]);
  const aliasByText = new Map(aliases.map((a) => [a.hubspotText, a.unitNumber]));
  const ledgerByLine = new Map(ledger.map((l) => [l.hubspotLineItemId, l]));

  let unmatchedLines = 0;
  const rows: Array<{ invoice: DealInvoice; unitNumber: string; amountCents: number; ledgerTurnId: string | null }> = [];

  for (const invoice of invoices) {
    if (manualInvoiceIds.has(invoice.id)) continue;
    const byUnit = new Map<string, { amountCents: number; ledgerTurnId: string | null }>();
    for (const li of invoice.lineItems) {
      const settled = ledgerByLine.get(li.id);
      let unit: string | null = settled && SETTLED.has(settled.status) ? settled.matchedUnitNumber : null;
      if (!unit) unit = aliasByText.get(li.haystack) ?? null;
      if (!unit) {
        const m = matchUnitNumber(li.haystack, knownUnits);
        unit = m.kind === "match" ? m.candidate : null;
      }
      if (!unit) {
        unmatchedLines += 1;
        continue;
      }
      const prev = byUnit.get(unit) ?? { amountCents: 0, ledgerTurnId: null };
      byUnit.set(unit, {
        amountCents: prev.amountCents + (li.amountCents ?? 0),
        ledgerTurnId: prev.ledgerTurnId ?? settled?.matchedTurnoverRequestId ?? null,
      });
    }
    for (const [unitNumber, v] of byUnit) rows.push({ invoice, unitNumber, ...v });
  }

  const keep = new Set<string>();
  for (const r of rows) {
    const inv = r.invoice;
    const snapshot = invoiceSnapshot(inv);
    const data = {
      buildingId,
      turnoverRequestId: pickTurn(turnsByUnit.get(r.unitNumber) ?? [], { date: snapshot.invoiceDate, status: inv.status }, r.amountCents, r.ledgerTurnId),
      amountCents: r.amountCents,
      ...snapshot,
    };
    const saved = await prisma.hubSpotUnitInvoice.upsert({
      where: { hubspotInvoiceId_unitNumber: { hubspotInvoiceId: inv.id, unitNumber: r.unitNumber } },
      create: { hubspotInvoiceId: inv.id, unitNumber: r.unitNumber, ...data },
      update: data,
      select: { id: true },
    });
    keep.add(saved.id);
  }

  for (const inv of invoices) {
    if (manualInvoiceIds.has(inv.id)) {
      await prisma.hubSpotUnitInvoice.updateMany({ where: { buildingId, hubspotInvoiceId: inv.id }, data: invoiceSnapshot(inv) });
    }
  }

  // Invoices deleted in HubSpot, or lines moved to another unit. Manual
  // links only go when their invoice is gone from the deal.
  const liveIds = invoices.map((i) => i.id);
  await prisma.hubSpotUnitInvoice.deleteMany({
    where: {
      buildingId,
      OR: [
        { manual: false, id: { notIn: Array.from(keep) } },
        { manual: true, hubspotInvoiceId: { notIn: liveIds } },
      ],
    },
  });

  return { rows: rows.length, unmatchedLines };
}

export async function syncAllUnitInvoices(): Promise<{ buildings: number; rows: number; errors: string[] }> {
  const buildings = await prisma.building.findMany({
    where: { hubspotDealId: { not: null } },
    select: { id: true, name: true, hubspotDealId: true },
  });
  let rows = 0;
  const errors: string[] = [];
  for (const b of buildings) {
    try {
      rows += (await syncBuildingUnitInvoices(b.id, b.hubspotDealId!)).rows;
    } catch (e) {
      errors.push(`${b.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { buildings: buildings.length, rows, errors };
}
