/**
 * One-off (2026-11-03): give UDR The George and The Smith the same extra
 * months the user added by hand to Park Square (Apr-Aug 2024, Apr 2025), Paid,
 * each linked to its paid HubSpot invoice with that invoice's amount and paid
 * date. The two May 2, 2024 invoices per building split like Park Square's:
 * the higher number is April. Dry run by default; pass --apply to write.
 *
 *   npx tsx --env-file=.env.local scripts/backfill-udr-2024-months.ts [--apply]
 */
import { prisma } from "@/lib/prisma";
import { batchRead } from "@/lib/hubspot/dealDocuments";

const APPLY = process.argv.includes("--apply");
const PLAN: Record<string, { text: string; invoices: Record<string, string> }> = {
  "UDR- The George": {
    text: "recurring cleaning the george",
    invoices: { "2024-04": "INV-1010", "2024-05": "INV-1005", "2024-06": "INV-1018", "2024-07": "INV-1023", "2024-08": "INV-1029", "2025-04": "INV-1109" },
  },
  "UDR- The Smith (KOP)": {
    text: "recurring cleaning the smith",
    invoices: { "2024-04": "INV-1009", "2024-05": "INV-1006", "2024-06": "INV-1019", "2024-07": "INV-1022", "2024-08": "INV-1027", "2025-04": "INV-1108" },
  },
};

const toDate = (s: string | null | undefined) => (s ? new Date(s) : null);
const toCents = (s: string | null | undefined) => (s == null || s === "" ? null : Math.round(Number(s) * 100));
const paidDay = (s: string | null | undefined) =>
  s ? new Date(`${new Date(s).toLocaleDateString("en-CA", { timeZone: "America/New_York" })}T00:00:00.000Z`) : null;

(async () => {
  const props = ["hs_number", "hs_invoice_status", "hs_invoice_date", "hs_due_date", "hs_payment_date", "hs_amount_billed", "hs_balance_due", "hs_invoice_link", "hs_pdf_download_link"];
  type Step = { contractId: string; building: string; month: string; id: string; p: Record<string, string | null> };
  const steps: Step[] = [];
  for (const [building, { text, invoices }] of Object.entries(PLAN)) {
    const contract = await prisma.recurringContract.findFirstOrThrow({ where: { building: { name: building } }, select: { id: true, periods: { select: { periodStart: true } } } });
    const have = new Set(contract.periods.map((p) => p.periodStart.toISOString().slice(0, 7)));
    const matches = await prisma.hubSpotInvoiceLineItemMatch.findMany({ where: { lineItemText: { startsWith: text } }, select: { hubspotInvoiceId: true } });
    const records = await batchRead("invoices", [...new Set(matches.map((m) => m.hubspotInvoiceId))], props);
    const byNumber = new Map(records.map((r) => [r.properties.hs_number, r]));
    for (const [month, number] of Object.entries(invoices)) {
      if (have.has(month)) throw new Error(`${building} ${month} already exists`);
      const rec = byNumber.get(number);
      // Found by this building's line text, so it's this building's invoice.
      if (!rec) throw new Error(`${building}: ${number} not found among its invoices`);
      if (rec.properties.hs_invoice_status !== "paid") throw new Error(`${number} is ${rec.properties.hs_invoice_status}`);
      steps.push({ contractId: contract.id, building, month, id: rec.id, p: rec.properties });
    }
  }
  for (const s of steps) console.log(`CREATE ${s.building.padEnd(22)} ${s.month} $${Number(s.p.hs_amount_billed).toLocaleString()} Paid ${s.p.hs_payment_date?.slice(0, 10)} via ${s.p.hs_number}`);
  console.log(`${steps.length} months. ${APPLY ? "Applying..." : "Dry run, nothing written. Pass --apply to write."}`);
  if (!APPLY) return prisma.$disconnect();

  const created: string[] = [];
  await prisma.$transaction(async (tx) => {
    for (const { contractId, month, id, p } of steps) {
      const cents = toCents(p.hs_amount_billed)!;
      const period = await tx.recurringContractPeriod.create({
        data: { recurringContractId: contractId, periodStart: new Date(`${month}-01T00:00:00.000Z`), amountCents: cents, billingStatus: "PAID", paidAt: paidDay(p.hs_payment_date) },
        select: { id: true },
      });
      created.push(period.id);
      await tx.hubSpotContractInvoice.create({
        data: {
          periodId: period.id,
          hubspotInvoiceId: id,
          amountCents: cents,
          linkedByName: "UDR backfill",
          invoiceNumber: p.hs_number ?? null,
          status: p.hs_invoice_status ?? null,
          invoiceDate: toDate(p.hs_invoice_date),
          dueDate: toDate(p.hs_due_date),
          paidDate: toDate(p.hs_payment_date),
          invoiceTotalCents: cents,
          balanceDueCents: toCents(p.hs_balance_due),
          viewUrl: p.hs_invoice_link ?? null,
          pdfUrl: p.hs_pdf_download_link ?? null,
          paidAppliedAt: new Date(),
        },
      });
    }
  });
  console.log(`Done. To undo: delete RecurringContractPeriod ids ${JSON.stringify(created)} (their links go with them).`);
  await prisma.$disconnect();
})();
