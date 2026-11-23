"use client";

import { useState } from "react";
import { useAppLists } from "@/app/components/AppListsProvider";
import { Button, Modal, inputClass, labelClass } from "@/app/erp/components/ui";
import type { ScheduleRemovalReason } from "@/lib/erp/scheduleRemovals";

// Asks why a planned day is coming off the schedule. "Placed by mistake"
// just deletes it, any other reason leaves it grayed out on the calendar.
// On a job's last day it also offers to void the whole job (the server
// checks it really is the last day, see day-assignments/[id] DELETE).
export function RemoveDayModal({
  open,
  title,
  dateLabel,
  isLastDay = false,
  onClose,
  onRemove,
}: {
  open: boolean;
  title: string;
  dateLabel: string;
  /** The job's only day left on the calendar: offer "Also void the whole job" */
  isLastDay?: boolean;
  onClose: () => void;
  onRemove: (reason: ScheduleRemovalReason, note: string, voidJob: boolean) => void;
}) {
  const reasons = useAppLists().removalReasons.filter((r) => !r.hidden);
  const [reason, setReason] = useState<ScheduleRemovalReason | "">("");
  const [note, setNote] = useState("");
  const [voidJob, setVoidJob] = useState(false);
  const offerVoid = isLastDay && !!reason && reason !== "MISTAKE";

  function close() {
    setReason("");
    setNote("");
    setVoidJob(false);
    onClose();
  }

  function submit() {
    if (!reason) return;
    onRemove(reason, note, offerVoid && voidJob);
    setReason("");
    setNote("");
    setVoidJob(false);
  }

  return (
    <Modal open={open} onClose={close} size="sm">
      <h2 className="text-base font-semibold text-gray-900">Remove this day?</h2>
      <p className="mt-1 text-xs text-gray-500">
        {title} · {dateLabel}
      </p>
      <div className="mt-4 space-y-1.5">
        <span className={labelClass.default}>Why?</span>
        {reasons.map((r) => (
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
      {offerVoid ? (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-2.5">
          <label className="flex cursor-pointer items-start gap-2 text-sm text-gray-800">
            <input type="checkbox" checked={voidJob} onChange={(e) => setVoidJob(e.target.checked)} className="mt-0.5 accent-red-600" />
            <span>
              Also void the whole job
              <span className="block text-[11px] text-gray-500">
                This is its last day on the calendar. Voided means it won&apos;t be done or billed: it shows as Voided on Projects
                and leaves Billing. The note is saved as the reason.
              </span>
            </span>
          </label>
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
