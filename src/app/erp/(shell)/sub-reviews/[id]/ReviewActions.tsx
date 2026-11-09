"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, useToast } from "@/app/erp/components/ui";
import { shrinkImage } from "@/lib/shrinkImage";
import { StarInput } from "@/app/erp/components/Stars";
import { RATING_KEYS, RATING_LABELS, type RatingKey } from "@/lib/erp/subScores";

/** Pass or Needs fix for one sub's day (subReviews.ts). */
export function ReviewActions({
  id,
  status,
  canReview,
  turnover,
  areas,
  openFix,
}: {
  id: string;
  status: "PENDING" | "NEEDS_FIX" | "PASSED";
  canReview: boolean;
  turnover: boolean;
  areas: { id: string; label: string }[];
  openFix: { items: string[]; note: string | null } | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [mode, setMode] = useState<"idle" | "pass" | "fix">("idle");
  const [note, setNote] = useState("");
  const [onSite, setOnSite] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [typed, setTyped] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [stars, setStars] = useState<Record<RatingKey, number | null>>({ quality: null, reliability: null, communication: null });
  const rated = RATING_KEYS.every((k) => stars[k] != null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (status === "NEEDS_FIX" && openFix) {
    return (
      <section className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        <p className="font-semibold">Sent back to the sub for fixes</p>
        {openFix.items.length > 0 && <p className="mt-1">{openFix.items.join(", ")}</p>}
        {openFix.note && <p className="mt-1 whitespace-pre-line">{openFix.note}</p>}
        <p className="mt-2 text-xs text-red-800">It comes back here when they send their fix photos.</p>
      </section>
    );
  }
  if (status !== "PENDING") return null;
  if (!canReview) {
    return <p className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600">This is another PM&apos;s day. They, a Business Manager or an Admin can review it.</p>;
  }

  async function pass() {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/erp/sub-reviews/${id}/pass`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ note, onSite, ...stars }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError(((await res?.json().catch(() => null)) as { error?: string } | null)?.error ?? "Couldn't save. Try again.");
    toast("Passed", "success");
    router.refresh();
  }

  async function sendFix() {
    if (!note.trim()) return setError("Say what needs fixing in the note.");
    setBusy(true);
    setError("");
    const form = new FormData();
    const items = turnover ? picked : typed.split("\n").map((s) => s.trim()).filter(Boolean);
    items.forEach((i) => form.append("items", i));
    form.append("note", note);
    if (onSite) form.append("onSite", "1");
    for (const f of files) form.append("files", await shrinkImage(f));
    const res = await fetch(`/api/erp/sub-reviews/${id}/fix`, { method: "POST", body: form }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError(((await res?.json().catch(() => null)) as { error?: string } | null)?.error ?? "Couldn't send. Try again.");
    toast("Sent to the sub", "success");
    router.refresh();
  }

  const onSiteBox = (
    <label className="flex items-center gap-2 text-sm text-gray-700">
      <input type="checkbox" checked={onSite} onChange={(e) => setOnSite(e.target.checked)} className="h-4 w-4 accent-pink-600" />
      I checked this on site (also saves a quality check on the project)
    </label>
  );

  return (
    <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
      {mode === "idle" && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setMode("pass")}>Pass</Button>
          <Button variant="secondary" onClick={() => setMode("fix")}>
            Needs fix
          </Button>
        </div>
      )}

      {mode === "pass" && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-900">Pass this day and rate the sub</p>
          <div className="space-y-1.5">
            {RATING_KEYS.map((k) => (
              <div key={k} className="flex items-center gap-3">
                <span className="w-32 text-sm text-gray-700">{RATING_LABELS[k]}</span>
                <StarInput value={stars[k]} onChange={(v) => setStars((s) => ({ ...s, [k]: v }))} size="md" />
              </div>
            ))}
            <p className="text-[11px] text-gray-400">1 star is poor, 5 is great. Saved to their Ratings and never shown to the sub.</p>
          </div>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Note (optional)" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
          {onSiteBox}
          <div className="flex gap-2">
            <Button disabled={busy || !rated} onClick={() => void pass()}>
              {busy ? "Saving…" : "Pass"}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setMode("idle")}>
              Back
            </Button>
          </div>
        </div>
      )}

      {mode === "fix" && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-900">What needs fixing?</p>
          {turnover ? (
            <div className="grid gap-1.5 sm:grid-cols-2">
              {areas.map((a) => (
                <label key={a.id} className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={picked.includes(a.id)}
                    onChange={(e) => setPicked((p) => (e.target.checked ? [...p, a.id] : p.filter((x) => x !== a.id)))}
                    className="h-4 w-4 accent-pink-600"
                  />
                  {a.label}
                </label>
              ))}
            </div>
          ) : (
            <textarea value={typed} onChange={(e) => setTyped(e.target.value)} rows={3} placeholder="One item per line, e.g. Paint drips on 3rd floor hallway trim" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
          )}
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Note to the sub (required): what's wrong and what done looks like" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
          <label className="block text-sm text-gray-700">
            Photos showing what to fix (optional)
            <input type="file" accept="image/*" multiple onChange={(e) => setFiles([...(e.target.files ?? [])])} className="mt-1 block text-sm" />
          </label>
          {onSiteBox}
          <p className="text-xs text-gray-500">The sub gets this on their jobs page and by email, in their language.</p>
          <div className="flex gap-2">
            <Button disabled={busy} onClick={() => void sendFix()}>
              {busy ? "Sending…" : "Send to the sub"}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setMode("idle")}>
              Back
            </Button>
          </div>
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  );
}
