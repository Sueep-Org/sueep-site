"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * On a calendar day: "this request is really a change order". Makes the
 * change order for the day (see /api/erp/schedule/day-assignments/[id]/to-change-order)
 * and can email the person who asked.
 */
export function RequestToChangeOrder({
  dayAssignmentId,
  requestNotes,
  requesterName,
  requesterEmail,
  nextDay,
  nextDayPct,
}: {
  dayAssignmentId: string;
  requestNotes: string | null;
  requesterName: string | null;
  requesterEmail: string | null;
  nextDay: boolean;
  nextDayPct: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [notify, setNotify] = useState(!!requesterEmail);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<string | null>(null);

  if (done) return <p className="mt-1.5 rounded bg-emerald-50 px-1.5 py-1 text-[10px] text-emerald-800">{done}</p>;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setTitle((requestNotes ?? "").split("\n")[0]!.replace(/^Requested by .*? via project portal:?\s*/i, "").slice(0, 80));
          setOpen(true);
        }}
        className="mt-1.5 text-[10px] font-medium text-pink-600 hover:underline"
      >
        Not in the contract? Turn into a change order
      </button>
    );
  }

  async function save() {
    if (!title.trim()) {
      setError("Give it a title");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/erp/schedule/day-assignments/${dayAssignmentId}/to-change-order`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: title.trim(), price: price.trim() || null, notify, message: message.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; emailed?: boolean };
      if (!res.ok) {
        setError(data.error || "Couldn't make the change order");
        return;
      }
      setDone(
        `Change order "${title.trim()}" added to this day${notify ? (data.emailed ? `, ${requesterName || requesterEmail} emailed` : ", but the email didn't send") : ""}.`,
      );
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  const field = "mt-0.5 w-full rounded border border-gray-300 bg-white px-1.5 py-1 text-xs text-gray-800 focus:border-pink-400 focus:outline-none";
  return (
    <div className="mt-1.5 space-y-1.5 rounded border border-pink-200 bg-pink-50/50 p-1.5">
      <p className="text-[10px] font-medium text-gray-700">Turn this request into a change order</p>
      <label className="block text-[9px] text-gray-500">
        Title *
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className={field} placeholder="Extra clean of the 4th floor" />
      </label>
      <label className="block text-[9px] text-gray-500">
        Price (optional, can be set later)
        <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" className={field} placeholder="$" />
        {nextDay ? <span className="mt-0.5 block text-amber-700">Asked for next day: {nextDayPct}% is added on top.</span> : null}
      </label>
      {requesterEmail ? (
        <label className="flex items-start gap-1.5 text-[10px] text-gray-700">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="mt-0.5 accent-pink-600" />
          <span>Email {requesterName || requesterEmail} that it&apos;s a change order</span>
        </label>
      ) : (
        <p className="text-[9px] text-gray-400">Nobody to email: no requester on this day.</p>
      )}
      {notify && requesterEmail ? (
        <label className="block text-[9px] text-gray-500">
          Message to add (optional)
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} className={field} placeholder="This floor was already cleaned on Thursday and Friday…" />
        </label>
      ) : null}
      <p className="text-[9px] text-gray-400">SOV lines come off this day, and the change order goes on it, waiting for their OK.</p>
      {error ? <p className="text-[10px] text-red-600">{error}</p> : null}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={save}
          className="rounded bg-pink-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-pink-500 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Make change order"}
        </button>
        <button type="button" disabled={saving} onClick={() => setOpen(false)} className="text-[10px] text-gray-500 hover:text-gray-700">
          Cancel
        </button>
      </div>
    </div>
  );
}
