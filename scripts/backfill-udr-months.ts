/**
 * One-off (2026-11-03): add the three UDR janitorial contracts' months from
 * May 2025 to July 2026 as Paid, each linked to its paid HubSpot invoice, and
 * link the existing Aug and Sep 2026 months to theirs. Amounts and paid dates
 * come from the invoices. Dry run by default; pass --apply to write.
 *
 *   npx tsx --env-file=.env.local scripts/backfill-udr-months.ts [--apply]
 */
import { prisma } from "@/lib/prisma";
import { batchRead } from "@/lib/hubspot/dealDocuments";

const APPLY = process.argv.includes("--apply");
const FIRST = "2025-05";
const LAST_NEW = "2026-07";
const LAST_LINK = "2026-09";
const BUILDINGS = [
  { name: "UDR- The Smith (KOP)", text: "recurring cleaning the smith" },
  { name: "UDR- The George", text: "recurring cleaning the george" },
  { name: "UDR- Park Square", text: "recurring cleaning park square" },
];

function months(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split("-").map(Number) as [number, number];
  for (;;) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    out.push(key);
    if (key === to) return out;
    m += 1;
    if (m === 13) {
      m = 1;
      y += 1;
    }
  }
}
const toDate = (s: string | null | undefined) => (s ? new Date(s) : null);
const toCents = (s: string | null | undefined) => (s == null || s === "" ? null : Math.round(Number(s) * 100));
/** HubSpot's paid timestamp as that Eastern day at UTC midnight, like a picked date. */
const paidDay = (s: string | null | undefined) =>
  s ? new Date(`${new Date(s).toLocaleDateString("en-CA", { timeZone: "America/New_York" })}T00:00:00.000Z`) : null;

(async () => {
  const contracts = await prisma.recurringContract.findMany({
    where: { building: { name: { in: BUILDINGS.map((b) => b.name) } } },
    select: { id: true, building: { select: { id: true, name: true } }, periods: { select: { id: true, periodStart: true, _count: { select: { hubspotInvoices: true } } } } },
  });
  if (contracts.length !== 3) throw new Error(`Expected 3 UDR contracts, found ${contracts.length}`);

  const matches = await prisma.hubSpotInvoiceLineItemMatch.findMany({
    where: { OR: BUILDINGS.map((b) => ({ lineItemText: { startsWith: b.text } })) },
    select: { hubspotInvoiceId: true, lineItemText: true },
  });
  const ids = [...new Set(matches.map((m) => m.hubspotInvoiceId))];
  const props = ["hs_number", "hs_invoice_status", "hs_invoice_date", "hs_due_date", "hs_payment_date", "hs_amount_billed", "hs_balance_due", "hs_invoice_link", "hs_pdf_download_link"];
  const invoices = new Map((await batchRead("invoices", ids, props)).map((r) => [r.id, r.properties]));

  const plan: { building: string; month: string; number: string; cents: number; paid: string; create: boolean; periodId?: string; contractId: string; hubspotId: string }[] = [];
  const allMonths = months(FIRST, LAST_LINK);
  for (const b of BUILDINGS) {
    const c = contracts.find((x) => x.building.name === b.name)!;
    // One recurring invoice per month, in date order from May 2025 (April's went out Apr 2).
    const mine = [...new Set(matches.filter((m) => m.lineItemText.startsWith(b.text)).map((m) => m.hubspotInvoiceId))]
      .map((id) => ({ id, p: invoices.get(id)! }))
      .filter((x) => x.p && (x.p.hs_invoice_date ?? "") >= "2025-04-25" && (x.p.hs_invoice_date ?? "") < "2026-09-25")
      .sort((x, y) => (x.p.hs_invoice_date ?? "").localeCompare(y.p.hs_invoice_date ?? ""));
    if (mine.length !== allMonths.length) throw new Error(`${b.name}: ${mine.length} invoices for ${allMonths.length} months`);
    allMonths.forEach((month, i) => {
      const inv = mine[i]!;
      // Each invoice must be dated within a week before to three weeks into its month.
      const start = Date.parse(`${month}-01T00:00:00Z`);
      const dated = Date.parse(inv.p.hs_invoice_date!);
      if (dated < start - 7 * 86_400_000 || dated > start + 21 * 86_400_000) throw new Error(`${b.name} ${month}: ${inv.p.hs_number} is dated ${inv.p.hs_invoice_date}`);
      if (inv.p.hs_invoice_status !== "paid") throw new Error(`${b.name} ${month}: ${inv.p.hs_number} is ${inv.p.hs_invoice_status}`);
      const existing = c.periods.find((p) => p.periodStart.toISOString().slice(0, 7) === month);
      if (month <= LAST_NEW && existing) throw new Error(`${b.name} ${month} already exists`);
      if (existing && existing._count.hubspotInvoices > 0) return;
      plan.push({
        building: b.name,
        month,
        number: inv.p.hs_number ?? "?",
        cents: toCents(inv.p.hs_amount_billed) ?? 0,
        paid: (inv.p.hs_payment_date ?? "").slice(0, 10),
        create: month <= LAST_NEW,
        periodId: existing?.id,
        contractId: c.id,
        hubspotId: inv.id,
      });
    });
  }

  for (const p of plan) console.log(`${p.create ? "CREATE" : "LINK  "} ${p.building.padEnd(22)} ${p.month} ${p.number} $${(p.cents / 100).toLocaleString()} paid ${p.paid}`);
  console.log(`${plan.filter((p) => p.create).length} months to create, ${plan.filter((p) => !p.create).length} existing months to link. ${APPLY ? "Applying..." : "Dry run, nothing written. Pass --apply to write."}`);
  if (!APPLY) return prisma.$disconnect();

  const created: string[] = [];
  await prisma.$transaction(async (tx) => {
    for (const p of plan) {
      const inv = invoices.get(p.hubspotId)!;
      const periodId =
        p.periodId ??
        (
          await tx.recurringContractPeriod.create({
            data: { recurringContractId: p.contractId, periodStart: new Date(`${p.month}-01T00:00:00.000Z`), amountCents: p.cents, billingStatus: "PAID", paidAt: paidDay(inv.hs_payment_date) },
            select: { id: true },
          })
        ).id;
      if (!p.periodId) created.push(periodId);
      await tx.hubSpotContractInvoice.create({
        data: {
          periodId,
          hubspotInvoiceId: p.hubspotId,
          amountCents: p.cents,
          linkedByName: "UDR backfill",
          invoiceNumber: inv.hs_number ?? null,
          status: inv.hs_invoice_status ?? null,
          invoiceDate: toDate(inv.hs_invoice_date),
          dueDate: toDate(inv.hs_due_date),
          paidDate: toDate(inv.hs_payment_date),
          invoiceTotalCents: toCents(inv.hs_amount_billed),
          balanceDueCents: toCents(inv.hs_balance_due),
          viewUrl: inv.hs_invoice_link ?? null,
          pdfUrl: inv.hs_pdf_download_link ?? null,
          paidAppliedAt: new Date(),
        },
      });
    }
  });
  console.log(`Done. Created ${created.length} months. To undo: delete RecurringContractPeriod ids ${JSON.stringify(created)} and HubSpotContractInvoice rows with linkedByName "UDR backfill".`);
  await prisma.$disconnect();
})();
