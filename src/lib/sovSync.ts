import { prisma } from "./prisma";

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
