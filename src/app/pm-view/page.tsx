import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Turnover Status | Sueep",
  robots: { index: false, follow: false },
};

function contactEmail(): string {
  return (process.env.CONTACT_TO_EMAIL || "contact@sueep.com").trim();
}

/**
 * Retired: this used to list a building's open turnovers to anyone with the
 * building's id. Property managers now get their own private page
 * (/pm/[token]). Kept as a notice because older emails still link here.
 */
export default function PmViewPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 text-gray-900">
      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-pink-600">Sueep</p>
        <h1 className="mt-2 text-lg font-semibold">This page has moved</h1>
        <p className="mt-2 text-sm text-gray-600">
          Your turnovers now have their own private page. Ask Sueep for your link at{" "}
          <a href={`mailto:${contactEmail()}`} className="text-pink-600 hover:underline">
            {contactEmail()}
          </a>
          .
        </p>
      </div>
    </main>
  );
}
