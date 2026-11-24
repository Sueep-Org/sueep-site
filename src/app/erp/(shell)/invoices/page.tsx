import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getErpAuth, canApproveInvoices, canManageQuickBooks, canSeeInvoices } from "@/lib/erpAuth";
import { BillingFlowBar } from "@/app/erp/components/BillingFlowBar";
import { InfoTip } from "@/app/erp/components/ui";
import { loadInvoiceList } from "@/lib/erp/invoiceList";
import { InvoiceList } from "./InvoiceList";

export const metadata: Metadata = { title: "Invoices" };
export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const auth = await getErpAuth();
  if (!auth || !canSeeInvoices(auth.role)) redirect("/erp");
  const rows = await loadInvoiceList();

  return (
    <div className="space-y-4">
      <BillingFlowBar current="invoices" />
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex items-center gap-1 text-2xl font-semibold text-gray-900">
          Invoices
          <InfoTip text="Every invoice and whether it's paid, from QuickBooks since January last year, read nightly with its payments. Click a row for what it's for (on Project Billing), payments and links. Not in QuickBooks: HubSpot invoices that never reached QuickBooks." />
        </h1>
        {canApproveInvoices(auth.role) && (
          <Link href="/erp/invoices/cleanup" className="ml-auto rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Fix old unpaid work
          </Link>
        )}
      </div>
      <InvoiceList rows={rows} showQuickBooks={canManageQuickBooks(auth.role)} canEdit={canApproveInvoices(auth.role)} />
    </div>
  );
}
