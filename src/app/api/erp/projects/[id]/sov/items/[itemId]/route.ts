import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notifyReadyToBill } from "@/lib/erp/notifyReadyToBill";
import { syncSovPercentDone, syncProjectBillingFromSOV, sovItemDateChanges, parseSovItemDate, sovItemLastWorkDay } from "@/lib/sovSync";
import { BILLING_STATUSES, voidReasonFor, type BillingStatus } from "@/lib/erp/billingStatus";

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
    const val = String(body.billingStatus);
    if (!(BILLING_STATUSES as readonly string[]).includes(val)) return NextResponse.json({ error: "Invalid billingStatus" }, { status: 400 });
    const v = voidReasonFor(val as BillingStatus, body.voidReason);
    if ("error" in v) return NextResponse.json({ error: v.error }, { status: 400 });
    data.billingStatus = val;
    data.voidReason = v.voidReason;
  }
  // Ticked done with no date typed: date it the last day the work was done,
  // not the day someone ticked the box.
  let typedCompletedAt = parseSovItemDate(body.completedAt);
  if (!typedCompletedAt && data.completed === true && !existing.completed) {
    typedCompletedAt = await sovItemLastWorkDay(itemId);
  }
  Object.assign(
    data,
    sovItemDateChanges(
      existing,
      {
        completed: (data.completed as boolean | undefined) ?? existing.completed,
        billingStatus: (data.billingStatus as string | undefined) ?? existing.billingStatus,
      },
      { completedAt: typedCompletedAt, paidAt: parseSovItemDate(body.paidAt) },
    ),
  );

  const updated = await prisma.projectSOVItem.update({ where: { id: itemId }, data: data as object });
  // Always resync both — editing scheduledValueCents changes the SOV total
  // (and therefore the correct percentInvoiced) even when billingStatus
  // itself isn't part of this request.
  await syncSovPercentDone(id);
  await syncProjectBillingFromSOV(id);
  if (updated.completed && !existing.completed && updated.billingStatus === "NOT_BILLED") {
    await notifyReadyToBill(id, [{ kind: "SOV line", title: updated.description, amountCents: updated.scheduledValueCents }]);
  }
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
