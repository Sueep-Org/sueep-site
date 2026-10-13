import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canSeeFinancials } from "@/lib/erpAuth";
import { fetchDealInvoices } from "@/lib/hubspot/dealDocuments";
import { invoiceSnapshot, syncBuildingUnitInvoices, unitChangeOrderProjects, contractMonthLinks } from "@/lib/hubspot/syncUnitInvoices";
import { syncProjectInvoices } from "@/lib/hubspot/syncProjectInvoices";
import { applyPaidInvoiceLinks } from "@/lib/hubspot/applyPaidLinks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Body = {
  scope: "building" | "project";
  ownerId: string;
  hubspotInvoiceId: string;
  /** Turn ids, "co:<id>" for a unit's change order or "month:<id>" for a
   * janitorial contract month (building), or
   * "sov:<id>" / "co:<id>" (project), each with its share of the invoice. Empty = drop the manual links and go back to
   * whatever the automatic match finds. */
  links: Array<{ targetId: string; amountCents: number }>;
  /** Project only, with no links: keep this invoice linked to nothing, so
   * the automatic match doesn't put it back on a line. */
  unlinked?: boolean;
};

/**
 * Replaces which units, unit change orders and janitorial contract months
 * (building) or SOV items / change orders (project) one HubSpot invoice is
 * linked to. One invoice can
 * cover several, but each SOV item or change order holds one invoice: linking
 * a line that's on another invoice moves it here. Saved links are marked manual so
 * the hourly sync never overwrites them. When the
 * invoice is paid and its share matches the line's value, the line is marked
 * Paid (see applyPaidInvoiceLinks).
 */
export async function PUT(req: Request) {
  const auth = await getErpAuth();
  if (!auth || !canSeeFinancials(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as Body;
  const links = Array.isArray(body.links) ? body.links : [];
  if (!body.ownerId || !body.hubspotInvoiceId || (body.scope !== "building" && body.scope !== "project")) {
    return NextResponse.json({ error: "scope, ownerId and hubspotInvoiceId are required" }, { status: 400 });
  }
  if (links.some((l) => !l.targetId || !Number.isInteger(l.amountCents) || l.amountCents < 0)) {
    return NextResponse.json({ error: "Each link needs a target and an amount of $0 or more" }, { status: 400 });
  }
  if (new Set(links.map((l) => l.targetId)).size !== links.length) {
    return NextResponse.json({ error: "Each item can only be picked once" }, { status: 400 });
  }

  const owner =
    body.scope === "building"
      ? await prisma.building.findUnique({ where: { id: body.ownerId }, select: { hubspotDealId: true } })
      : await prisma.project.findUnique({ where: { id: body.ownerId }, select: { hubspotDealId: true } });
  if (!owner?.hubspotDealId) return NextResponse.json({ error: "No HubSpot deal is linked here" }, { status: 400 });

  // Fresh read, which also proves the invoice is on this record's deal.
  const invoices = await fetchDealInvoices(owner.hubspotDealId);
  const invoice = invoices.find((i) => i.id === body.hubspotInvoiceId);
  if (!invoice) return NextResponse.json({ error: "That invoice isn't on this HubSpot deal" }, { status: 400 });

  const linkedByName = auth.email.split("@")[0] || auth.email;
  const snapshot = invoiceSnapshot(invoice);

  if (body.scope === "building") {
    const coLinks = links.filter((l) => l.targetId.startsWith("co:")).map((l) => ({ changeOrderId: l.targetId.slice(3), amountCents: l.amountCents }));
    const monthLinks = links.filter((l) => l.targetId.startsWith("month:")).map((l) => ({ periodId: l.targetId.slice(6), amountCents: l.amountCents }));
    const turnLinks = links.filter((l) => !l.targetId.startsWith("co:") && !l.targetId.startsWith("month:"));
    const unitProjects = unitChangeOrderProjects(body.ownerId);
    const [turns, changeOrders, monthCount] = await Promise.all([
      prisma.turnoverRequest.findMany({
        where: { id: { in: turnLinks.map((l) => l.targetId) }, buildingId: body.ownerId },
        select: { id: true, unitNumber: true },
      }),
      prisma.projectChangeOrder.findMany({
        where: { id: { in: coLinks.map((l) => l.changeOrderId) }, project: unitProjects },
        select: { id: true, projectId: true },
      }),
      prisma.recurringContractPeriod.count({ where: { id: { in: monthLinks.map((l) => l.periodId) }, recurringContract: { buildingId: body.ownerId } } }),
    ]);
    const turnById = new Map(turns.map((t) => [t.id, t]));
    const coProjectById = new Map(changeOrders.map((c) => [c.id, c.projectId]));
    if (turnLinks.some((l) => !turnById.get(l.targetId)?.unitNumber) || coLinks.some((l) => !coProjectById.has(l.changeOrderId)) || monthCount !== monthLinks.length) {
      return NextResponse.json({ error: "Every pick must be a unit, a unit change order or a contract month in this building" }, { status: 400 });
    }
    const units = turnLinks.map((l) => turnById.get(l.targetId)!.unitNumber!);
    if (new Set(units).size !== units.length) {
      return NextResponse.json({ error: "Pick one turn per unit on the same invoice" }, { status: 400 });
    }

    await prisma.$transaction([
      prisma.hubSpotUnitInvoice.deleteMany({ where: { buildingId: body.ownerId, hubspotInvoiceId: invoice.id } }),
      prisma.hubSpotSovInvoice.deleteMany({ where: { hubspotInvoiceId: invoice.id, project: unitProjects } }),
      // One invoice per change order: take these off any other invoice.
      prisma.hubSpotSovInvoice.deleteMany({ where: { changeOrderId: { in: coLinks.map((l) => l.changeOrderId) } } }),
      prisma.hubSpotSovInvoice.createMany({
        data: coLinks.map((l) => ({
          projectId: coProjectById.get(l.changeOrderId)!,
          hubspotInvoiceId: invoice.id,
          changeOrderId: l.changeOrderId,
          amountCents: l.amountCents,
          manual: true,
          linkedByName,
          ...snapshot,
        })),
      }),
      prisma.hubSpotContractInvoice.deleteMany({ where: { hubspotInvoiceId: invoice.id, ...contractMonthLinks(body.ownerId) } }),
      prisma.hubSpotContractInvoice.createMany({
        data: monthLinks.map((l) => ({ periodId: l.periodId, hubspotInvoiceId: invoice.id, amountCents: l.amountCents, linkedByName, ...snapshot })),
      }),
      prisma.hubSpotUnitInvoice.createMany({
        data: turnLinks.map((l) => ({
          buildingId: body.ownerId,
          hubspotInvoiceId: invoice.id,
          unitNumber: turnById.get(l.targetId)!.unitNumber!,
          turnoverRequestId: l.targetId,
          amountCents: l.amountCents,
          manual: true,
          linkedByName,
          ...snapshot,
        })),
      }),
    ]);
    if (links.length === 0) await syncBuildingUnitInvoices(body.ownerId, owner.hubspotDealId, invoices);
    await applyPaidInvoiceLinks({ buildingId: body.ownerId });
  } else {
    const parsed = links.map((l) => {
      const [kind, id] = l.targetId.split(":");
      return { ...l, sovItemId: kind === "sov" ? id : null, changeOrderId: kind === "co" ? id : null };
    });
    const [sovCount, coCount] = await Promise.all([
      prisma.projectSOVItem.count({ where: { id: { in: parsed.flatMap((p) => p.sovItemId ?? []) }, sov: { projectId: body.ownerId } } }),
      prisma.projectChangeOrder.count({ where: { id: { in: parsed.flatMap((p) => p.changeOrderId ?? []) }, projectId: body.ownerId } }),
    ]);
    if (parsed.some((p) => !p.sovItemId && !p.changeOrderId) || sovCount + coCount !== parsed.length) {
      return NextResponse.json({ error: "Every pick must be an SOV item or change order on this project" }, { status: 400 });
    }

    // A marker row with no line keeps an invoice deliberately unlinked.
    const rows = parsed.length > 0 ? parsed : body.unlinked === true ? [{ sovItemId: null, changeOrderId: null, amountCents: 0 }] : [];
    const sovIds = parsed.flatMap((p) => p.sovItemId ?? []);
    const coIds = parsed.flatMap((p) => p.changeOrderId ?? []);

    await prisma.$transaction([
      prisma.hubSpotSovInvoice.deleteMany({ where: { projectId: body.ownerId, hubspotInvoiceId: invoice.id } }),
      // One invoice per line: take these lines off any other invoice.
      prisma.hubSpotSovInvoice.deleteMany({
        where: { projectId: body.ownerId, OR: [{ sovItemId: { in: sovIds } }, { changeOrderId: { in: coIds } }] },
      }),
      prisma.hubSpotSovInvoice.createMany({
        data: rows.map((p) => ({
          projectId: body.ownerId,
          hubspotInvoiceId: invoice.id,
          sovItemId: p.sovItemId,
          changeOrderId: p.changeOrderId,
          amountCents: p.amountCents,
          manual: true,
          linkedByName,
          ...snapshot,
        })),
      }),
    ]);
    // Always re-run the automatic match: it fills in an invoice that was
    // reset, and re-places any invoice that just lost a line to this one.
    await syncProjectInvoices(body.ownerId, owner.hubspotDealId, invoices);
    await applyPaidInvoiceLinks({ projectId: body.ownerId });
  }

  return NextResponse.json({ ok: true });
}
