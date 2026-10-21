"use client";

import { useState } from "react";
import { Button, Modal, inputClass, labelClass } from "@/app/erp/components/ui";
import { SCHEDULE_REMOVAL_REASONS, type ScheduleRemovalReason } from "@/lib/erp/scheduleRemovals";

// Asks why a planned day is coming off the schedule. "Placed by mistake"
// just deletes it, any other reason leaves it grayed out on the calendar.
export function RemoveDayModal({
  open,
  title,
  dateLabel,
  onClose,
  onRemove,
}: {
  open: boolean;
  title: string;
  dateLabel: string;
  onClose: () => void;
  onRemove: (reason: ScheduleRemovalReason, note: string) => void;
}) {
  const [reason, setReason] = useState<ScheduleRemovalReason | "">("");
  const [note, setNote] = useState("");

  function close() {
    setReason("");
    setNote("");
    onClose();
  }

  function submit() {
    if (!reason) return;
    onRemove(reason, note);
    setReason("");
    setNote("");
  }

  return (
    <Modal open={open} onClose={close} size="sm">
      <h2 className="text-base font-semibold text-gray-900">Remove this day?</h2>
      <p className="mt-1 text-xs text-gray-500">
        {title} · {dateLabel}
      </p>
      <div className="mt-4 space-y-1.5">
        <span className={labelClass.default}>Why?</span>
        {SCHEDULE_REMOVAL_REASONS.map((r) => (
          <label key={r.value} className="flex cursor-pointer items-center gap-2 text-sm text-gray-800">
            <input
              type="radio"
              name="remove-day-reason"
              value={r.value}
              checked={reason === r.value}
              onChange={() => setReason(r.value)}
              className="accent-pink-600"
            />
            {r.label}
          </label>
        ))}
      </div>
      {reason && reason !== "MISTAKE" ? (
        <div className="mt-3">
          <label className={labelClass.default}>
            Note {reason === "OTHER" ? "" : "(optional)"}
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder={reason === "RESCHEDULED" ? "e.g. moved to next Tuesday" : ""}
              className={inputClass.md}
            />
          </label>
          <p className="mt-1 text-[11px] text-gray-400">Stays on the calendar grayed out.</p>
        </div>
      ) : null}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={close}>
          Cancel
        </Button>
        <Button
          variant="danger"
          size="sm"
          onClick={submit}
          disabled={!reason || (reason === "OTHER" && !note.trim())}
        >
          Remove
        </Button>
      </div>
    </Modal>
  );
}
