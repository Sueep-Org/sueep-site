import Link from "next/link";
import { notFound } from "next/navigation";
import { getErpAuth, isPmLevel } from "@/lib/erpAuth";
import { loadBulkEmailSubs } from "@/lib/erp/subBulkEmail";
import { loadEmailQuota } from "@/lib/erp/emailQuota";
import { SubBulkEmail } from "./SubBulkEmail";

export const dynamic = "force-dynamic";

/** Contractors → Email subs: one message to many subs, picked by filters. */
export default async function EmailSubsPage() {
  const auth = await getErpAuth();
  if (!auth || !isPmLevel(auth.role)) notFound();
  const [subs, quota] = await Promise.all([loadBulkEmailSubs(), loadEmailQuota()]);

  return (
    <div className="space-y-4">
      <div>
        <Link href="/erp/contractors" className="text-xs text-gray-500 hover:text-gray-800">← Contractors</Link>
        <h1 className="text-2xl font-semibold text-gray-900">Email subs</h1>
        <p className="mt-1 text-sm text-gray-600">
          Pick who gets it with the filters, untick anyone to leave out, and write the message. Each sub gets their own email, and replies come to you.
        </p>
      </div>
      <SubBulkEmail subs={subs} room={Math.max(0, quota.cutoff - quota.used)} />
    </div>
  );
}
