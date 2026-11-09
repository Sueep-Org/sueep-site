import type { Metadata } from "next";
import { findSubByToken, isDeviceSignedIn } from "@/lib/erp/subPortalAccess";
import { maskEmail } from "@/lib/erp/propertyManagerAccess";
import { loadSubJobs } from "@/lib/erp/subPortalJobs";
import { DECLINE_REASONS, portalOffers } from "@/lib/erp/subOffers";
import { SubSignIn } from "./SubSignIn";
import { SubPortal } from "./SubPortal";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Your Jobs | Sueep",
  robots: { index: false, follow: false },
};

type PageProps = { params: Promise<{ token: string }> };

function contactEmail(): string {
  return (process.env.CONTACT_TO_EMAIL || "contact@sueep.com").trim();
}

export default async function SubPortalPage({ params }: PageProps) {
  const { token } = await params;
  const sub = await findSubByToken(token);

  if (!sub) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 text-gray-900">
        <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-pink-600">Sueep</p>
          <h1 className="mt-2 text-lg font-semibold">This link doesn&apos;t work anymore</h1>
          <p className="mt-1 text-sm text-gray-500">Este enlace ya no funciona.</p>
          <p className="mt-3 text-sm text-gray-600">
            Ask Sueep for a new one at{" "}
            <a href={`mailto:${contactEmail()}`} className="text-pink-600 hover:underline">
              {contactEmail()}
            </a>
            .
          </p>
        </div>
      </main>
    );
  }

  const firstName = sub.name.split(" ")[0] || sub.name;

  if (!(await isDeviceSignedIn(sub.id))) {
    return <SubSignIn token={token} firstName={firstName} maskedEmail={maskEmail(sub.email)} profileLang={sub.lang} />;
  }

  const [jobs, offers] = await Promise.all([loadSubJobs(sub.id, sub.lang), portalOffers(sub.id)]);
  return (
    <SubPortal
      token={token}
      firstName={firstName}
      jobs={jobs}
      offers={offers}
      declineReasons={DECLINE_REASONS}
      profileLang={sub.lang}
      contactEmail={contactEmail()}
    />
  );
}
