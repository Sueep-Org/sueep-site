import type { Metadata } from "next";
import { findManagerByToken, isDeviceSignedIn, maskEmail } from "@/lib/erp/propertyManagerAccess";
import { loadPropertyManagerCalendar } from "@/lib/erp/propertyManagerCalendar";
import { todayEasternKey } from "@/lib/erp/dates";
import { prisma } from "@/lib/prisma";
import { PmSignIn } from "./PmSignIn";
import { PmCalendar } from "./PmCalendar";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Your Turnovers | Sueep",
  robots: { index: false, follow: false },
};

type PageProps = { params: Promise<{ token: string }> };

function contactEmail(): string {
  return (process.env.CONTACT_TO_EMAIL || "contact@sueep.com").trim();
}

export default async function PropertyManagerPage({ params }: PageProps) {
  const { token } = await params;
  const manager = await findManagerByToken(token);

  if (!manager) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 text-gray-900">
        <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-pink-600">Sueep</p>
          <h1 className="mt-2 text-lg font-semibold">This link doesn&apos;t work anymore</h1>
          <p className="mt-2 text-sm text-gray-600">
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

  const firstName = manager.name.split(" ")[0] || manager.name;

  if (!(await isDeviceSignedIn(manager.id))) {
    return <PmSignIn token={token} firstName={firstName} maskedEmail={maskEmail(manager.email)} />;
  }

  const [{ buildings, units, knownUnits }, contact] = await Promise.all([
    loadPropertyManagerCalendar(manager.id),
    prisma.propertyManager.findUnique({
      where: { id: manager.id },
      select: { sueepContactName: true, sueepContactPhone: true, sueepContactEmail: true },
    }),
  ]);
  return (
    <PmCalendar
      token={token}
      firstName={firstName}
      buildings={buildings}
      units={units}
      knownUnits={knownUnits}
      today={todayEasternKey()}
      contactEmail={contactEmail()}
      sueepContact={{
        name: contact?.sueepContactName ?? null,
        phone: contact?.sueepContactPhone ?? null,
        email: contact?.sueepContactEmail ?? null,
      }}
    />
  );
}
