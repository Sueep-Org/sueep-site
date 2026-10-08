import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageJanitorial } from "@/lib/erpAuth";
import { todayEasternKey, utcDateKey } from "@/lib/erp/dates";
import { checkerName, namesByEmail } from "@/lib/erp/janitorialQualityChecks";
import { formAreaResults, keyAreasFor, needsAttention, parseAreaResults } from "@/lib/erp/janitorialQualityShared";
import { QualityCheckForm } from "./QualityCheckForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Quality check" };

type PageProps = { params: Promise<{ id: string }> };

/** The on-site form a project manager fills out on their phone during the visit. */
export default async function QualityCheckPage({ params }: PageProps) {
  const auth = await getErpAuth();
  if (!auth || !canManageJanitorial(auth.role)) redirect("/erp");
  const { id } = await params;

  const check = await prisma.janitorialQualityCheck.findUnique({
    where: { id },
    include: {
      assignedUser: { select: { email: true } },
      photos: { orderBy: { createdAt: "asc" }, select: { id: true, area: true } },
      recurringContract: {
        select: {
          id: true,
          qualityAreas: true,
          serviceAreas: true,
          building: { select: { name: true, address: true, pmName: true } },
        },
      },
    },
  });
  if (!check) notFound();

  const contract = check.recurringContract;
  // Follow-ups: what the previous finished visit flagged.
  const previous = await prisma.janitorialQualityCheck.findFirst({
    where: { recurringContractId: contract.id, status: "DONE", id: { not: check.id }, scheduledDate: { lte: check.scheduledDate } },
    orderBy: [{ scheduledDate: "desc" }, { completedAt: "desc" }],
    select: { scheduledDate: true, areaResults: true },
  });
  const previousFlags = previous ? needsAttention(parseAreaResults(previous.areaResults)) : [];
  const lastVisit = previousFlags.length
    ? {
        dateLabel: previous!.scheduledDate.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
        flagged: Object.fromEntries(previousFlags.map((r) => [r.area.toLowerCase(), r.note])),
      }
    : null;
  const names = await namesByEmail([check.assignedUser?.email, check.completedBy].filter((e): e is string => !!e));
  const date = utcDateKey(check.scheduledDate);
  const contractHref = `/erp/janitorial/contracts/${contract.id}?tab=Quality`;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <Link href={contractHref} className="text-xs text-pink-600 hover:underline">
          ← {contract.building.name}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">Quality check</h1>
        <p className="mt-1 text-sm text-gray-600">
          {contract.building.name}
          {contract.building.address ? <span className="text-gray-400"> · {contract.building.address}</span> : null}
        </p>
        <p className="text-sm text-gray-600">
          {new Date(`${date}T00:00:00.000Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })}
          {" · "}
          {checkerName(check.assignedUser, names)}
        </p>
        {check.status === "DONE" && (
          <p className="mt-2 inline-block rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
            Done
            {check.completedAt
              ? ` ${check.completedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" })}`
              : ""}
            {check.completedBy ? ` by ${names.get(check.completedBy.toLowerCase()) ?? check.completedBy}` : ""}
          </p>
        )}
        {check.notes && <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">{check.notes}</p>}
        {check.status === "DONE" && (
          <p className="mt-2 text-sm">
            {check.summarySentAt ? (
              <span className="text-gray-600">
                Summary sent to {check.summarySentTo.join(", ")}.{" "}
                <Link href={`/erp/janitorial/quality-checks/${check.id}/summary`} className="text-pink-600 hover:underline">
                  Send again
                </Link>
              </span>
            ) : (
              <Link href={`/erp/janitorial/quality-checks/${check.id}/summary`} className="font-medium text-pink-600 hover:underline">
                Send summary to the property manager
              </Link>
            )}
          </p>
        )}
      </div>

      <QualityCheckForm
        checkId={check.id}
        lastVisit={lastVisit}
        done={check.status === "DONE"}
        upcoming={date > todayEasternKey()}
        usingServiceAreas={contract.qualityAreas.length === 0}
        initial={{
          areaResults: formAreaResults(parseAreaResults(check.areaResults), keyAreasFor(contract)),
          propertyManagerName: check.propertyManagerName ?? "",
          propertyManagerNotes: check.propertyManagerNotes ?? "",
          teamUpdates: check.teamUpdates ?? "",
        }}
        propertyManagerOnFile={contract.building.pmName}
        photos={check.photos}
      />
    </div>
  );
}
