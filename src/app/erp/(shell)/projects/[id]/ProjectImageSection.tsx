"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export type ProjectImageRow = {
  id: string;
  createdAt: string;
  imageUrl: string;
  caption: string | null;
  uploadedBy: string | null;
  takenAt: string | null;
};

const input =
  "mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";
const label = "block text-xs font-medium text-zinc-400";

export function ProjectImagesSection({
  projectId,
  initialEntries,
}: {
  projectId: string;
  initialEntries: ProjectImageRow[];
}) {
  const router = useRouter();
  const [entries, setEntries] = useState(initialEntries);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setEntries(initialEntries);
  }, [initialEntries]);

  async function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const fd = new FormData(e.currentTarget);

    try {
      const res = await fetch(`/api/erp/projects/${projectId}/images`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          imageUrl: String(fd.get("imageUrl") || "").trim(),
          caption: String(fd.get("caption") || "").trim() || undefined,
          uploadedBy: String(fd.get("uploadedBy") || "").trim() || undefined,
          takenAt: String(fd.get("takenAt") || "").trim() || undefined,
        }),
      });
      const data = (await res.json()) as ProjectImageRow & { error?: string };
      if (!res.ok) {
        setError(data.error || "Failed to add image");
        setLoading(false);
        return;
      }
      setEntries((prev) => [data, ...prev]);
      e.currentTarget.reset();
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function onSave(id: string, payload: { imageUrl: string; caption: string; uploadedBy: string; takenAt: string }) {
    setSavingId(id);
    setError("");
    try {
      const res = await fetch(`/api/erp/projects/${projectId}/images/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          imageUrl: payload.imageUrl,
          caption: payload.caption || null,
          uploadedBy: payload.uploadedBy || null,
          takenAt: payload.takenAt || null,
        }),
      });
      const data = (await res.json()) as ProjectImageRow & { error?: string };
      if (!res.ok) {
        setError(data.error || "Failed to update image");
        setSavingId(null);
        return;
      }
      setEntries((prev) => prev.map((row) => (row.id === id ? data : row)));
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Project images</h2>
        <div className="mt-4 space-y-3">
          {entries.length === 0 ? (
            <p className="rounded-md border border-dashed border-zinc-800 p-4 text-sm text-zinc-500">
              No project images yet.
            </p>
          ) : (
            entries.map((entry) => (
              <ProjectImageEditor
                key={entry.id}
                row={entry}
                onSave={onSave}
                saving={savingId === entry.id}
              />
            ))
          )}
        </div>
      </div>

      <form onSubmit={onAdd} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Add project image</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-2">
            <label className={label} htmlFor="pi-url">
              Image URL *
            </label>
            <input id="pi-url" name="imageUrl" required className={input} placeholder="https://..." />
          </div>
          <div>
            <label className={label} htmlFor="pi-uploadedBy">
              Added by
            </label>
            <input id="pi-uploadedBy" name="uploadedBy" className={input} placeholder="PM or foreman" />
          </div>
          <div>
            <label className={label} htmlFor="pi-takenAt">
              Date taken
            </label>
            <input id="pi-takenAt" name="takenAt" type="date" className={input} />
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <label className={label} htmlFor="pi-caption">
              Caption
            </label>
            <textarea id="pi-caption" name="caption" rows={2} className={input} placeholder="What this photo shows..." />
          </div>
        </div>
        {error ? (
          <p className="mt-3 text-sm text-red-400" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={loading}
          className="mt-4 rounded-md bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50"
        >
          {loading ? "Saving..." : "Save image"}
        </button>
      </form>
    </div>
  );
}

function ProjectImageEditor({
  row,
  saving,
  onSave,
}: {
  row: ProjectImageRow;
  saving: boolean;
  onSave: (id: string, payload: { imageUrl: string; caption: string; uploadedBy: string; takenAt: string }) => void;
}) {
  const [imageUrl, setImageUrl] = useState(row.imageUrl);
  const [caption, setCaption] = useState(row.caption || "");
  const [uploadedBy, setUploadedBy] = useState(row.uploadedBy || "");
  const [takenAt, setTakenAt] = useState(row.takenAt ? row.takenAt.slice(0, 10) : "");

  useEffect(() => {
    setImageUrl(row.imageUrl);
    setCaption(row.caption || "");
    setUploadedBy(row.uploadedBy || "");
    setTakenAt(row.takenAt ? row.takenAt.slice(0, 10) : "");
  }, [row]);

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/40 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={label} htmlFor={`img-url-${row.id}`}>
            Image URL
          </label>
          <input
            id={`img-url-${row.id}`}
            className={input}
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={label} htmlFor={`img-caption-${row.id}`}>
            Caption
          </label>
          <textarea
            id={`img-caption-${row.id}`}
            className={input}
            rows={2}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
          />
        </div>
        <div>
          <label className={label} htmlFor={`img-by-${row.id}`}>
            Added by
          </label>
          <input
            id={`img-by-${row.id}`}
            className={input}
            value={uploadedBy}
            onChange={(e) => setUploadedBy(e.target.value)}
          />
        </div>
        <div>
          <label className={label} htmlFor={`img-date-${row.id}`}>
            Date taken
          </label>
          <input
            id={`img-date-${row.id}`}
            type="date"
            className={input}
            value={takenAt}
            onChange={(e) => setTakenAt(e.target.value)}
          />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <a href={imageUrl} target="_blank" rel="noreferrer" className="text-sm text-pink-400 hover:underline">
          Open image
        </a>
        <button
          type="button"
          disabled={saving}
          onClick={() => onSave(row.id, { imageUrl: imageUrl.trim(), caption: caption.trim(), uploadedBy: uploadedBy.trim(), takenAt })}
          className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save changes"}
        </button>
      </div>
    </div>
  );
}