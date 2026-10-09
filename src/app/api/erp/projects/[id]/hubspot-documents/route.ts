import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canSeeFinancials } from "@/lib/erpAuth";
import { fetchDealDocuments } from "@/lib/hubspot/dealDocuments";
import { projectContractCents, quoteMatchingContract } from "@/lib/hubspot/projectDocuments";
import { syncProjectInvoices } from "@/lib/hubspot/syncProjectInvoices";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Invoices and quotes on this project's own HubSpot deal, read live, plus
 * whether the project's contract matches any of the quotes. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getErpAuth();
  if (!auth || !canSeeFinancials(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id }, select: { hubspotDealId: true } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (!project.hubspotDealId) {
    return NextResponse.json({ dealId: null, invoices: [], quotes: [], quotesError: null, contractCheck: null });
  }

  let docs;
  try {
    docs = await fetchDealDocuments(project.hubspotDealId);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }

  // Opening the tab refreshes this project's SOV invoice links, reusing
  // what was just fetched. Display-only, so a failure here is just logged.
  try {
    await syncProjectInvoices(id, project.hubspotDealId, docs.invoices);
  } catch (err) {
    console.error("[hubspot-documents] project invoice sync failed", err);
  }

  const [linkRows, sovItems, changeOrders] = await Promise.all([
    prisma.hubSpotSovInvoice.findMany({
      where: { projectId: id },
      select: {
        hubspotInvoiceId: true,
        sovItemId: true,
        changeOrderId: true,
        amountCents: true,
        manual: true,
        linkedByName: true,
        sovItem: { select: { description: true } },
        changeOrder: { select: { title: true } },
      },
    }),
    prisma.projectSOVItem.findMany({
      where: { sov: { projectId: id } },
      select: { id: true, description: true, scheduledValueCents: true },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    }),
    prisma.projectChangeOrder.findMany({
      where: { projectId: id },
      select: { id: true, title: true, contractValueCents: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const linksByInvoice = new Map<string, unknown[]>();
  for (const r of linkRows) {
    linksByInvoice.set(r.hubspotInvoiceId, [
      ...(linksByInvoice.get(r.hubspotInvoiceId) ?? []),
      {
        targetId: r.sovItemId ? `sov:${r.sovItemId}` : `co:${r.changeOrderId}`,
        label: r.sovItem?.description ?? `CO: ${r.changeOrder?.title ?? ""}`,
        amountCents: r.amountCents,
        manual: r.manual,
        linkedByName: r.linkedByName,
      },
    ]);
  }
  const money = (c: number | null) => (c == null ? "" : `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

  const contractCents = await projectContractCents(id);
  const match = contractCents ? quoteMatchingContract(docs.quotes, contractCents) : null;
  const contractCheck =
    contractCents != null && contractCents > 0
      ? { contractCents, matchingQuoteTitle: match ? (match.title ?? match.number ?? "Untitled") : null, matchingQuoteIsDraft: match?.status === "DRAFT" }
      : null;

  const strip = <T extends { lineItems: Array<{ haystack: string }> }>(d: T) => ({
    ...d,
    lineItems: d.lineItems.map(({ haystack: _haystack, ...li }) => li),
  });

  return NextResponse.json({
    dealId: project.hubspotDealId,
    invoices: docs.invoices.map((inv) => ({ ...strip(inv), links: linksByInvoice.get(inv.id) ?? [] })),
    quotes: docs.quotes.map(strip),
    quotesError: docs.quotesError,
    contractCheck,
    link: {
      scope: "project",
      ownerId: id,
      targets: [
        ...sovItems.map((i) => ({ id: `sov:${i.id}`, label: i.description, hint: `SOV · ${money(i.scheduledValueCents)}` })),
        ...changeOrders.map((c) => ({ id: `co:${c.id}`, label: `CO: ${c.title}`, hint: `Change order · ${money(c.contractValueCents)}` })),
      ],
    },
  });
}
