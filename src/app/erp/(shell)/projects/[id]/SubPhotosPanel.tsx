import { projectSubPhotos, type StaffPhoto, type StaffPhotoDay } from "@/lib/erp/subPhotos";
import { photoAreaLabel } from "@/lib/erp/subPhotoAreas";
import { formatMiles } from "@/lib/erp/janitorialHours";
import { InfoTip } from "@/app/erp/components/ui";

/**
 * Subs' before and after photos on this project and its change orders, one
 * card per sub per day (subPhotos.ts). Previews load small; tapping opens
 * the full photo. Server component.
 */

function dayText(key: string): string {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
}

function PhotoGrid({ photos }: { photos: StaffPhoto[] }) {
  return (
    <ul className="mt-1.5 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
      {photos.map((p) => (
        <li key={p.id} className="overflow-hidden rounded-md border border-gray-200 bg-white">
          <a href={`/api/erp/sub-photos/${p.id}`} target="_blank" rel="noopener noreferrer" className="block aspect-square bg-gray-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/erp/sub-photos/${p.id}?size=thumb`} alt={photoAreaLabel(p.area) ?? "Sub photo"} loading="lazy" className="h-full w-full object-cover" />
          </a>
          <p className="truncate px-1.5 py-1 text-[11px] text-gray-600">
            {clock(p.takenAt)}
            {p.area ? ` · ${photoAreaLabel(p.area)}` : ""}
            {p.offSite && <span className="ml-1 font-medium text-amber-700">off site{p.meters != null ? ` ${formatMiles(p.meters)}` : ""}</span>}
          </p>
        </li>
      ))}
    </ul>
  );
}

function DayCard({ day }: { day: StaffPhotoDay }) {
  const before = day.photos.filter((p) => p.kind === "before");
  const after = day.photos.filter((p) => p.kind === "after");
  const kinds = [
    { label: "Before", photos: before, need: day.needs.before },
    { label: "After", photos: after, need: day.needs.after },
  ];
  return (
    <li className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-sm font-semibold text-gray-900">
          {dayText(day.dateKey)} · {day.subName}
          {day.role === "crew" && <span className="font-normal text-gray-500"> (crew)</span>}
          {day.changeOrder && <span className="font-normal text-gray-500"> · CO: {day.changeOrder}</span>}
        </h3>
        <p className="text-xs text-gray-500">
          {day.checkInAt ? `In ${clock(day.checkInAt)}` : "Not checked in"}
          {day.checkOutAt ? ` · Out ${clock(day.checkOutAt)}` : day.checkInAt ? " · not checked out" : ""}
        </p>
      </div>
      {day.review && (
        <p className="mt-1 text-xs">
          <a
            href={`/erp/sub-reviews/${day.review.id}`}
            className={`font-medium hover:underline ${day.review.status === "PASSED" ? "text-emerald-700" : day.review.status === "NEEDS_FIX" ? "text-red-600" : "text-pink-600"}`}
          >
            {day.review.status === "PASSED" ? "Passed review" : day.review.status === "NEEDS_FIX" ? "Fixes asked, waiting on the sub" : "Waiting for review"}
            {day.review.round > 1 ? ` (round ${day.review.round})` : ""}
          </a>
        </p>
      )}
      {day.waived && (
        <p className="mt-1 text-xs text-amber-700">
          Allowed to check out without the photos{day.waived.by ? ` by ${day.waived.by}` : ""}
          {day.waived.reason ? `: ${day.waived.reason}` : ""}
        </p>
      )}
      {kinds.map((k) => (
        <div key={k.label} className="mt-3">
          <p className={`text-xs font-semibold uppercase tracking-wide ${k.need > 0 && k.photos.length < k.need ? "text-amber-700" : "text-gray-500"}`}>
            {k.label} {k.need > 0 ? `${k.photos.length} of ${k.need}` : `(${k.photos.length})`}
          </p>
          {k.photos.length > 0 ? <PhotoGrid photos={k.photos} /> : <p className="mt-1 text-xs text-gray-400">None</p>}
        </div>
      ))}
    </li>
  );
}

export async function SubPhotosPanel({ projectId, hideWhenEmpty = false }: { projectId: string; hideWhenEmpty?: boolean }) {
  const days = await projectSubPhotos(projectId);
  if (days.length === 0 && hideWhenEmpty) return null;
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-1.5">
        <h2 className="text-sm font-semibold text-gray-900">Photos from subs</h2>
        <InfoTip text="Before and after photos subs take from the Today tab of their jobs page, after checking in. Each is stamped with the time it was taken; Off site means the phone was farther from the job than the distance on Settings, Subs. The minimum needed to check out is set there too." />
      </div>
      {days.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 bg-white px-4 py-6 text-center text-sm text-gray-500">
          No sub check-ins or photos on this job yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {days.map((d) => (
            <DayCard key={d.checkInId} day={d} />
          ))}
        </ul>
      )}
    </section>
  );
}
