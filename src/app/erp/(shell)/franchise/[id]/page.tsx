import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canSeeFranchiseInquiries } from "@/lib/erpAuth";
import { DetailTabs } from "@/app/erp/components/DetailTabs";
import { FranchiseInquiryEditor } from "./FranchiseInquiryEditor";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

const MARKET_PREFERENCE_LABELS: Record<string, string> = {
  current: "Current market",
  relocating: "Relocating",
  either: "Open to either",
  not_sure: "Not sure yet",
};

const LAUNCH_TIMELINE_LABELS: Record<string, string> = {
  immediately: "Immediately",
  "3_months": "Within 3 months",
  "3_6_months": "3–6 months",
  "6_12_months": "6–12 months",
  "12_plus": "12+ months",
  exploring: "Just exploring",
};

const INVOLVEMENT_LABELS: Record<string, string> = {
  full_time: "Yes, full-time",
  part_time: "Yes, part-time",
  hire_manager: "Would hire a manager/operator",
  not_sure: "Not sure yet",
};

function formatYesNo(val: string | undefined): string {
  return val === "yes" ? "Yes" : val === "no" ? "No" : "-";
}

export default async function FranchiseDetailPage({ params }: PageProps) {
  const auth = await getErpAuth();
  if (!auth || !canSeeFranchiseInquiries(auth.role)) redirect("/erp");

  const { id } = await params;
  const row = await prisma.franchiseInquiry.findUnique({ where: { id } });
  if (!row) notFound();

  const responses = (row.responses ?? {}) as Record<string, unknown>;
  const marketPreference = String(responses.marketPreference ?? "");
  const launchTimeline = String(responses.launchTimeline ?? "");
  const currentOccupation = typeof responses.currentOccupation === "string" ? responses.currentOccupation : "";
  const ownsBusiness = typeof responses.ownsBusiness === "string" ? responses.ownsBusiness : undefined;
  const previousFranchise = typeof responses.previousFranchise === "string" ? responses.previousFranchise : undefined;
  const experienceAreas = Array.isArray(responses.experienceAreas) ? (responses.experienceAreas as string[]) : [];
  const backgroundText = typeof responses.backgroundText === "string" ? responses.backgroundText : "";
  const interests = Array.isArray(responses.interests) ? (responses.interests as string[]) : [];
  const involvement = typeof responses.involvement === "string" ? responses.involvement : "";
  const goalsText = typeof responses.goalsText === "string" ? responses.goalsText : "";
  const additionalInfo = typeof responses.additionalInfo === "string" ? responses.additionalInfo : "";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/erp/franchise" className="text-xs text-pink-600 hover:underline">
          ← Franchise Inquiries
        </Link>
        <h1 className="mt-2 flex items-center gap-2 text-2xl font-semibold text-gray-900">
          {row.firstName} {row.lastName}
          {row.responses == null && (
            <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
              Incomplete
            </span>
          )}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Submitted{" "}
          {new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeStyle: "short" }).format(row.createdAt)}
        </p>
        {row.responses == null && (
          <p className="mt-2 max-w-xl text-sm text-amber-700">
            They gave us their contact info but did not finish the rest of the form. Use what is below to reach out.
          </p>
        )}
      </div>

      <DetailTabs
        tabs={[
          {
            label: "Pipeline",
            content: (
              <FranchiseInquiryEditor initial={{ id: row.id, status: row.status, internalNotes: row.internalNotes }} />
            ),
          },
          {
            label: "Contact Information",
            content: (
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-pink-500">Email</dt>
                  <dd className="mt-0.5">
                    <a href={`mailto:${row.email}`} className="text-[#E73C6E] hover:underline">
                      {row.email}
                    </a>
                  </dd>
                </div>
                <div>
                  <dt className="text-pink-500">Phone</dt>
                  <dd className="mt-0.5 text-zinc-600">
                    <a href={`tel:${row.phone}`} className="hover:underline">{row.phone}</a>
                  </dd>
                </div>
                <div>
                  <dt className="text-pink-500">Current City &amp; State</dt>
                  <dd className="mt-0.5 text-zinc-600">{row.cityState || "-"}</dd>
                </div>
                <div>
                  <dt className="text-pink-500">Agreed to be contacted</dt>
                  <dd className="mt-0.5 text-zinc-600">{row.agreedToContact ? "Yes" : "No"}</dd>
                </div>
              </dl>
            ),
          },
          {
            label: "Interest",
            content: (
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-pink-500">Market interested in</dt>
                  <dd className="mt-0.5 text-zinc-600">{row.market || "-"}</dd>
                </div>
                <div>
                  <dt className="text-pink-500">Current market or relocating</dt>
                  <dd className="mt-0.5 text-zinc-600">{MARKET_PREFERENCE_LABELS[marketPreference] ?? "-"}</dd>
                </div>
                <div>
                  <dt className="text-pink-500">Ideal launch timeline</dt>
                  <dd className="mt-0.5 text-zinc-600">{LAUNCH_TIMELINE_LABELS[launchTimeline] ?? "-"}</dd>
                </div>
              </dl>
            ),
          },
          {
            label: "Background",
            content: (
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-pink-500">Current occupation</dt>
                  <dd className="mt-0.5 text-zinc-600">{currentOccupation || "-"}</dd>
                </div>
                <div>
                  <dt className="text-pink-500">Owns/operates a business</dt>
                  <dd className="mt-0.5 text-zinc-600">{formatYesNo(ownsBusiness)}</dd>
                </div>
                <div>
                  <dt className="text-pink-500">Previously owned a franchise</dt>
                  <dd className="mt-0.5 text-zinc-600">{formatYesNo(previousFranchise)}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-pink-500">Experience areas</dt>
                  <dd className="mt-0.5 text-zinc-600">
                    {experienceAreas.length > 0 ? experienceAreas.join(", ") : "-"}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-pink-500">Professional/business background</dt>
                  <dd className="mt-0.5 text-zinc-600 whitespace-pre-wrap">{backgroundText || "-"}</dd>
                </div>
              </dl>
            ),
          },
          {
            label: "Goals",
            content: (
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <dt className="text-pink-500">What interests them most</dt>
                  <dd className="mt-0.5 text-zinc-600">{interests.length > 0 ? interests.join(", ") : "-"}</dd>
                </div>
                <div>
                  <dt className="text-pink-500">Planned involvement</dt>
                  <dd className="mt-0.5 text-zinc-600">{INVOLVEMENT_LABELS[involvement] ?? "-"}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-pink-500">What they hope to accomplish</dt>
                  <dd className="mt-0.5 text-zinc-600 whitespace-pre-wrap">{goalsText || "-"}</dd>
                </div>
              </dl>
            ),
          },
          {
            label: "Let's Talk",
            content: (
              <>
                <dl className="grid gap-3 text-sm">
                  <div>
                    <dt className="text-pink-500">Anything else</dt>
                    <dd className="mt-0.5 text-zinc-600 whitespace-pre-wrap">{additionalInfo || "-"}</dd>
                  </div>
                </dl>
                <p className="mt-4 text-xs text-zinc-400 font-mono">id: {row.id}</p>
              </>
            ),
          },
        ]}
      />
    </div>
  );
}
