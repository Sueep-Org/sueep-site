import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth } from "@/lib/erpAuth";
import { syncSovPercentDone, syncProjectBillingFromSOV, syncProjectBillingFromRequest } from "@/lib/sovSync";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;

  const auth = await getErpAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const row = await prisma.hubSpotInvoiceLineItemMatch.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (row.status !== "PENDING_REVIEW") {
    return NextResponse.json({ error: "This item has already been resolved" }, { status: 400 });
  }

  const erpUser = await prisma.erpUser.findUnique({ where: { firebaseUid: auth.uid }, select: { id: true } });
  const resolvedByUserId = erpUser?.id ?? null;
  const resolvedByName = auth.email.split("@")[0] || auth.email;

  if (body.action === "ignore") {
    await prisma.hubSpotInvoiceLineItemMatch.update({
      where: { id },
      data: { status: "IGNORED", resolvedAt: new Date(), resolvedByUserId, resolvedByName },
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action !== "resolve") {
    return NextResponse.json({ error: "action must be 'resolve' or 'ignore'" }, { status: 400 });
  }

  // A human explicitly confirming a match is the resolution itself — unlike
  // the automated path, this doesn't re-run the amount-reconciliation gate,
  // since forcing that here would just block legitimate manual overrides
  // (price adjustments, partial-payment judgment calls) that a human is
  // specifically here to make.
  const createAlias = body.createAlias !== false;

  if (row.projectId) {
    const sovItemId = typeof body.sovItemId === "string" ? body.sovItemId : null;
    if (!sovItemId) return NextResponse.json({ error: "sovItemId is required" }, { status: 400 });

    const sovItem = await prisma.projectSOVItem.findFirst({ where: { id: sovItemId, sov: { projectId: row.projectId } } });
    if (!sovItem) return NextResponse.json({ error: "SOV item not found on this project" }, { status: 404 });

    if (sovItem.billingStatus !== "PAID") {
      await prisma.projectSOVItem.update({ where: { id: sovItemId }, data: { billingStatus: "PAID" } });
      await syncSovPercentDone(row.projectId);
      await syncProjectBillingFromSOV(row.projectId);
    }

    if (createAlias) {
      await prisma.hubSpotSovAlias.upsert({
        where: { projectId_hubspotText: { projectId: row.projectId, hubspotText: row.lineItemText } },
        create: {
          projectId: row.projectId,
          sovItemId,
          hubspotText: row.lineItemText,
          createdByUserId: resolvedByUserId,
          createdByName: resolvedByName,
        },
        update: { sovItemId, active: true, createdByUserId: resolvedByUserId, createdByName: resolvedByName },
      });
    }

    await prisma.hubSpotInvoiceLineItemMatch.update({
      where: { id },
      data: {
        status: "RESOLVED",
        matchedSovItemId: sovItemId,
        matchMethod: "HUMAN",
        resolvedAt: new Date(),
        resolvedByUserId,
        resolvedByName,
        createAlias,
      },
    });
    return NextResponse.json({ ok: true });
  }

  if (row.buildingId) {
    const turnoverRequestId = typeof body.turnoverRequestId === "string" ? body.turnoverRequestId : null;
    if (!turnoverRequestId) return NextResponse.json({ error: "turnoverRequestId is required" }, { status: 400 });

    const tr = await prisma.turnoverRequest.findFirst({ where: { id: turnoverRequestId, buildingId: row.buildingId } });
    if (!tr) return NextResponse.json({ error: "Turnover request not found in this building" }, { status: 404 });

    if (tr.billingStatus !== "PAID") {
      await prisma.turnoverRequest.update({ where: { id: turnoverRequestId }, data: { billingStatus: "PAID" } });
      await syncProjectBillingFromRequest(turnoverRequestId, "PAID");
    }

    if (createAlias && tr.unitNumber) {
      await prisma.hubSpotUnitAlias.upsert({
        where: { buildingId_hubspotText: { buildingId: row.buildingId, hubspotText: row.lineItemText } },
        create: {
          buildingId: row.buildingId,
          unitNumber: tr.unitNumber,
          hubspotText: row.lineItemText,
          createdByUserId: resolvedByUserId,
          createdByName: resolvedByName,
        },
        update: { unitNumber: tr.unitNumber, active: true, createdByUserId: resolvedByUserId, createdByName: resolvedByName },
      });
    }

    await prisma.hubSpotInvoiceLineItemMatch.update({
      where: { id },
      data: {
        status: "RESOLVED",
        matchedTurnoverRequestId: turnoverRequestId,
        matchedUnitNumber: tr.unitNumber,
        matchMethod: "HUMAN",
        resolvedAt: new Date(),
        resolvedByUserId,
        resolvedByName,
        createAlias,
      },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "This line item has neither a project nor a building scope" }, { status: 400 });
}
