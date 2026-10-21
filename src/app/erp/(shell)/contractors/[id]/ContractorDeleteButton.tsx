"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Modal } from "@/app/erp/components/ui";

/** Top-right "Delete contractor", same type-delete-to-confirm window as Delete project. */
export function ContractorDeleteButton({
  contractorId,
  name,
  impact,
}: {
  contractorId: string;
  name: string;
  /** What deleting also removes, spelled out since jobs carry their costs */
  impact: { jobs: number; scheduledDays: number; documents: number };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const confirmed = typed.trim().toLowerCase() === "delete";
  const lost = [
    impact.jobs && `${impact.jobs} job assignment${impact.jobs === 1 ? "" : "s"} and their costs`,
    impact.scheduledDays && `${impact.scheduledDays} scheduled day${impact.scheduledDays === 1 ? "" : "s"}`,
    impact.documents && `${impact.documents} document${impact.documents === 1 ? "" : "s"}`,
  ].filter(Boolean);

  async function handleDelete() {
    if (!confirmed) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/erp/contractors/${contractorId}`, { method: "DELETE" });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setError(d.error || "Delete failed");
        setLoading(false);
        return;
      }
      router.push("/erp/contractors");
      router.refresh();
    } catch {
      setError("Network error");
      setLoading(false);
    }
  }

  function onClose() {
    if (loading) return;
    setOpen(false);
    setTyped("");
    setError("");
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
      >
        Delete contractor
      </button>

      <Modal open={open} onClose={onClose} size="md">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
          <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>

        <h2 className="mt-4 text-lg font-semibold text-gray-900">Delete this contractor?</h2>

        <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2">
          <p className="text-sm font-medium text-red-800">{name}</p>
        </div>

        <p className="mt-3 text-sm text-gray-600">
          This permanently deletes the contractor
          {lost.length ? (
            <>
              {" "}and <strong>{lost.join(", ")}</strong>
            </>
          ) : null}
          . To keep their history, set them Inactive instead. This cannot be undone.
        </p>

        <p className="mt-4 text-xs font-medium text-gray-700">
          To confirm, type <span className="font-bold text-red-600">delete</span> below:
        </p>
        <input
          type="text"
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
          placeholder="delete"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && confirmed) handleDelete();
          }}
          autoFocus
        />

        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

        <div className="mt-5 flex gap-3">
          <button
            onClick={handleDelete}
            disabled={!confirmed || loading}
            className="flex-1 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40"
          >
            {loading ? "Deleting…" : "Yes, delete contractor"}
          </button>
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </Modal>
    </>
  );
}
