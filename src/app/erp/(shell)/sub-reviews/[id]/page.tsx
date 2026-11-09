import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getErpAuth } from "@/lib/erpAuth";
import { isPmLevel } from "@/lib/erpRoles";
import { loadReviewDetail, type ReviewPhoto } from "@/lib/erp/subReviews";
import { TURNOVER_PHOTO_AREAS, photoAreaLabel } from "@/lib/erp/subPhotoAreas";
import { ReviewActions } from "./ReviewActions";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

const STATUS = {
  PENDING: { text: "Waiting for review", cls: "bg-amber-50 text-amber-800" },
  NEEDS_FIX: { text: "Waiting on the sub's fixes", cls: "bg-red-50 text-red-700" },
  PASSED: { text: "Passed", cls: "bg-emerald-50 text-emerald-700" },
} as const;

const ACTION = { SUBMITTED: "Checked out, sent for review", NEEDS_FIX: "Needs fix", FIX_SENT: "Sub sent fix photos", PASSED: "Passed" } as Record<string, string>;

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
}
function when(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
}

function Thumbs({ photos, empty = "None" }: { photos: ReviewPhoto[]; empty?: string }) {
  if (photos.length === 0) return <p className="text-xs text-gray-400">{empty}</p>;
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {photos.map((p) => (
        <li key={p.id} className="overflow-hidden rounded-md border border-gray-200 bg-white">
          <a href={`/api/erp/sub-photos/${p.id}`} target="_blank" rel="noopener noreferrer" className="block aspect-square bg-gray-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/erp/sub-photos/${p.id}?size=thumb`} alt="" loading="lazy" className="h-full w-full object-cover" />
          </a>
          <p className="truncate px-1.5 py-1 text-[11px] text-gray-500">
            {clock(p.takenAt)}
            {p.offSite && <span className="ml-1 font-medium text-amber-700">off site</span>}
          </p>
        </li>
      ))}
    </ul>
  );
}

/** One sub's day: before/after side by side by room, every round, and Pass / Needs fix (subReviews.ts). */
export default async function SubReviewPage({ params }: PageProps) {
  const auth = await getErpAuth();
  if (!auth || !isPmLevel(auth.role)) redirect("/erp");
  const { id } = await params;
  const r = await loadReviewDetail(id, auth);
  if (!r) notFound();

  const before = r.photos.filter((p) => p.kind === "before");
  const after = r.photos.filter((p) => p.kind === "after");
  // Rooms in checklist order, then typed areas, then photos with no room
  const areaKeys = [...new Set([...before, ...after].map((p) => p.area ?? ""))].sort((a, b) => {
    const ia = TURNOVER_PHOTO_AREAS.findIndex((x) => x.id === a);
    const ib = TURNOVER_PHOTO_AREAS.findIndex((x) => x.id === b);
    return (a === "" ? 1 : 0) - (b === "" ? 1 : 0) || (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
  });
  const rounds = [...new Set(r.photos.filter((p) => p.round != null).map((p) => p.round!))].sort((a, b) => a - b);
  const dayText = new Date(`${r.dateKey}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  const ci = r.checkIn;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/erp/sub-reviews" className="text-sm text-pink-600 hover:underline">
          ← Sub Reviews
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-gray-900">{r.title}</h1>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS[r.status].cls}`}>{STATUS[r.status].text}</span>
          {r.round > 1 && <span className="text-xs text-gray-500">Round {r.round}</span>}
        </div>
        <p className="mt-1 text-sm text-gray-600">
          {dayText} · {r.subName}
          {r.subPhone && (
            <>
              {" · "}
              <a href={`tel:${r.subPhone}`} className="text-pink-600 hover:underline">
                {r.subPhone}
              </a>
            </>
          )}
          {" · "}
          <Link href={`/erp/projects/${r.projectId}`} className="text-pink-600 hover:underline">
            Open project
          </Link>
        </p>
        <p className="mt-1 text-xs text-gray-500">
          {ci.inAt ? `In ${clock(ci.inAt)}` : "No check-in"}
          {ci.lateMinutes != null ? `, ${ci.lateMinutes} min late` : ""}
          {ci.inOffSite ? ", off site" : ""}
          {ci.outAt ? ` · Out ${clock(ci.outAt)}${ci.outOffSite ? ", off site" : ""}` : ""}
          {ci.crewCount != null ? ` · ${ci.crewCount} ${ci.crewCount === 1 ? "person" : "people"} came` : ""}
          {ci.waivedReason ? ` · Checked out without all photos: ${ci.waivedReason}` : ""}
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-900">Before and after</h2>
        {areaKeys.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 bg-white px-4 py-6 text-center text-sm text-gray-500">No before or after photos.</p>
        ) : (
          <div className="space-y-3">
            {areaKeys.map((area) => (
              <div key={area || "none"} className="rounded-lg border border-gray-200 bg-white p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{photoAreaLabel(area) ?? (r.turnover ? "Whole unit" : "General")}</p>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-gray-700">Before</p>
                    <Thumbs photos={before.filter((p) => (p.area ?? "") === area)} />
                  </div>
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-gray-700">After</p>
                    <Thumbs photos={after.filter((p) => (p.area ?? "") === area)} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {rounds.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">Fixes</h2>
          {rounds.map((n) => (
            <div key={n} className="rounded-lg border border-gray-200 bg-white p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Round {n}</p>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="mb-1.5 text-xs font-medium text-gray-700">What to fix (your photos)</p>
                  <Thumbs photos={r.photos.filter((p) => p.kind === "issue" && p.round === n)} empty="No photos sent with the request" />
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-medium text-gray-700">The sub&apos;s fix photos</p>
                  <Thumbs photos={r.photos.filter((p) => p.kind === "fix" && p.round === n)} empty={r.status === "NEEDS_FIX" && n === r.round ? "Not sent yet" : "None"} />
                </div>
              </div>
            </div>
          ))}
        </section>
      )}

      <ReviewActions id={r.id} status={r.status} canReview={r.canReview} turnover={r.turnover} areas={TURNOVER_PHOTO_AREAS} openFix={r.status === "NEEDS_FIX" ? { items: r.fixItems, note: r.fixNote } : null} />

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-900">History</h2>
        <ol className="space-y-2 rounded-lg border border-gray-200 bg-white p-4 text-sm">
          {r.events.map((e, i) => (
            <li key={i} className="text-gray-700">
              <span className="text-xs text-gray-500">{when(e.at)}</span> · <strong>{ACTION[e.action] ?? e.action}</strong>
              {e.by !== "sub" ? ` by ${e.by}` : ""}
              {e.onSite ? " (on site)" : ""}
              {e.items.length > 0 && <span className="text-gray-600">: {e.items.join(", ")}</span>}
              {e.note && <p className="mt-0.5 whitespace-pre-line text-gray-600">{e.note}</p>}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
