import { prisma } from "./prisma";

// Billed and paid are distinct — a request can be fully invoiced (BILLED)
// without the client having actually paid yet. Only PAID counts as paid for
// commission purposes.
function mapBillingToProject(status: string): { billingStatus: string | null; percentInvoiced: number } {
  if (status === "PAID") return { billingStatus: "INVOICE_PAID", percentInvoiced: 100 };
  if (status === "BILLED") return { billingStatus: "BILLING", percentInvoiced: 100 };
  return { billingStatus: null, percentInvoiced: 0 };
}

/**
 * Called after a TurnoverRequest billing status changes.
 * Projects link TO the request (Project.turnoverRequestId) — usually just
 * one, but looped individually (rather than updateMany) so each project's
 * own current billingCompletedAt can be checked before stamping it.
 */
export async function syncProjectBillingFromRequest(turnoverRequestId: string, billingStatus: string) {
  const data = mapBillingToProject(billingStatus);
  const projects = await prisma.project.findMany({
    where: { turnoverRequestId },
    select: { id: true, billingCompletedAt: true },
  });
  await Promise.all(
    projects.map((p) =>
      prisma.project.update({
        where: { id: p.id },
        data: {
          ...data,
          ...(data.billingStatus === "INVOICE_PAID" && !p.billingCompletedAt ? { billingCompletedAt: new Date() } : {}),
        },
      })
    )
  );
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

  // percentInvoiced = how much of the SOV is billed out (BILLED or PAID
  // items) — matches "percent invoiced is based on percent of SOVs marked
  // billed". Being paid is a stricter, separate condition: every item must
  // individually be PAID, not merely billed.
  const allPaid = items.every((i) => i.billingStatus === "PAID");
  const total = items.reduce((s, i) => s + i.scheduledValueCents, 0);
  const activeTotal = items
    .filter((i) => i.billingStatus === "BILLED" || i.billingStatus === "PAID")
    .reduce((s, i) => s + i.scheduledValueCents, 0);
  const percentInvoiced = total > 0 ? Math.round((activeTotal / total) * 100) : 100;

  const current = await prisma.project.findUnique({ where: { id: projectId }, select: { billingCompletedAt: true } });

  await prisma.project.update({
    where: { id: projectId },
    data: {
      billingStatus: allPaid ? "INVOICE_PAID" : "BILLING",
      percentInvoiced,
      ...(allPaid && !current?.billingCompletedAt ? { billingCompletedAt: new Date() } : {}),
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
