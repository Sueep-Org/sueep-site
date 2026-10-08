import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageJanitorial } from "@/lib/erpAuth";
import { summaryRecipients } from "@/lib/erp/janitorialQualityChecks";
import { needsAttention, parseAreaResults } from "@/lib/erp/janitorialQualityShared";
import { SummaryForm } from "./SummaryForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Send visit summary" };

type PageProps = { params: Promise<{ id: string }> };

/** After finishing a check: choose what the property manager sees, preview it, send it. */
export default async function SummaryPage({ params }: PageProps) {
  const auth = await getErpAuth();
  if (!auth || !canManageJanitorial(auth.role)) redirect("/erp");
  const { id } = await params;

  const check = await prisma.janitorialQualityCheck.findUnique({
    where: { id },
    select: {
      status: true,
      areaResults: true,
      propertyManagerName: true,
      propertyManagerNotes: true,
      summarySentAt: true,
      summarySentTo: true,
      recurringContractId: true,
      recurringContract: { select: { building: { select: { name: true } } } },
      _count: { select: { photos: true } },
    },
  });
  if (!check) notFound();
  if (check.status !== "DONE") redirect(`/erp/janitorial/quality-checks/${id}`);

  const recipients = await summaryRecipients(check.recurringContractId);
  const flagged = needsAttention(parseAreaResults(check.areaResults)).length;
  const firstName = check.propertyManagerName?.trim().split(/\s+/)[0];
  const defaultMessage = [
    firstName ? `Hi ${firstName},` : "Hi,",
    "",
    `Thanks for your time today. Here's a quick summary of our visit to ${check.recurringContract.building.name}.`,
    flagged ? `Our team is taking care of the area${flagged === 1 ? "" : "s"} marked Needs attention.` : "Everything looked good.",
  ].join("\n");

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <Link href={`/erp/janitorial/quality-checks/${id}`} className="text-xs text-pink-600 hover:underline">
          ← Back to the check
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">Send visit summary</h1>
        <p className="mt-1 text-sm text-gray-600">{check.recurringContract.building.name}</p>
        {check.summarySentAt && (
          <p className="mt-2 inline-block rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
            Sent {check.summarySentAt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" })} to{" "}
            {check.summarySentTo.join(", ")}
          </p>
        )}
      </div>
      <SummaryForm
        checkId={id}
        doneHref={`/erp/janitorial/contracts/${check.recurringContractId}?tab=Quality`}
        recipients={recipients.map((r) => ({ email: r.email, name: r.name, source: r.source }))}
        defaultMessage={defaultMessage}
        photoCount={check._count.photos}
        hasDiscussion={!!check.propertyManagerNotes?.trim()}
        alreadySent={!!check.summarySentAt}
      />
    </div>
  );
}
