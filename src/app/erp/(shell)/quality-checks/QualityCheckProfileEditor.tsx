"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TurnoverRequestSelect } from "./TurnoverRequestSelect";
import { uploadQualityCheckEvidenceFile } from "@/lib/firebaseStorage";
import { SignaturePadInput } from "./SignaturePadInput";

type Props = {
  checkId: string;
  initial: {
    turnoverRequestId: string | null;
    projectId: string | null;
    projectName: string | null;
    supervisorName: string;
    supervisorSignatureUrl: string | null;
    pmApproval: boolean;
    evidencePhotos: string[];
    notes: string | null;
  };
};

export function QualityCheckProfileEditor({ checkId, initial }: Props) {
  const router = useRouter();
  const [supervisorName, setSupervisorName] = useState(initial.supervisorName);
  const [supervisorSignatureUrl, setSupervisorSignatureUrl] = useState(initial.supervisorSignatureUrl ?? "");
  const [pmApproval, setPmApproval] = useState(initial.pmApproval);
  const [evidencePhotos, setEvidencePhotos] = useState(initial.evidencePhotos);
  const [newEvidenceFiles, setNewEvidenceFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    setUploadProgress(null);

    let uploadedEvidence: string[] = [];
    try {
      uploadedEvidence = await Promise.all(
        newEvidenceFiles.map((file, index) =>
          uploadQualityCheckEvidenceFile(`${checkId}-${index + 1}`, file, (pct) => setUploadProgress(pct))
        )
      );
    } catch {
      setError("Failed to upload evidence photo. Please try again.");
      setLoading(false);
      setUploadProgress(null);
      return;
    }

    const payload = {
      ...(initial.turnoverRequestId ? { turnoverRequestId: initial.turnoverRequestId } : {}),
      ...(initial.projectId ? { projectId: initial.projectId } : {}),
      supervisorName,
      supervisorSignatureUrl: supervisorSignatureUrl || null,
      pmApproval,
      evidencePhotos: [...evidencePhotos, ...uploadedEvidence],
      notes: notes || null,
    };

    try {
      const res = await fetch(`/api/erp/quality-checks/${checkId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save quality check");
      } else {
        setEvidencePhotos(payload.evidencePhotos);
        setNewEvidenceFiles([]);
        setSuccess("Saved successfully.");
        router.refresh();
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-gray-800">Quality check details</h2>
      <form onSubmit={onSubmit} className="mt-4 space-y-4">
        {initial.turnoverRequestId ? (
          <TurnoverRequestSelect value={initial.turnoverRequestId} required disabled />
        ) : (
          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-600">Project</label>
            <div className="mt-1 w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
              {initial.projectName ?? "—"}
            </div>
          </div>
        )}

        <label className="block text-xs font-medium text-gray-600">
          Supervisor name
          <input
            value={supervisorName}
            onChange={(e) => setSupervisorName(e.target.value)}
            required
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
          />
        </label>

        <div className="space-y-3">
          <label className="block text-xs font-medium text-gray-600">
            Supervisor signature
          </label>
          <SignaturePadInput value={supervisorSignatureUrl} onChange={setSupervisorSignatureUrl} />
        </div>

        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          <input
            checked={pmApproval}
            onChange={(e) => setPmApproval(e.target.checked)}
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300 text-gray-600"
          />
          PM approval
        </label>

        <div className="space-y-3">
          <label className="block text-xs font-medium text-gray-600" htmlFor="evidencePhotos">
            Evidence photos
          </label>
          {evidencePhotos.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {evidencePhotos.map((url) => (
                <div key={url} className="rounded-md border border-gray-200 bg-gray-50 p-2">
                  <a href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded border border-gray-200 bg-white">
                    <img src={url} alt="Quality check evidence" className="h-36 w-full object-cover" />
                  </a>
                  <button
                    type="button"
                    onClick={() => setEvidencePhotos((prev) => prev.filter((item) => item !== url))}
                    className="mt-2 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:border-gray-400"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-3 text-sm text-gray-500">
              No evidence photos uploaded yet.
            </p>
          )}
          <input
            id="evidencePhotos"
            type="file"
            accept="image/*"
            multiple
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
            onChange={(e) => setNewEvidenceFiles(Array.from(e.target.files ?? []))}
          />
          {newEvidenceFiles.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-3">
              {newEvidenceFiles.map((file) => (
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
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
          />
        </div>

        {error ? <p className="text-xs text-red-500">{error}</p> : null}
        {success ? <p className="text-xs text-emerald-600">{success}</p> : null}

        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-300 disabled:opacity-50"
        >
          {loading ? "Saving…" : "Save quality check"}
        </button>
      </form>
    </section>
  );
}
