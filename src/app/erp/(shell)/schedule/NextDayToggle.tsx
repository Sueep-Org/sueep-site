"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/app/erp/components/ui";

/** "Next day" checkbox on a calendar day (roles that see prices). See /api/erp/schedule/day-assignments/[id]/next-day. */
export function NextDayToggle({
  dayAssignmentId,
  on,
  pct,
  onChanged,
}: {
  dayAssignmentId: string;
  on: boolean;
  pct: number;
  onChanged: (on: boolean) => void;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  async function toggle(next: boolean) {
    if (
      !(await confirm({
        title: next ? "Mark this day Next day?" : "Take Next day off this day?",
        message: next
          ? `A ${pct}% next day upcharge is added: a "Next day surcharge" change order for each SOV line on the day, and ${pct}% on each change order on it.`
          : "Its next day surcharge change orders are voided (unless already billed). Change orders that already got the upcharge keep their price; change it on the change order if needed.",
        confirmLabel: next ? "Mark Next day" : "Take it off",
        danger: false,
      }))
    )
      return;
    setBusy(true);
    setError("");
    setNote("");
    try {
      const res = await fetch(`/api/erp/schedule/day-assignments/${dayAssignmentId}/next-day`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ on: next }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; created?: string[]; voided?: string[]; upcharged?: string[] };
      if (!res.ok) {
        setError(data.error || "Couldn't save");
        return;
      }
      const bits = [
        data.created?.length ? `${data.created.length} surcharge change order${data.created.length === 1 ? "" : "s"} added` : null,
        data.upcharged?.length ? `${pct}% added to ${data.upcharged.length} change order${data.upcharged.length === 1 ? "" : "s"}` : null,
        data.voided?.length ? `${data.voided.length} surcharge change order${data.voided.length === 1 ? "" : "s"} voided` : null,
      ].filter(Boolean);
      setNote(bits.length ? bits.join(", ") : next ? "Surcharge is added when you assign an SOV line or change order." : "");
      onChanged(next);
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-1.5">
      <label className="flex items-center gap-1.5 text-[10px] text-gray-700">
        <input type="checkbox" checked={on} disabled={busy} onChange={(e) => toggle(e.target.checked)} className="accent-amber-600" />
        <span>
          <span className="font-semibold text-amber-800">Next day</span> ({pct}% upcharge: asked for today or tomorrow)
        </span>
      </label>
      {note ? <p className="mt-0.5 text-[9px] text-gray-500">{note}</p> : null}
      {error ? <p className="mt-0.5 text-[9px] text-red-600">{error}</p> : null}
    </div>
  );
}
