"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TurnoverRequestSelect } from "@/app/erp/(shell)/labor-assignments/TurnoverRequestSelect";

type Props = {
  checkId: string;
  initial: {
    turnoverRequestId: string;
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
  const [evidencePhotos, setEvidencePhotos] = useState(initial.evidencePhotos.join("\n"));
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    const payload = {
      turnoverRequestId: initial.turnoverRequestId,
      supervisorName,
      supervisorSignatureUrl: supervisorSignatureUrl || null,
      pmApproval,
      evidencePhotos: evidencePhotos
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
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
        <TurnoverRequestSelect value={initial.turnoverRequestId} required disabled />

        <label className="block text-xs font-medium text-gray-600">
          Supervisor name
          <input
            value={supervisorName}
            onChange={(e) => setSupervisorName(e.target.value)}
            required
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
          />
        </label>

        <label className="block text-xs font-medium text-gray-600">
          Supervisor signature URL
          <input
            value={supervisorSignatureUrl}
            onChange={(e) => setSupervisorSignatureUrl(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
          />
        </label>

        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          <input
            checked={pmApproval}
            onChange={(e) => setPmApproval(e.target.checked)}
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300 text-pink-600"
          />
          PM approval
        </label>

        <div className="space-y-3">
          <label className="block text-xs font-medium text-gray-600" htmlFor="evidencePhotos">
            Evidence photo URLs (one per line)
          </label>
          <textarea
            id="evidencePhotos"
            value={evidencePhotos}
            onChange={(e) => setEvidencePhotos(e.target.value)}
            rows={4}
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
          />
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
          className="rounded-md bg-pink-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pink-500 disabled:opacity-50"
        >
          {loading ? "Saving…" : "Save quality check"}
        </button>
      </form>
    </section>
  );
}
