"use client";

import { useState } from "react";
import { useAppLists } from "@/app/components/AppListsProvider";
import { Button, Modal, inputClass, labelClass } from "@/app/erp/components/ui";
import type { ScheduleRemovalReason } from "@/lib/erp/scheduleRemovals";

// Two choices for a planned day:
// - Remove just this day (the job keeps going): asks why. "Placed by
//   mistake" just deletes it, any other reason leaves it grayed out.
// - Void the whole job (won't be billed): asks why, then the job is voided
//   (projects/[id]/void). Its days stay on the calendar drawn gray with a
//   VOID tag, its days after today are cancelled with their invites.
// The void choice is only there when onVoidJob is given (project days, not
// change order days).
export function RemoveDayModal({
  open,
  title,
  dateLabel,
  onClose,
  onRemove,
  onVoidJob,
}: {
  open: boolean;
  title: string;
  dateLabel: string;
  onClose: () => void;
  onRemove: (reason: ScheduleRemovalReason, note: string) => void;
  onVoidJob?: (reason: string) => void;
}) {
  const reasons = useAppLists().removalReasons.filter((r) => !r.hidden);
  const [mode, setMode] = useState<"day" | "job">("day");
  const [reason, setReason] = useState<ScheduleRemovalReason | "">("");
  const [note, setNote] = useState("");
  const [voidReason, setVoidReason] = useState("");

  function reset() {
    setMode("day");
    setReason("");
    setNote("");
    setVoidReason("");
  }

  function close() {
    reset();
    onClose();
  }

  function submit() {
    if (mode === "job") {
      if (!onVoidJob || voidReason.trim().length < 3) return;
      onVoidJob(voidReason.trim());
    } else {
      if (!reason) return;
      onRemove(reason, note);
    }
    reset();
  }

  const canSubmit = mode === "job" ? voidReason.trim().length >= 3 : !!reason && !(reason === "OTHER" && !note.trim());

  return (
    <Modal open={open} onClose={close} size="sm">
      <h2 className="text-base font-semibold text-gray-900">{onVoidJob ? "Remove this day or void the job?" : "Remove this day?"}</h2>
      <p className="mt-1 text-xs text-gray-500">
        {title} · {dateLabel}
      </p>

      {onVoidJob ? (
        <div className="mt-4 grid gap-2">
          <label className={`flex cursor-pointer items-start gap-2 rounded-md border p-2.5 text-sm ${mode === "day" ? "border-pink-300 bg-pink-50" : "border-gray-200"}`}>
            <input type="radio" name="remove-mode" checked={mode === "day"} onChange={() => setMode("day")} className="mt-0.5 accent-pink-600" />
            <span>
              <span className="font-medium text-gray-900">Remove just this day</span>
              <span className="block text-[11px] text-gray-500">The job keeps going. This day is grayed out with the reason.</span>
            </span>
          </label>
          <label className={`flex cursor-pointer items-start gap-2 rounded-md border p-2.5 text-sm ${mode === "job" ? "border-red-300 bg-red-50" : "border-gray-200"}`}>
            <input type="radio" name="remove-mode" checked={mode === "job"} onChange={() => setMode("job")} className="mt-0.5 accent-red-600" />
            <span>
              <span className="font-medium text-gray-900">Void the whole job</span>
              <span className="block text-[11px] text-gray-500">
                It won&apos;t be done or billed, and counts as $0. All its days turn gray with a VOID tag, and days after today are
                cancelled so nobody is invited. Notes on removed days stay.
              </span>
            </span>
          </label>
        </div>
      ) : null}

      {mode === "job" ? (
        <div className="mt-4">
          <label className={labelClass.default}>
            Why won&apos;t it be billed?
            <textarea
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="e.g. Crew walked off, client canceled the unit"
              className={inputClass.md}
            />
          </label>
        </div>
      ) : (
        <>
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
        </>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={close}>
          Cancel
        </Button>
        <Button variant="danger" size="sm" onClick={submit} disabled={!canSubmit}>
          {mode === "job" ? "Void the job" : "Remove day"}
        </Button>
      </div>
    </Modal>
  );
}
