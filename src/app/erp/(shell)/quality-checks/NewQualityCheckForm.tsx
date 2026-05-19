"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TurnoverRequestSelect } from "@/app/erp/(shell)/labor-assignments/TurnoverRequestSelect";
import { uploadQualityCheckEvidenceFile } from "@/lib/firebaseStorage";
import { SignaturePadInput } from "./SignaturePadInput";

export function NewQualityCheckForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pmApproval, setPmApproval] = useState(false);
  const [supervisorSignature, setSupervisorSignature] = useState("");
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    setUploadProgress(null);
    const fd = new FormData(e.currentTarget);
    const turnoverRequestId = String(fd.get("turnoverRequestId") || "");

    let evidencePhotos: string[] = [];
    try {
      evidencePhotos = await Promise.all(
        evidenceFiles.map((file, index) =>
          uploadQualityCheckEvidenceFile(`${turnoverRequestId || "new"}-${index + 1}`, file, (pct) => setUploadProgress(pct))
        )
      );
    } catch {
      setError("Failed to upload evidence photo. Please try again.");
      setLoading(false);
      setUploadProgress(null);
      return;
    }

    const payload = {
      turnoverRequestId,
      supervisorName: fd.get("supervisorName"),
      supervisorSignatureUrl: supervisorSignature || null,
      pmApproval,
      evidencePhotos,
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
      setEvidenceFiles([]);
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
            <label className="block text-xs font-medium text-gray-600">
              Supervisor signature
            </label>
            <SignaturePadInput value={supervisorSignature} onChange={setSupervisorSignature} />
          </div>

          <div className="space-y-3">
            <label className="block text-xs font-medium text-gray-600" htmlFor="evidencePhotos">
              Evidence photos
            </label>
            <input
              id="evidencePhotos"
              type="file"
              accept="image/*"
              multiple
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              onChange={(e) => setEvidenceFiles(Array.from(e.target.files ?? []))}
            />
            {evidenceFiles.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-3">
                {evidenceFiles.map((file) => (
                  <div key={`${file.name}-${file.lastModified}`} className="rounded-md border border-gray-200 bg-white p-2 text-xs text-gray-600">
                    <p className="truncate font-medium text-gray-800">{file.name}</p>
                    <p>{Math.round(file.size / 1024)} KB</p>
                  </div>
                ))}
              </div>
            ) : null}
            {uploadProgress !== null ? <p className="text-xs text-gray-500">Uploading evidence: {uploadProgress}%</p> : null}
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
