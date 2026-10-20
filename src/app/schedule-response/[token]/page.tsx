import type { Metadata, Viewport } from "next";
import { loadResponse } from "@/lib/erp/scheduleConfirmations";
import { ResponseForm } from "./ResponseForm";

export const metadata: Metadata = { title: "Your schedule", robots: { index: false, follow: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#E73C6E" };
export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ token: string }> };

/** Opened from the Confirm / Can't make it buttons in a schedule invite. No login; the link is the key. */
export default async function ScheduleResponsePage({ params }: PageProps) {
  const { token } = await params;
  const view = await loadResponse(token).catch(() => null);
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-pink-600">Sueep</p>
        {!view ? (
          <p className="mt-3 text-sm text-gray-700">This link isn&apos;t valid anymore. If you think that&apos;s wrong, contact the office.</p>
        ) : (
          <ResponseForm token={token} view={view} />
        )}
      </div>
    </main>
  );
}
