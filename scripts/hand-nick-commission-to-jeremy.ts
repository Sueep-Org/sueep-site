/**
 * One-off (2026-11-25): Nick Wehr's commission work moves to Jeremy Curry
 * from now on, without Jeremy picking up any of Nick's past commission.
 *
 * - Projects that resolve to Nick: completed (or already customer-paid) ones
 *   are pinned to Nick explicitly, so nothing later (HubSpot owner, creator)
 *   can shift them. Everything still open or upcoming moves to Jeremy.
 * - Buildings with Nick as owner move to Jeremy, so new unit turns go to him.
 * - Recurring contracts with Nick: every month before Dec 2026 is pinned to
 *   Nick per month, and the contract itself moves to Jeremy (Dec 2026 on).
 * - Commission payouts already recorded are left alone.
 *
 * Dry run by default; pass --apply to write.
 *
 *   npx tsx scripts/hand-nick-commission-to-jeremy.ts [--apply]
 */
import { prisma } from "@/lib/prisma";
import { resolveCommissionEmployeeId } from "@/lib/erp/commission";
import { isPaidStatus } from "@/lib/erp/billingStatus";

const APPLY = process.argv.includes("--apply");
const NICK_EMAIL = "nick@sueep.com";
const JEREMY_EMAIL = "jeremy@sueep.com";
const RECURRING_HANDOVER = new Date("2026-12-01T00:00:00Z");

(async () => {
  const [nick, jeremy] = await Promise.all(
    [NICK_EMAIL, JEREMY_EMAIL].map((email) => prisma.employee.findFirstOrThrow({ where: { email } }))
  );
  if (!jeremy.commissionEligible) throw new Error("Jeremy isn't ticked Eligible for commission");

  const eligible = await prisma.employee.findMany({
    where: { commissionEligible: true },
    select: { id: true, email: true, firstName: true, lastName: true },
  });
  const projects = await prisma.project.findMany({
    select: {
      id: true,
      jobTitle: true,
      status: true,
      billingStatus: true,
      commissionEmployeeId: true,
      hubspotOwnerEmail: true,
      hubspotOwnerName: true,
      createdByEmployeeId: true,
    },
  });
  const nicks = projects.filter((p) => resolveCommissionEmployeeId(p, eligible) === nick.id);
  const keep = nicks.filter((p) => p.status === "COMPLETE" || isPaidStatus(p.billingStatus));
  const move = nicks.filter((p) => !keep.includes(p));
  const pin = keep.filter((p) => p.commissionEmployeeId !== nick.id);

  const buildings = await prisma.building.findMany({ where: { commissionEmployeeId: nick.id }, select: { id: true, name: true } });
  const contracts = await prisma.recurringContract.findMany({
    where: { commissionEmployeeId: nick.id },
    select: {
      id: true,
      building: { select: { name: true } },
      periods: { where: { periodStart: { lt: RECURRING_HANDOVER } }, select: { id: true, periodStart: true } },
    },
  });

  console.log(`Projects resolving to Nick: ${nicks.length}`);
  console.log(`  stay Nick (completed or paid): ${keep.length}, ${pin.length} of them pinned to Nick now`);
  console.log(`  move to Jeremy (open/upcoming): ${move.length}`);
  for (const p of move) console.log(`    - ${p.jobTitle} [${p.status}/${p.billingStatus ?? "-"}]`);
  console.log(`Buildings to Jeremy: ${buildings.map((b) => b.name).join(", ") || "none"}`);
  for (const c of contracts) {
    console.log(
      `Contract ${c.building.name} to Jeremy from Dec 2026; Nick kept on ${c.periods
        .map((p) => p.periodStart.toISOString().slice(0, 7))
        .join(", ")}`
    );
  }
  console.log(APPLY ? "Applying..." : "Dry run, nothing written. Pass --apply to write.");
  if (!APPLY) process.exit(0);

  await prisma.$transaction([
    prisma.project.updateMany({ where: { id: { in: pin.map((p) => p.id) } }, data: { commissionEmployeeId: nick.id } }),
    prisma.project.updateMany({ where: { id: { in: move.map((p) => p.id) } }, data: { commissionEmployeeId: jeremy.id } }),
    prisma.building.updateMany({ where: { id: { in: buildings.map((b) => b.id) } }, data: { commissionEmployeeId: jeremy.id } }),
    prisma.recurringContractPeriod.updateMany({
      where: { id: { in: contracts.flatMap((c) => c.periods.map((p) => p.id)) } },
      data: { commissionEmployeeId: nick.id },
    }),
    prisma.recurringContract.updateMany({ where: { id: { in: contracts.map((c) => c.id) } }, data: { commissionEmployeeId: jeremy.id } }),
  ]);
  console.log("Done.");
  process.exit(0);
})();
