/**
 * One-off (2026-11-03): mark every UDR Park Square month in 2024 and 2025
 * Paid. Each one left is linked to a paid HubSpot invoice: it takes that
 * invoice's paid date, and its amount when they differ (months added by hand
 * started at today's $9,800; the 2024-25 invoices were $9,000). Dry run by
 * default; pass --apply to write.
 *
 *   npx tsx scripts/mark-park-square-paid.ts [--apply]
 */
import { prisma } from "@/lib/prisma";

const APPLY = process.argv.includes("--apply");

(async () => {
  const periods = await prisma.recurringContractPeriod.findMany({
    where: {
      recurringContract: { building: { name: "UDR- Park Square" } },
      periodStart: { gte: new Date("2024-01-01T00:00:00Z"), lt: new Date("2026-01-01T00:00:00Z") },
      billingStatus: { not: "PAID" },
    },
    orderBy: { periodStart: "asc" },
    select: { id: true, periodStart: true, amountCents: true, billingStatus: true, hubspotInvoices: { select: { invoiceNumber: true, status: true, paidDate: true, invoiceTotalCents: true } } },
  });
  const plan = periods.map((p) => {
    const paid = p.hubspotInvoices.filter((i) => i.status === "paid");
    if (paid.length !== 1) throw new Error(`${p.periodStart.toISOString().slice(0, 7)} has ${paid.length} paid invoices`);
    const inv = paid[0]!;
    return { p, inv, amountCents: inv.invoiceTotalCents ?? p.amountCents };
  });
  for (const { p, inv, amountCents } of plan) {
    console.log(`${p.periodStart.toISOString().slice(0, 7)} ${p.billingStatus} -> PAID ${inv.paidDate?.toISOString().slice(0, 10)} via ${inv.invoiceNumber}; amount $${p.amountCents / 100} -> $${amountCents / 100}`);
  }
  console.log(`${plan.length} months. ${APPLY ? "Applying..." : "Dry run, nothing written. Pass --apply to write."}`);
  if (APPLY && plan.length) {
    await prisma.$transaction(
      plan.map(({ p, inv, amountCents }) =>
        prisma.recurringContractPeriod.update({
          where: { id: p.id },
          data: {
            billingStatus: "PAID",
            amountCents,
            paidAt: inv.paidDate ? new Date(`${inv.paidDate.toLocaleDateString("en-CA", { timeZone: "America/New_York" })}T00:00:00.000Z`) : null,
          },
        }),
      ),
    );
    console.log(`Done. Undo: set these back to ${JSON.stringify(plan.map(({ p }) => ({ id: p.id, billingStatus: p.billingStatus, amountCents: p.amountCents })))} with paidAt null.`);
  }
  await prisma.$disconnect();
})();
