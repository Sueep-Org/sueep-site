"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, InfoTip, inputClass, labelClass, useConfirm, useToast } from "@/app/erp/components/ui";
import { MAX_UPLOAD_BYTES, shrinkImage } from "@/lib/shrinkImage";
import type { AreaRating, AreaResult } from "@/lib/erp/janitorialQualityShared";

const input = inputClass.md;
const label = labelClass.default;
const card = "space-y-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm";

type Photo = { id: string; area: string | null };
type Values = { areaResults: AreaResult[]; propertyManagerName: string; propertyManagerNotes: string; teamUpdates: string };

const photoUrl = (id: string) => `/api/erp/janitorial/quality-photos/${id}`;

export function QualityCheckForm({
  checkId,
  lastVisit,
  done,
  upcoming,
  usingServiceAreas,
  initial,
  propertyManagerOnFile,
  photos: initialPhotos,
}: {
  checkId: string;
  /** Areas marked Needs attention on the previous finished visit: lowercased area to note */
  lastVisit: { dateLabel: string; flagged: Record<string, string> } | null;
  done: boolean;
  upcoming: boolean;
  /** No key areas saved on the contract yet, so they came from Service areas */
  usingServiceAreas: boolean;
  initial: Values;
  propertyManagerOnFile: string | null;
  photos: Photo[];
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [results, setResults] = useState(initial.areaResults);
  const [pmName, setPmName] = useState(initial.propertyManagerName);
  const [pmNotes, setPmNotes] = useState(initial.propertyManagerNotes);
  const [teamUpdates, setTeamUpdates] = useState(initial.teamUpdates);
  const [photos, setPhotos] = useState(initialPhotos);
  const [uploading, setUploading] = useState(0);
  const [newArea, setNewArea] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);

  // Warn before leaving with unsaved answers (photos save on their own).
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const touch = () => setDirty(true);
  const updateArea = (i: number, patch: Partial<AreaResult>) => {
    setResults((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    touch();
  };

  function addArea() {
    const area = newArea.trim();
    if (!area) return;
    if (results.some((r) => r.area.toLowerCase() === area.toLowerCase())) {
      setError(`"${area}" is already on the list`);
      return;
    }
    setResults((rs) => [...rs, { area, rating: null, note: "" }]);
    setNewArea("");
    setError("");
    touch();
  }

  async function removeArea(i: number) {
    const area = results[i]!.area;
    const ok = await confirm({
      title: `Skip ${area} on this visit?`,
      message: "It's only removed from this check. To change the building's list, edit Key areas on the contract's Quality tab.",
      confirmLabel: "Remove",
    });
    if (!ok) return;
    setResults((rs) => rs.filter((_, j) => j !== i));
    touch();
  }

  async function upload(files: FileList | null, area: string | null) {
    if (!files?.length) return;
    for (const original of Array.from(files)) {
      setUploading((n) => n + 1);
      try {
        const file = await shrinkImage(original);
        if (file.size > MAX_UPLOAD_BYTES) {
          toast(`${original.name} is too large to upload`, "error");
          continue;
        }
        const body = new FormData();
        body.append("file", file);
        if (area) body.append("area", area);
        const res = await fetch(`/api/erp/janitorial/quality-checks/${checkId}/photos`, { method: "POST", body });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast(data.error ?? "Photo upload failed", "error");
          continue;
        }
        setPhotos((ps) => [...ps, { id: data.id, area: data.area }]);
      } catch {
        toast("Photo upload failed", "error");
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  async function removePhoto(id: string) {
    const ok = await confirm({ title: "Delete this photo?", message: "It will be removed from the check.", confirmLabel: "Delete" });
    if (!ok) return;
    const res = await fetch(photoUrl(id), { method: "DELETE" });
    if (!res.ok) {
      toast("Could not delete the photo", "error");
      return;
    }
    setPhotos((ps) => ps.filter((p) => p.id !== id));
  }

  async function save(finish: boolean) {
    setError("");
    if (finish) {
      if (!results.length) return setError("Add at least one area before finishing.");
      const unrated = results.filter((r) => !r.rating);
      if (unrated.length) return setError(`Mark Good or Needs attention for: ${unrated.map((r) => r.area).join(", ")}`);
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/erp/janitorial/quality-checks/${checkId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          areaResults: results,
          propertyManagerName: pmName,
          propertyManagerNotes: pmNotes,
          teamUpdates,
          ...(finish ? { done: true } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not save");
        return;
      }
      setDirty(false);
      if (finish && !done) {
        toast("Quality check done", "success");
        router.push(`/erp/janitorial/quality-checks/${checkId}/summary`);
      } else {
        toast("Saved", "success");
        router.refresh();
      }
    } catch {
      setError("Network error, your answers are still here. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const rated = results.filter((r) => r.rating).length;
  const areaNames = new Set(results.map((r) => r.area.toLowerCase()));
  const generalPhotos = photos.filter((p) => !p.area || !areaNames.has(p.area.toLowerCase()));

  return (
    <div className="space-y-4">
      {upcoming && !done && (
        <p className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-800">This check is scheduled for a later day. You can still fill it out now.</p>
      )}

      <section className={card}>
        <div>
          <h2 className="flex items-center gap-1 text-base font-semibold text-gray-900">
            Key areas
            <InfoTip
              text={
                usingServiceAreas
                  ? "Taken from the contract's Service areas. Set the building's own list under Key areas on the contract's Quality tab."
                  : "The building's key areas, set on the contract's Quality tab. Add an extra one below for just this visit."
              }
            />
          </h2>
          <p className="text-xs text-gray-500">
            {rated} of {results.length} checked
          </p>
        </div>

        {results.length === 0 && <p className="text-sm text-gray-500">No areas yet. Add the areas you checked below.</p>}

        <ul className="space-y-3">
          {results.map((r, i) => (
            <AreaCard
              key={r.area}
              result={r}
              lastVisit={lastVisit && r.area.toLowerCase() in lastVisit.flagged ? { dateLabel: lastVisit.dateLabel, note: lastVisit.flagged[r.area.toLowerCase()]! } : null}
              photos={photos.filter((p) => p.area?.toLowerCase() === r.area.toLowerCase())}
              onRate={(rating) => updateArea(i, { rating: r.rating === rating ? null : rating })}
              onNote={(note) => updateArea(i, { note })}
              onRemove={() => removeArea(i)}
              onUpload={(files) => upload(files, r.area)}
              onRemovePhoto={removePhoto}
            />
          ))}
        </ul>

        <div className="flex gap-2">
          <input
            type="text"
            value={newArea}
            onChange={(e) => setNewArea(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addArea();
              }
            }}
            placeholder="Add an area, e.g. Elevator"
            aria-label="New area"
            className={`${input} mt-0`}
          />
          <Button variant="secondary" onClick={addArea} disabled={!newArea.trim()}>
            Add
          </Button>
        </div>
      </section>

      <section className={card}>
        <h2 className="text-base font-semibold text-gray-900">Property manager</h2>
        <div>
          <label className={label} htmlFor="qc-pm-name">Who did you speak with?</label>
          <input
            id="qc-pm-name"
            type="text"
            value={pmName}
            onChange={(e) => {
              setPmName(e.target.value);
              touch();
            }}
            placeholder={propertyManagerOnFile ? `e.g. ${propertyManagerOnFile}` : "Name"}
            className={input}
          />
          {propertyManagerOnFile && !pmName && (
            <button
              type="button"
              onClick={() => {
                setPmName(propertyManagerOnFile);
                touch();
              }}
              className="mt-1 text-xs text-pink-600 hover:underline"
            >
              Use {propertyManagerOnFile}
            </button>
          )}
        </div>
        <div>
          <label className={label} htmlFor="qc-pm-notes">What was discussed? Any requests or complaints?</label>
          <textarea
            id="qc-pm-notes"
            rows={4}
            value={pmNotes}
            onChange={(e) => {
              setPmNotes(e.target.value);
              touch();
            }}
            className={input}
          />
        </div>
      </section>

      <section className={card}>
        <h2 className="flex items-center gap-1 text-base font-semibold text-gray-900">
          Team updates
          <InfoTip text="Updates for the janitorial team: supplies needed, staffing, praise, issues to fix." />
        </h2>
        <textarea
          id="qc-team"
          aria-label="Team updates"
          rows={4}
          value={teamUpdates}
          onChange={(e) => {
            setTeamUpdates(e.target.value);
            touch();
          }}
          className={`${input} mt-0`}
        />
      </section>

      <section className={card}>
        <h2 className="text-base font-semibold text-gray-900">Other photos</h2>
        <PhotoStrip photos={generalPhotos} onUpload={(files) => upload(files, null)} onRemove={removePhoto} />
      </section>

      <div className="sticky bottom-0 z-20 -mx-4 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border sm:shadow-md">
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1 text-xs">
            {error ? (
              <p className="text-red-600">{error}</p>
            ) : uploading > 0 ? (
              <p className="text-gray-500">Uploading {uploading} photo{uploading === 1 ? "" : "s"}…</p>
            ) : (
              <p className="text-gray-500">
                {rated} of {results.length} areas checked{dirty ? ", not saved" : ""}
              </p>
            )}
          </div>
          {done ? (
            <Button disabled={saving || uploading > 0} onClick={() => save(true)}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          ) : (
            <>
              <Button variant="secondary" disabled={saving || uploading > 0} onClick={() => save(false)}>
                Save draft
              </Button>
              <Button disabled={saving || uploading > 0} onClick={() => save(true)}>
                {saving ? "Saving…" : "Finish check"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function AreaCard({
  result,
  lastVisit,
  photos,
  onRate,
  onNote,
  onRemove,
  onUpload,
  onRemovePhoto,
}: {
  result: AreaResult;
  lastVisit: { dateLabel: string; note: string } | null;
  photos: Photo[];
  onRate: (rating: AreaRating) => void;
  onNote: (note: string) => void;
  onRemove: () => void;
  onUpload: (files: FileList | null) => void;
  onRemovePhoto: (id: string) => void;
}) {
  const [showNote, setShowNote] = useState(!!result.note);
  const attention = result.rating === "NEEDS_ATTENTION";
  const option = (rating: AreaRating, text: string, on: string) => (
    <button
      type="button"
      onClick={() => onRate(rating)}
      aria-pressed={result.rating === rating}
      className={`flex-1 rounded-md border px-3 py-2.5 text-sm font-semibold ${
        result.rating === rating ? on : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
      }`}
    >
      {text}
    </button>
  );

  return (
    <li className={`space-y-2 rounded-md border p-3 ${attention ? "border-amber-300 bg-amber-50/40" : "border-gray-200"}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-gray-900">{result.area}</p>
        <button type="button" onClick={onRemove} className="text-xs text-gray-400 hover:text-red-600" aria-label={`Remove ${result.area}`}>
          Remove
        </button>
      </div>
      {lastVisit && (
        <p className="rounded bg-amber-100 px-2 py-1 text-xs text-amber-900">
          Needed attention on {lastVisit.dateLabel}
          {lastVisit.note ? `: ${lastVisit.note}` : ""}. Is it fixed?
        </p>
      )}
      <div className="flex gap-2">
        {option("GOOD", "Good", "border-emerald-600 bg-emerald-600 text-white")}
        {option("NEEDS_ATTENTION", "Needs attention", "border-amber-500 bg-amber-500 text-white")}
      </div>
      {showNote || attention ? (
        <textarea
          rows={2}
          value={result.note}
          onChange={(e) => onNote(e.target.value)}
          placeholder={attention ? "What needs attention?" : "Note"}
          aria-label={`${result.area} note`}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
        />
      ) : (
        <button type="button" onClick={() => setShowNote(true)} className="text-xs text-pink-600 hover:underline">
          Add note
        </button>
      )}
      <PhotoStrip photos={photos} onUpload={onUpload} onRemove={onRemovePhoto} />
    </li>
  );
}

function PhotoStrip({ photos, onUpload, onRemove }: { photos: Photo[]; onUpload: (files: FileList | null) => void; onRemove: (id: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {photos.map((p) => (
        <div key={p.id} className="relative">
          <a href={photoUrl(p.id)} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl(p.id)} alt="" className="h-16 w-16 rounded-md border border-gray-200 object-cover" />
          </a>
          <button
            type="button"
            onClick={() => onRemove(p.id)}
            aria-label="Delete photo"
            className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-gray-800 text-xs text-white"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="flex h-16 w-16 flex-col items-center justify-center rounded-md border border-dashed border-gray-300 text-xs text-gray-500 hover:border-pink-400 hover:text-pink-600"
      >
        <span className="text-lg leading-none">+</span>
        Photo
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          onUpload(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
