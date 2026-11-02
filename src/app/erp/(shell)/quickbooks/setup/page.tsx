import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getErpAuth, canManageQuickBooks } from "@/lib/erpAuth";
import { InfoTip } from "@/app/erp/components/ui";
import { loadQboMapping } from "@/lib/erp/qboMapping";
import { QuickBooksSetup } from "./QuickBooksSetup";

export const metadata: Metadata = { title: "Invoice setup" };
export const dynamic = "force-dynamic";

export default async function QuickBooksSetupPage() {
  const auth = await getErpAuth();
  if (!auth || !canManageQuickBooks(auth.role)) redirect("/erp");
  const mapping = await loadQboMapping();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-1 text-2xl font-semibold text-gray-900">
          Invoice setup
          <InfoTip text="Getting ready for the ERP to send invoices to QuickBooks itself. Link each company to its QuickBooks customer and each kind of line to a product. Saved in the ERP only; nothing changes in QuickBooks yet." />
        </h1>
        <Link href="/erp/quickbooks" className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
          ← QuickBooks
        </Link>
      </div>
      <QuickBooksSetup mapping={mapping} />
    </div>
  );
}
