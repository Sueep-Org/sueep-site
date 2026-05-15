"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const STATUSES = [
  "NEW",
  "SELECTED",
  "QUESTIONNAIRE_SENT",
  "QUESTIONNAIRE_COMPLETE",
  "CONTACTED",
  "INTERVIEW",
  "OFFER",
  "HIRED",
  "DECLINED",
] as const;

export type CandidateApplicationRow = {
  id: string;
  status: string;
  internalNotes: string | null;
};

export function CandidateApplicationEditor({ initial }: { initial: CandidateApplicationRow }) {
  const router = useRouter();
  const [status, setStatus] = useState(initial.status);
  const [internalNotes, setInternalNotes] = useState(initial.internalNotes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    setSavedFlash(false);
    const res = await fetch(`/api/erp/candidates/${initial.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, internalNotes }),
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
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-5 space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Pipeline</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="status" className="block text-xs font-medium text-zinc-400 mb-1">
            Status
          </label>
          <select
            id="status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-[#E73C6E] focus:outline-none focus:ring-1 focus:ring-[#E73C6E]"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="internalNotes" className="block text-xs font-medium text-zinc-400 mb-1">
          Internal notes (not visible to applicant)
        </label>
        <textarea
          id="internalNotes"
          value={internalNotes}
          onChange={(e) => setInternalNotes(e.target.value)}
          rows={4}
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-[#E73C6E] focus:outline-none focus:ring-1 focus:ring-[#E73C6E]"
          placeholder="Interview feedback, background check, next steps…"
        />
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {savedFlash && <p className="text-sm text-emerald-400">Saved.</p>}
      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="rounded-md bg-[#E73C6E] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save changes"}
      </button>
    </div>
  );
}