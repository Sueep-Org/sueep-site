import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canSeeFinancials } from "@/lib/erpAuth";
import { fetchDealInvoices } from "@/lib/hubspot/dealDocuments";
import { invoiceSnapshot, syncBuildingUnitInvoices } from "@/lib/hubspot/syncUnitInvoices";
import { syncProjectInvoices } from "@/lib/hubspot/syncProjectInvoices";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Body = {
  scope: "building" | "project";
  ownerId: string;
  hubspotInvoiceId: string;
  /** Turn ids (building) or "sov:<id>" / "co:<id>" (project), each with its
   * share of the invoice. Empty = drop the manual links and go back to
   * whatever the automatic match finds. */
  links: Array<{ targetId: string; amountCents: number }>;
};

/**
 * Replaces which units (building) or SOV items / change orders (project) one
 * HubSpot invoice is linked to. One invoice can cover several. Saved links
 * are marked manual so the hourly sync never overwrites them. Display-only:
 * billing status is not changed.
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
    const turns = await prisma.turnoverRequest.findMany({
      where: { id: { in: links.map((l) => l.targetId) }, buildingId: body.ownerId },
      select: { id: true, unitNumber: true },
    });
    const turnById = new Map(turns.map((t) => [t.id, t]));
    if (links.some((l) => !turnById.get(l.targetId)?.unitNumber)) {
      return NextResponse.json({ error: "Every pick must be a unit in this building" }, { status: 400 });
    }
    const units = links.map((l) => turnById.get(l.targetId)!.unitNumber!);
    if (new Set(units).size !== units.length) {
      return NextResponse.json({ error: "Pick one turn per unit on the same invoice" }, { status: 400 });
    }

    await prisma.$transaction([
      prisma.hubSpotUnitInvoice.deleteMany({ where: { buildingId: body.ownerId, hubspotInvoiceId: invoice.id } }),
      prisma.hubSpotUnitInvoice.createMany({
        data: links.map((l) => ({
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

    await prisma.$transaction([
      prisma.hubSpotSovInvoice.deleteMany({ where: { projectId: body.ownerId, hubspotInvoiceId: invoice.id } }),
      prisma.hubSpotSovInvoice.createMany({
        data: parsed.map((p) => ({
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
    if (links.length === 0) await syncProjectInvoices(body.ownerId, owner.hubspotDealId, invoices);
  }

  return NextResponse.json({ ok: true });
}
