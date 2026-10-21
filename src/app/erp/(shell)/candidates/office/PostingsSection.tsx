"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, InfoTip, inputClass, useConfirm, useToast } from "@/app/erp/components/ui";
import { HIRING_SOURCES, formatCost, hiringSourceLabel } from "@/lib/erp/officeHiring";

export type PostingRow = {
  id: string;
  source: string;
  costCents: number | null;
  applicantCount: number | null;
  postedAt: string | null;
  notes: string | null;
};

/** Job ads for one opening: where it was posted, what it cost, how many applied. */
export function PostingsSection({ openingId, postings }: { openingId: string; postings: PostingRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [adding, setAdding] = useState(false);
  // Id of the ad being edited in place (one at a time, and never while adding).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const totalCost = postings.reduce((s, p) => s + (p.costCents ?? 0), 0);
  const totalApplicants = postings.reduce((s, p) => s + (p.applicantCount ?? 0), 0);

  function close() {
    setAdding(false);
    setEditingId(null);
    setError("");
  }

  /** Add (no `postingId`) or save an edit. Blank fields clear the value. */
  async function onSubmit(e: React.FormEvent<HTMLFormElement>, postingId?: string) {
    e.preventDefault();
    setError("");
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const res = await fetch(`/api/erp/job-openings/${openingId}/postings${postingId ? `/${postingId}` : ""}`, {
      method: postingId ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source: fd.get("source"),
        cost: fd.get("cost"),
        applicantCount: fd.get("applicantCount"),
        postedAt: fd.get("postedAt"),
        notes: fd.get("notes"),
      }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const j = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
      setError(j?.error || "Could not save");
      return;
    }
    close();
    router.refresh();
  }

  async function onDelete(p: PostingRow) {
    if (!(await confirm({ message: `Remove the ${hiringSourceLabel(p.source)} posting?` }))) return;
    const res = await fetch(`/api/erp/job-openings/${openingId}/postings/${p.id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      toast("Could not remove it", "error");
      return;
    }
    router.refresh();
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2.5">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          Job ads
          <InfoTip text="Where this job was posted, what it cost and how many applied. Used for cost per applicant and cost per hire." />
        </h2>
        {!adding ? (
          <Button size="xs" variant="secondary" onClick={() => { close(); setAdding(true); }}>+ Add ad</Button>
        ) : null}
      </div>

      {postings.length === 0 && !adding ? (
        <p className="px-4 py-4 text-sm text-gray-400">No ads yet.</p>
      ) : null}

      {postings.length > 0 ? (
        <table className="w-full text-left text-sm">
          <thead className="text-[11px] uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2 font-semibold">Source</th>
              <th className="px-4 py-2 font-semibold">Posted</th>
              <th className="px-4 py-2 text-right font-semibold">Cost</th>
              <th className="px-4 py-2 text-right font-semibold">Applicants</th>
              <th className="px-4 py-2 font-semibold">Notes</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {postings.map((p) =>
              editingId === p.id ? (
                <tr key={p.id} className="border-t border-gray-100 bg-pink-50/40">
                  <td colSpan={6} className="p-0">
                    <PostingForm
                      initial={p}
                      saving={saving}
                      error={error}
                      submitLabel="Save"
                      onSubmit={(e) => void onSubmit(e, p.id)}
                      onCancel={close}
                    />
                  </td>
                </tr>
              ) : (
                <tr key={p.id} className="border-t border-gray-100">
                  <td className="px-4 py-2 text-gray-900">{hiringSourceLabel(p.source)}</td>
                  <td className="px-4 py-2 text-gray-600">
                    {p.postedAt ? new Date(p.postedAt).toLocaleDateString("en-US", { timeZone: "UTC" }) : "-"}
                  </td>
                  <td className="px-4 py-2 text-right text-gray-700">{formatCost(p.costCents)}</td>
                  <td className="px-4 py-2 text-right text-gray-700">{p.applicantCount ?? "-"}</td>
                  <td className="px-4 py-2 text-gray-500">{p.notes || ""}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => { close(); setEditingId(p.id); }}
                      className="mr-2 text-xs text-pink-600 hover:underline"
                    >
                      Edit
                    </button>
                    <button type="button" onClick={() => void onDelete(p)} aria-label="Remove ad" className="text-gray-400 hover:text-red-500">
                      ✕
                    </button>
                  </td>
                </tr>
              ),
            )}
            {postings.length > 1 ? (
              <tr className="border-t border-gray-200 font-medium">
                <td className="px-4 py-2 text-gray-700" colSpan={2}>Total</td>
                <td className="px-4 py-2 text-right text-gray-900">{formatCost(totalCost)}</td>
                <td className="px-4 py-2 text-right text-gray-900">{totalApplicants}</td>
                <td colSpan={2} />
              </tr>
            ) : null}
          </tbody>
        </table>
      ) : null}

      {adding ? (
        <div className="border-t border-gray-100">
          <PostingForm saving={saving} error={error} submitLabel="Add" onSubmit={(e) => void onSubmit(e)} onCancel={close} />
        </div>
      ) : null}
    </section>
  );
}

/** The ad fields, used for both adding and editing. Edits start from `initial`. */
function PostingForm({
  initial,
  saving,
  error,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: PostingRow;
  saving: boolean;
  error: string;
  submitLabel: string;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  return (
    <form onSubmit={onSubmit} className="grid gap-2 px-4 py-3 sm:grid-cols-6">
      <select name="source" required defaultValue={initial?.source ?? ""} aria-label="Source" className={inputClass.xs}>
        <option value="" disabled>Source…</option>
        {HIRING_SOURCES.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>
      <input name="postedAt" type="date" defaultValue={initial?.postedAt?.slice(0, 10) ?? ""} aria-label="Posted date" className={inputClass.xs} />
      <input
        name="cost"
        inputMode="decimal"
        defaultValue={initial?.costCents != null ? String(initial.costCents / 100) : ""}
        placeholder="Cost ($)"
        aria-label="Cost"
        className={inputClass.xs}
      />
      <input
        name="applicantCount"
        inputMode="numeric"
        defaultValue={initial?.applicantCount != null ? String(initial.applicantCount) : ""}
        placeholder="Applicants"
        aria-label="Applicants"
        className={inputClass.xs}
      />
      <input name="notes" defaultValue={initial?.notes ?? ""} placeholder="Notes" aria-label="Notes" className={inputClass.xs} />
      <div className="flex gap-2">
        <Button size="xs" type="submit" disabled={saving}>{saving ? "Saving…" : submitLabel}</Button>
        <Button size="xs" variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
      {error ? <p className="text-xs text-red-500 sm:col-span-6">{error}</p> : null}
    </form>
  );
}
