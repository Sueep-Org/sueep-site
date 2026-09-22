"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useConfirm, useToast } from "@/app/erp/components/ui";

const STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "NOT_A_FIT"] as const;

export type FranchiseInquiryRow = {
  id: string;
  status: string;
  internalNotes: string | null;
};

export function FranchiseInquiryEditor({ initial }: { initial: FranchiseInquiryRow }) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const [status, setStatus] = useState(initial.status);
  const [internalNotes, setInternalNotes] = useState(initial.internalNotes ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  async function deleteInquiry() {
    if (!(await confirm({ message: "Delete this franchise inquiry? This cannot be undone." }))) return;
    setDeleting(true);
    setError(null);
    const res = await fetch(`/api/erp/franchise/${initial.id}`, { method: "DELETE" });
    setDeleting(false);
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      toast(j.error || res.statusText, "error");
      return;
    }
    router.push("/erp/franchise");
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSavedFlash(false);
    const res = await fetch(`/api/erp/franchise/${initial.id}`, {
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

      <div>
        <label htmlFor="internalNotes" className="block text-xs font-medium text-pink-500 mb-1">
          Internal notes (not visible to the applicant)
        </label>
        <textarea
          id="internalNotes"
          value={internalNotes}
          onChange={(e) => setInternalNotes(e.target.value)}
          rows={4}
          className="w-full rounded-md border border-gray-300 bg-gray-200 px-3 py-2 text-sm text-zinc-600 placeholder:text-zinc-400 focus:border-[#E73C6E] focus:outline-none focus:ring-1 focus:ring-[#E73C6E]"
          placeholder="Call notes, qualification decision, next steps…"
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
          onClick={() => void deleteInquiry()}
          disabled={saving || deleting}
          className="rounded-md border border-red-700 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-900/30 disabled:opacity-50"
        >
          {deleting ? "Deleting…" : "Delete inquiry"}
        </button>
      </div>
    </div>
  );
}
