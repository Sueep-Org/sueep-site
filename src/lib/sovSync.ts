import { prisma } from "./prisma";

function mapBillingToProject(status: string): { billingStatus: string | null; percentInvoiced: number } {
  if (status === "PAID")   return { billingStatus: "INVOICE_PAID", percentInvoiced: 100 };
  if (status === "BILLED") return { billingStatus: "BILLING",      percentInvoiced: 100 };
  return { billingStatus: null, percentInvoiced: 0 };
}

/**
 * Called after a TurnoverRequest billing status changes.
 * Projects link TO the request (Project.turnoverRequestId), so we updateMany on that relation.
 */
export async function syncProjectBillingFromRequest(turnoverRequestId: string, billingStatus: string) {
  const data = mapBillingToProject(billingStatus);
  await prisma.project.updateMany({ where: { turnoverRequestId }, data });
}

/**
 * Called after a SOV item billing status changes.
 * Looks at all items for the project and derives the aggregate status.
 */
export async function syncProjectBillingFromSOV(projectId: string) {
  const sov = await prisma.projectSOV.findUnique({
    where: { projectId },
    include: { items: { select: { billingStatus: true, scheduledValueCents: true } } },
  });
  if (!sov || sov.items.length === 0) return;

  const items = sov.items;
  const anyActive = items.some((i) => i.billingStatus === "BILLED" || i.billingStatus === "PAID");
  if (!anyActive) {
    await prisma.project.update({ where: { id: projectId }, data: { billingStatus: null, percentInvoiced: 0 } });
    return;
  }

  const allPaid = items.every((i) => i.billingStatus === "PAID");
  const total = items.reduce((s, i) => s + i.scheduledValueCents, 0);
  const activeTotal = items
    .filter((i) => i.billingStatus === "BILLED" || i.billingStatus === "PAID")
    .reduce((s, i) => s + i.scheduledValueCents, 0);

  await prisma.project.update({
    where: { id: projectId },
    data: {
      billingStatus: allPaid ? "INVOICE_PAID" : "BILLING",
      percentInvoiced: total > 0 ? Math.round((activeTotal / total) * 100) : 100,
    },
  });
}

export async function syncSovPercentDone(projectId: string) {
  const sov = await prisma.projectSOV.findUnique({
    where: { projectId },
    include: { items: { select: { scheduledValueCents: true, completed: true } } },
  });
  if (!sov || sov.items.length === 0) return;

  const total = sov.items.reduce((s, i) => s + i.scheduledValueCents, 0);
  if (total === 0) return;

  const completedTotal = sov.items
    .filter((i) => i.completed)
    .reduce((s, i) => s + i.scheduledValueCents, 0);

  const percentDone = Math.round((completedTotal / total) * 1000) / 10;

  await prisma.project.update({ where: { id: projectId }, data: { percentDone } });
}
