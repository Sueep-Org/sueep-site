import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canSeeFinancials } from "@/lib/erpAuth";
import { fetchDealDocuments } from "@/lib/hubspot/dealDocuments";
import { syncBuildingUnitInvoices } from "@/lib/hubspot/syncUnitInvoices";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Invoices and quotes on this building's HubSpot deal, read live. Each
 * invoice line item is tagged with the unit the paid-invoice sync already
 * matched it to (HubSpotInvoiceLineItemMatch), when there is one.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getErpAuth();
  if (!auth || !canSeeFinancials(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const building = await prisma.building.findUnique({ where: { id }, select: { hubspotDealId: true } });
  if (!building) return NextResponse.json({ error: "Building not found" }, { status: 404 });
  if (!building.hubspotDealId) {
    return NextResponse.json({ dealId: null, invoices: [], quotes: [], quotesError: null });
  }

  let docs;
  try {
    docs = await fetchDealDocuments(building.hubspotDealId);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }

  // Opening the tab doubles as a refresh of this building's per-unit
  // invoice chips, reusing what was just fetched. Display-only data, so a
  // failure here shouldn't block showing the invoices.
  try {
    await syncBuildingUnitInvoices(id, building.hubspotDealId, docs.invoices);
  } catch (err) {
    console.error("[hubspot-documents] unit invoice sync failed", err);
  }

  const [unitRows, turns] = await Promise.all([
    prisma.hubSpotUnitInvoice.findMany({
      where: { buildingId: id },
      select: { hubspotInvoiceId: true, unitNumber: true, turnoverRequestId: true, amountCents: true, manual: true, linkedByName: true },
    }),
    prisma.turnoverRequest.findMany({
      where: { buildingId: id, unitNumber: { not: null } },
      select: { id: true, unitNumber: true, startDate: true, createdAt: true, approvedPriceCents: true, priceCents: true },
      orderBy: [{ unitNumber: "asc" }, { startDate: "desc" }],
    }),
  ]);
  const linksByInvoice = new Map<string, InvoiceLink[]>();
  for (const r of unitRows) {
    linksByInvoice.set(r.hubspotInvoiceId, [
      ...(linksByInvoice.get(r.hubspotInvoiceId) ?? []),
      { targetId: r.turnoverRequestId, label: unitLabel(r.unitNumber), amountCents: r.amountCents, manual: r.manual, linkedByName: r.linkedByName },
    ]);
  }

  return NextResponse.json({
    dealId: building.hubspotDealId,
    invoices: docs.invoices.map(({ lineItems, ...inv }) => ({
      ...inv,
      links: linksByInvoice.get(inv.id) ?? [],
      lineItems: lineItems.map(({ haystack: _haystack, ...li }) => li),
    })),
    quotes: docs.quotes.map(({ lineItems, ...q }) => ({ ...q, lineItems: lineItems.map(({ haystack: _haystack, ...li }) => li) })),
    quotesError: docs.quotesError,
    link: {
      scope: "building",
      ownerId: id,
      targets: turns.map((t) => ({
        id: t.id,
        label: unitLabel(t.unitNumber!),
        hint: [fmtDay(t.startDate ?? t.createdAt), cents(t.approvedPriceCents ?? t.priceCents)].filter(Boolean).join(" · "),
      })),
    },
  });
}

type InvoiceLink = { targetId: string | null; label: string; amountCents: number; manual: boolean; linkedByName: string | null };

// Unit numbers are stored both as "212" and "Unit 212".
function unitLabel(unitNumber: string): string {
  return /^unit\b/i.test(unitNumber) ? unitNumber : `Unit ${unitNumber}`;
}

function fmtDay(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function cents(c: number | null): string {
  return c == null ? "" : `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
