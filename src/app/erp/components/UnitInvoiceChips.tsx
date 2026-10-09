import { centsToDollars } from "@/lib/erp/money";

export type UnitInvoiceChip = {
  id: string;
  invoiceNumber: string | null;
  status: string | null;
  dueDate: string | null;
  paidDate: string | null;
  amountCents: number;
  viewUrl: string | null;
  pdfUrl?: string | null;
};

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
}

function statusLabel(inv: UnitInvoiceChip): { text: string; cls: string } {
  if (inv.status === "paid") return { text: inv.paidDate ? `Paid ${fmtDate(inv.paidDate)}` : "Paid", cls: "border-green-200 bg-green-50 text-green-800" };
  if (inv.status === "open") {
    const overdue = inv.dueDate && new Date(inv.dueDate).getTime() < Date.now();
    return overdue
      ? { text: `Overdue since ${fmtDate(inv.dueDate)}`, cls: "border-red-200 bg-red-50 text-red-800" }
      : { text: inv.dueDate ? `Open, due ${fmtDate(inv.dueDate)}` : "Open", cls: "border-blue-200 bg-blue-50 text-blue-800" };
  }
  if (inv.status === "draft") return { text: "Draft", cls: "border-gray-200 bg-gray-50 text-gray-700" };
  if (inv.status === "voided") return { text: "Voided", cls: "border-gray-200 bg-gray-50 text-gray-400 line-through" };
  return { text: inv.status ?? "Unknown", cls: "border-gray-200 bg-gray-50 text-gray-700" };
}

/** The ERP billing status a turn's HubSpot invoices imply, or null when
 * there's nothing to go on (no invoices, or only drafts/voided ones). */
export function expectedBillingStatus(invoices: UnitInvoiceChip[]): "BILLED" | "PAID" | null {
  const live = invoices.filter((i) => i.status === "open" || i.status === "paid");
  if (live.length === 0) return null;
  return live.every((i) => i.status === "paid") ? "PAID" : "BILLED";
}

/** HubSpot invoice chips for one turn, e.g. "INV-1395 · Open, due Nov 7 · $650.00".
 * The invoice number opens HubSpot's invoice page.
 * `compact` drops the amount for table cells. */
export function UnitInvoiceChips({ invoices, compact = false }: { invoices: UnitInvoiceChip[]; compact?: boolean }) {
  if (invoices.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {invoices.map((inv) => {
        const s = statusLabel(inv);
        return (
          <span key={inv.id} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${s.cls}`}>
            {inv.viewUrl ? (
              <a href={inv.viewUrl} target="_blank" rel="noopener noreferrer" className="font-semibold hover:underline">
                {inv.invoiceNumber ?? "Invoice"}
              </a>
            ) : (
              <span className="font-semibold">{inv.invoiceNumber ?? "Invoice"}</span>
            )}
            <span>· {s.text}</span>
            {!compact && <span>· {centsToDollars(inv.amountCents)}</span>}
          </span>
        );
      })}
    </div>
  );
}
