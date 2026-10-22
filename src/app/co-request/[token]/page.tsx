import type { Metadata, Viewport } from "next";
import { loadCoRequestView } from "@/lib/erp/subCoRequests";
import { CoRequestForm } from "./CoRequestForm";

export const metadata: Metadata = { title: "Change order request", robots: { index: false, follow: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#E73C6E" };
export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ token: string }> };

/** Opened from "Request a change order" in a turnover sub's schedule invite. No login; the link is the key. */
export default async function CoRequestPage({ params }: PageProps) {
  const { token } = await params;
  const view = await loadCoRequestView(token).catch(() => null);
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-lg">
        <p className="text-sm font-semibold text-pink-600">Sueep</p>
        {!view ? (
          <div className="mt-3 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-sm text-gray-700">This link isn&apos;t valid anymore. If you think that&apos;s wrong, contact the office.</p>
          </div>
        ) : (
          <CoRequestForm token={token} view={view} />
        )}
      </div>
    </main>
  );
}
