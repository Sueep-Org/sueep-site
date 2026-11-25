import { prisma } from "@/lib/prisma";
const WRITE = process.argv[2] === "write";
(async () => {
  const since = new Date("2026-11-25T05:00:00.000Z"); // midnight Eastern today
  const paidOn = new Date("2025-10-09T12:00:00.000Z");
  const b = await prisma.building.findMany({ where: { name: { contains: "Smith", mode: "insensitive" } }, select: { id: true, name: true } });
  console.log("buildings", b.map((x) => x.name));
  const bIds = b.map((x) => x.id);
  const projWhere = { OR: [{ buildingId: { in: bIds } }, { turnoverRequest: { buildingId: { in: bIds } } }] };
  const projects = await prisma.project.findMany({ where: { ...projWhere, billingCompletedAt: { gte: since } }, select: { id: true, jobTitle: true, billingStatus: true, billingCompletedAt: true, turnoverRequest: { select: { unitNumber: true } } } });
  const cos = await prisma.projectChangeOrder.findMany({ where: { project: projWhere, paidAt: { gte: since } }, select: { id: true, title: true, paidAt: true } as never });
  const sov = await prisma.projectSOVItem.findMany({ where: { sov: { project: projWhere }, paidAt: { gte: since } }, select: { id: true, description: true, paidAt: true } });
  const months = await prisma.recurringContractPeriod.findMany({ where: { recurringContract: { buildingId: { in: bIds } }, paidAt: { gte: since } }, select: { id: true, periodStart: true, paidAt: true } });
  console.log("projects/units", projects.length); for (const p of projects) console.log(" ", p.turnoverRequest?.unitNumber ?? p.jobTitle, p.billingStatus, p.billingCompletedAt?.toISOString());
  console.log("change orders", cos.length, JSON.stringify(cos));
  console.log("sov items", sov.length, JSON.stringify(sov));
  console.log("janitorial months", months.length, JSON.stringify(months));
  if (WRITE) {
    const r = await Promise.all([
      prisma.project.updateMany({ where: { id: { in: projects.map((p) => p.id) } }, data: { billingCompletedAt: paidOn } }),
      prisma.projectChangeOrder.updateMany({ where: { id: { in: cos.map((c: { id: string }) => c.id) } }, data: { paidAt: paidOn } }),
      prisma.projectSOVItem.updateMany({ where: { id: { in: sov.map((s) => s.id) } }, data: { paidAt: paidOn } }),
      prisma.recurringContractPeriod.updateMany({ where: { id: { in: months.map((m) => m.id) } }, data: { paidAt: paidOn } }),
    ]);
    console.log("updated", r.map((x) => x.count));
  }
  await prisma.$disconnect();
})();
