import type { Metadata, Viewport } from "next";
import { loadApprovalView } from "@/lib/erp/subCoApproval";
import { ApprovalForm } from "./ApprovalForm";

export const metadata: Metadata = { title: "Change order approval", robots: { index: false, follow: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#E73C6E" };
export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ token: string }>; searchParams: Promise<{ answer?: string }> };

/** Opened from Approve / Deny in the property manager's change order email. No login; the link is the key. */
export default async function CoApprovePage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const { answer } = await searchParams;
  const view = await loadApprovalView(token).catch(() => null);
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-lg">
        <p className="text-sm font-semibold text-pink-600">Sueep</p>
        {!view ? (
          <div className="mt-3 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-sm text-gray-700">This link isn&apos;t valid anymore. If you think that&apos;s wrong, reply to our email.</p>
          </div>
        ) : (
          <ApprovalForm token={token} view={view} preselect={answer === "deny" ? "deny" : answer === "approve" ? "approve" : null} />
        )}
      </div>
    </main>
  );
}
