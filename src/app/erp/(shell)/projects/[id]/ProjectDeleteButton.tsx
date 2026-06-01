"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ProjectDeleteButton({ projectId, jobTitle }: { projectId: string; jobTitle: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const confirmed = typed.trim().toLowerCase() === "delete";

  async function handleDelete() {
    if (!confirmed) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/erp/projects/${projectId}`, { method: "DELETE" });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setError(d.error || "Delete failed");
        setLoading(false);
        return;
      }
      router.push("/erp/projects");
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
        Delete project
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={onClose}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Warning icon */}
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>

            <h2 className="mt-4 text-lg font-semibold text-gray-900">Delete entire project?</h2>

            <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2">
              <p className="text-sm font-medium text-red-800">{jobTitle}</p>
            </div>

            <p className="mt-3 text-sm text-gray-600">
              This will permanently delete the project and <strong>all associated data</strong> — labor entries, materials, change orders, contracts, checklists, and work order records. This cannot be undone.
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
              onKeyDown={(e) => { if (e.key === "Enter" && confirmed) handleDelete(); }}
              autoFocus
            />

            {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

            <div className="mt-5 flex gap-3">
              <button
                onClick={handleDelete}
                disabled={!confirmed || loading}
                className="flex-1 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40"
              >
                {loading ? "Deleting…" : "Yes, delete project"}
              </button>
              <button
                onClick={onClose}
                disabled={loading}
                className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
