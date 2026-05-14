"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TurnoverRequestSelect } from "@/app/erp/(shell)/labor-assignments/TurnoverRequestSelect";

export function NewQualityCheckForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pmApproval, setPmApproval] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const fd = new FormData(e.currentTarget);

    const payload = {
      turnoverRequestId: fd.get("turnoverRequestId"),
      supervisorName: fd.get("supervisorName"),
      supervisorSignatureUrl: fd.get("supervisorSignatureUrl") || null,
      pmApproval,
      evidencePhotos: String(fd.get("evidencePhotos") || "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
      notes: fd.get("notes") || null,
    };

    try {
      const res = await fetch("/api/erp/quality-checks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create quality check");
        setLoading(false);
        return;
      }
      setOpen(false);
      if (data.id) router.push(`/erp/quality-checks/${data.id}`);
      else router.refresh();
    } catch {
      setError("Network error");
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="rounded-md bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-500"
      >
        {open ? "Close" : "New quality check"}
      </button>

      {open ? (
        <form onSubmit={onSubmit} className="mt-3 space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <TurnoverRequestSelect required />
            <label className="block text-xs font-medium text-gray-600">
              Supervisor name
              <input
                name="supervisorName"
                required
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                placeholder="Supervisor name"
              />
            </label>
            <label className="block text-xs font-medium text-gray-600">
              Supervisor signature URL
              <input
                name="supervisorSignatureUrl"
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                placeholder="https://.../signature.png"
              />
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={pmApproval}
                onChange={(e) => setPmApproval(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-pink-600"
              />
              PM approval
            </label>
          </div>

          <div className="space-y-3">
            <label className="block text-xs font-medium text-gray-600" htmlFor="evidencePhotos">
              Evidence photo URLs (one per line)
            </label>
            <textarea
              id="evidencePhotos"
              name="evidencePhotos"
              rows={4}
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              placeholder="https://.../photo1.jpg\nhttps://.../photo2.jpg"
            />
          </div>

          <div className="space-y-3">
            <label className="block text-xs font-medium text-gray-600" htmlFor="notes">
              Notes
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={4}
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              placeholder="Inspection comments, issues found, follow-up items..."
            />
          </div>

          {error ? <p className="text-xs text-red-500">{error}</p> : null}

          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-pink-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pink-500 disabled:opacity-50"
          >
            {loading ? "Saving…" : "Create quality check"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
