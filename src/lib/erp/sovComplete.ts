import { prisma } from "@/lib/prisma";
import { notifyReadyToBill } from "@/lib/erp/notifyReadyToBill";
import { syncSovPercentDone, syncProjectBillingFromSOV, sovItemDateChanges } from "@/lib/sovSync";

/**
 * Mark a project's SOV lines complete, dated `completedAt` (e.g. the schedule
 * day they were finished on). Same rules as ticking one on the project's
 * Financials tab (sov/items/[itemId] PATCH): completedAt set, percent done
 * and billing resynced, one "ready to bill" email for lines not yet billed.
 * Lines already complete, or not on this project, are skipped.
 * Returns the descriptions of the lines it marked.
 */
export async function markSovItemsComplete(projectId: string, itemIds: string[], completedAt: Date): Promise<string[]> {
  if (itemIds.length === 0) return [];
  const items = await prisma.projectSOVItem.findMany({
    where: { id: { in: itemIds }, completed: false, sov: { projectId } },
  });
  if (items.length === 0) return [];
  for (const item of items) {
    const dates = sovItemDateChanges(
      { completed: false, billingStatus: item.billingStatus },
      { completed: true, billingStatus: item.billingStatus },
      { completedAt, paidAt: null },
    );
    await prisma.projectSOVItem.update({ where: { id: item.id }, data: { completed: true, ...dates } });
  }
  await syncSovPercentDone(projectId);
  await syncProjectBillingFromSOV(projectId);
  const toBill = items.filter((i) => i.billingStatus === "NOT_BILLED");
  if (toBill.length) {
    await notifyReadyToBill(
      projectId,
      toBill.map((i) => ({ kind: "SOV line", title: i.description, amountCents: i.scheduledValueCents })),
    );
  }
  return items.map((i) => i.description);
}
