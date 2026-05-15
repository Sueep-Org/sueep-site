"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const STATUSES = [
  "APPLIED",
  "INTERVIEWING",
  "ONBOARDING",
  "DENIED",
] as const;

type PaperworkItem = { label: string; url: string };

export type CandidateApplicationRow = {
  id: string;
  status: string;
  internalNotes: string | null;
  paperwork: PaperworkItem[] | null;
};

export function CandidateApplicationEditor({ initial }: { initial: CandidateApplicationRow }) {
  const router = useRouter();
  const [status, setStatus] = useState(initial.status);
  const [internalNotes, setInternalNotes] = useState(initial.internalNotes ?? "");
  const [paperwork, setPaperwork] = useState<PaperworkItem[]>(initial.paperwork ?? []);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  function addItem() {
    setPaperwork((prev) => [...prev, { label: "", url: "" }]);
  }

  function removeItem(i: number) {
    setPaperwork((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateItem(i: number, field: keyof PaperworkItem, value: string) {
    setPaperwork((prev) => prev.map((item, idx) => (idx === i ? { ...item, [field]: value } : item)));
  }

  async function deletCandidate() {
    if (!window.confirm("Delete this candidate? This cannot be undone.")) return;
    setDeleting(true);
    setError(null);
    const res = await fetch(`/api/erp/candidates/${initial.id}`, { method: "DELETE" });
    setDeleting(false);
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setError(j.error || res.statusText);
      return;
    }
    router.push("/erp/candidates");
  }

  async function save() {
    if (status === "ONBOARDING" && paperwork.length === 0) {
      setError("Add at least one paperwork item before setting status to Onboarding.");
      return;
    }
    const incomplete = paperwork.find((p) => !p.label.trim());
    if (incomplete) {
      setError("Each paperwork item needs a name.");
      return;
    }

    setSaving(true);
    setError(null);
    setSavedFlash(false);
    const res = await fetch(`/api/erp/candidates/${initial.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, internalNotes, paperwork }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setError(j.error || res.statusText);
      return;
    }
    setSavedFlash(true);
    router.refresh();
    setTimeout(() => setSavedFlash(false), 2000);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="status" className="block text-xs font-medium text-pink-500 mb-1">
            Status
          </label>
          <select
            id="status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full rounded-md border border-gray-300 bg-gray-200 px-3 py-2 text-sm text-pink-400 focus:border-[#E73C6E] focus:outline-none focus:ring-1 focus:ring-[#E73C6E]"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {status === "ONBOARDING" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-medium text-pink-500">
              Paperwork required
            </label>
            <button
              type="button"
              onClick={addItem}
              className="text-xs text-[#E73C6E] hover:underline"
            >
              + Add item
            </button>
          </div>
          {paperwork.length === 0 && (
            <p className="text-xs text-gray-400">No paperwork items yet. Add at least one.</p>
          )}
          {paperwork.map((item, i) => (
            <div key={i} className="flex gap-2 items-start">
              <input
                type="text"
                placeholder="Document name (e.g. I-9)"
                value={item.label}
                onChange={(e) => updateItem(i, "label", e.target.value)}
                className="flex-1 rounded-md border border-gray-300 bg-gray-200 px-3 py-1.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-[#E73C6E] focus:outline-none focus:ring-1 focus:ring-[#E73C6E]"
              />
              <input
                type="url"
                placeholder="Upload link"
                value={item.url}
                onChange={(e) => updateItem(i, "url", e.target.value)}
                className="flex-1 rounded-md border border-gray-300 bg-gray-200 px-3 py-1.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-[#E73C6E] focus:outline-none focus:ring-1 focus:ring-[#E73C6E]"
              />
              <button
                type="button"
                onClick={() => removeItem(i)}
                className="text-gray-400 hover:text-red-500 px-1 py-1.5 text-sm"
                aria-label="Remove"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div>
        <label htmlFor="internalNotes" className="block text-xs font-medium text-pink-500 mb-1">
          Internal notes (not visible to applicant)
        </label>
        <textarea
          id="internalNotes"
          value={internalNotes}
          onChange={(e) => setInternalNotes(e.target.value)}
          rows={4}
          className="w-full rounded-md border border-gray-300 bg-gray-200 px-3 py-2 text-sm text-zinc-600 placeholder:text-zinc-400 focus:border-[#E73C6E] focus:outline-none focus:ring-1 focus:ring-[#E73C6E]"
          placeholder="Interview feedback, background check, next steps…"
        />
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      {savedFlash && <p className="text-sm text-emerald-500">Saved.</p>}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || deleting}
          className="rounded-md bg-[#E73C6E] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={() => void deletCandidate()}
          disabled={saving || deleting}
          className="rounded-md border border-red-700 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-900/30 disabled:opacity-50"
        >
          {deleting ? "Deleting…" : "Delete candidate"}
        </button>
      </div>
    </div>
  );
}
