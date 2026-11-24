import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getErpAuth, canApproveInvoices } from "@/lib/erpAuth";
import { loadInvoiceCleanup } from "@/lib/erp/invoiceCleanup";
import { CleanupBoard } from "./CleanupLists";

export const metadata: Metadata = { title: "Fix old unpaid work" };
export const dynamic = "force-dynamic";

/** Old work still showing unpaid: one to-do list, a card per job (CleanupLists.tsx). */
export default async function InvoiceCleanupPage() {
  const auth = await getErpAuth();
  if (!auth || !canApproveInvoices(auth.role)) redirect("/erp/invoices");
  const data = await loadInvoiceCleanup();

  return (
    <div className="space-y-6">
      <div className="mx-auto max-w-4xl">
        <Link href="/erp/invoices" className="text-sm text-pink-600 hover:underline">
          ← Invoices
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">Fix old unpaid work</h1>
        <p className="mt-1 text-sm text-gray-600">Work that was finished a while ago but still shows unpaid, usually because its invoice was never attached to it.</p>
      </div>
      <CleanupBoard data={data} />
    </div>
  );
}
