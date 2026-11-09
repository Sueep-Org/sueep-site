import Link from "next/link";
import { redirect } from "next/navigation";
import { getErpAuth } from "@/lib/erpAuth";
import { isPmLevel } from "@/lib/erpRoles";
import { loadReviewList, type ReviewStatus } from "@/lib/erp/subReviews";
import { InfoTip } from "@/app/erp/components/ui";

export const dynamic = "force-dynamic";

const TABS: { id: ReviewStatus; label: string; empty: string }[] = [
  { id: "PENDING", label: "Waiting for review", empty: "Nothing waiting. Subs' days show up here when they check out." },
  { id: "NEEDS_FIX", label: "Waiting on sub fixes", empty: "No fixes out with subs." },
  { id: "PASSED", label: "Passed (last 60 days)", empty: "Nothing passed in the last 60 days." },
];

type PageProps = { searchParams: Promise<{ status?: string; all?: string }> };

function dayText(key: string): string {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

/** Sub Reviews: subs' days to pass or send back for fixes (subReviews.ts). PM, Business Manager, Admin. */
export default async function SubReviewsPage({ searchParams }: PageProps) {
  const auth = await getErpAuth();
  if (!auth || !isPmLevel(auth.role)) redirect("/erp");
  const sp = await searchParams;
  const status = (TABS.find((t) => t.id === sp.status)?.id ?? "PENDING") as ReviewStatus;
  // PMs start on their own days; Business Managers and Admins on everything
  const pm = auth.role === "PROJECT_MANAGER";
  const mine = pm && sp.all !== "1";
  const rows = await loadReviewList(auth, { status, mine });
  const tab = TABS.find((t) => t.id === status)!;
  const href = (s: ReviewStatus, all = !mine) => `/erp/sub-reviews?status=${s}${pm && all ? "&all=1" : ""}`;

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-gray-900">Sub Reviews</h1>
            <InfoTip text="When the sub running a day checks out, their before and after photos come here for the day's PM to pass or send back for fixes. Business Managers and Admins can review any day. Supervisors can't." />
          </div>
          {pm && (
            <Link href={href(status, !mine)} className="text-sm font-medium text-pink-600 hover:underline">
              {mine ? "Show every PM's days" : "Show only my days"}
            </Link>
          )}
        </div>
        <nav className="flex gap-1 overflow-x-auto border-b border-gray-200" aria-label="Review status">
          {TABS.map((t) => (
            <Link
              key={t.id}
              href={href(t.id)}
              aria-current={t.id === status ? "page" : undefined}
              className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium ${t.id === status ? "border-pink-600 text-pink-600" : "border-transparent text-gray-500 hover:text-gray-800"}`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 bg-white px-4 py-10 text-center text-sm text-gray-500">{tab.empty}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2 font-medium">Day</th>
                <th className="px-4 py-2 font-medium">Job</th>
                <th className="px-4 py-2 font-medium">Sub</th>
                <th className="px-4 py-2 font-medium">PM</th>
                <th className="px-4 py-2 font-medium">Round</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap px-4 py-2 text-gray-700">{dayText(r.dateKey)}</td>
                  <td className="px-4 py-2">
                    <Link href={`/erp/projects/${r.projectId}`} className="text-gray-900 hover:text-pink-600">
                      {r.title}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-gray-700">{r.subName}</td>
                  <td className="px-4 py-2 text-gray-500">{r.pmEmail ?? "No PM on the day"}</td>
                  <td className="px-4 py-2 text-gray-500">{r.round}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    <Link href={`/erp/sub-reviews/${r.id}`} className="font-medium text-pink-600 hover:underline">
                      {r.status === "PENDING" && r.canReview ? "Review" : "Open"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
