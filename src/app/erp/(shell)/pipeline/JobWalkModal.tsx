"use client";

import { useState } from "react";
import { Button, InfoTip, Modal, inputClass, labelClass } from "@/app/erp/components/ui";
import type { BoardCard } from "@/lib/erp/pipelineBoard";

const LENGTHS = [
  { value: 30, label: "30 min" },
  { value: 60, label: "1 hour" },
  { value: 90, label: "1.5 hours" },
  { value: 120, label: "2 hours" },
];

/** Book a job walk: a HubSpot meeting on the deal plus Job Walk Date. `onSaved` gets the walk's day. */
export function JobWalkModal({
  card,
  pipeline,
  today,
  onClose,
  onSaved,
}: {
  card: BoardCard;
  pipeline: "post-con" | "janitorial";
  today: string;
  onClose: () => void;
  onSaved: (day: string) => void;
}) {
  const [day, setDay] = useState(card.walkDate && card.walkDate >= today ? card.walkDate : "");
  const [time, setTime] = useState("10:00");
  const [minutes, setMinutes] = useState(60);
  const [title, setTitle] = useState(`Job walk: ${card.name}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/erp/pipeline/deals/${card.id}/walk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipeline, day, time, minutes, title }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok || !data || data.error) return setError(data?.error ?? "Couldn't book. Try again.");
      onSaved(day);
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} dismissible={!busy} size="sm">
      <form
        className="space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div>
          <h2 className="flex items-center gap-1 text-base font-semibold text-gray-900">
            Book job walk
            <InfoTip text="Logs a meeting on this deal in HubSpot and sets Job Walk Date, so it shows on the management calendar with reminders. It doesn't go on your Outlook or Google calendar; add it there too." />
          </h2>
          <p className="mt-0.5 text-sm text-gray-500">{card.name}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={`walk-day-${card.id}`} className={labelClass.default}>
              Date
            </label>
            <input id={`walk-day-${card.id}`} type="date" value={day} onChange={(e) => setDay(e.target.value)} autoFocus className={inputClass.md} />
          </div>
          <div>
            <label htmlFor={`walk-time-${card.id}`} className={labelClass.default}>
              Time
            </label>
            <input id={`walk-time-${card.id}`} type="time" step={900} value={time} onChange={(e) => setTime(e.target.value)} className={inputClass.md} />
          </div>
        </div>
        <div>
          <label htmlFor={`walk-len-${card.id}`} className={labelClass.default}>
            Length
          </label>
          <select id={`walk-len-${card.id}`} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className={inputClass.md}>
            {LENGTHS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`walk-title-${card.id}`} className={labelClass.default}>
            Title
          </label>
          <input id={`walk-title-${card.id}`} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className={inputClass.md} />
        </div>
        {day && day < today && <p className="text-xs text-amber-700">That date is in the past. It still saves, for a walk that already happened.</p>}
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || !day || !time}>
            {busy ? "Booking…" : "Book"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
