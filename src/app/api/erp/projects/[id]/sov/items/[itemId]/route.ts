import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncSovPercentDone, syncProjectBillingFromSOV } from "@/lib/sovSync";

type Ctx = { params: Promise<{ id: string; itemId: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const { id, itemId } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const existing = await prisma.projectSOVItem.findFirst({
    where: { id: itemId, sov: { projectId: id } },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (body.description !== undefined) {
    const description = String(body.description).trim();
    if (!description) return NextResponse.json({ error: "description is required" }, { status: 400 });
    data.description = description;
  }
  if (body.scheduledValueCents !== undefined) {
    data.scheduledValueCents = Math.max(0, Math.round(Number(body.scheduledValueCents) || 0));
  }
  if (body.completed !== undefined) data.completed = Boolean(body.completed);
  if (body.billingStatus !== undefined) {
    const VALID_BILLING = ["NOT_BILLED", "BILLED", "PAID"];
    const val = String(body.billingStatus);
    if (!VALID_BILLING.includes(val)) return NextResponse.json({ error: "Invalid billingStatus" }, { status: 400 });
    data.billingStatus = val;
  }

  const updated = await prisma.projectSOVItem.update({ where: { id: itemId }, data: data as object });
  // Always resync both — editing scheduledValueCents changes the SOV total
  // (and therefore the correct percentInvoiced) even when billingStatus
  // itself isn't part of this request.
  await syncSovPercentDone(id);
  await syncProjectBillingFromSOV(id);
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id, itemId } = await ctx.params;

  const existing = await prisma.projectSOVItem.findFirst({
    where: { id: itemId, sov: { projectId: id } },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.projectSOVItem.delete({ where: { id: itemId } });
  // Deleting an item changes the SOV total the same way adding one does.
  await syncSovPercentDone(id);
  await syncProjectBillingFromSOV(id);
  return NextResponse.json({ ok: true });
}
