"use client";

import { useState } from "react";
import { Button, Modal, inputClass } from "@/app/erp/components/ui";
import { isDateKey, type DatedMode } from "@/lib/erp/datedSettings";

/**
 * Asked when saving a setting that changes pay or commission: does the new
 * value start on a day (older pay weeks or deals keep the old one), or apply
 * to everything, past included?
 */
export function DatedSaveModal({
  label,
  dated,
  oldText,
  newText,
  defaultFrom,
  busy,
  onCancel,
  onSave,
}: {
  label: string;
  dated: { appliesTo: string; many: string; one: string };
  oldText: string;
  newText: string;
  defaultFrom: string;
  busy: boolean;
  onCancel: () => void;
  onSave: (mode: DatedMode) => void;
}) {
  const [choice, setChoice] = useState<"from" | "all">("from");
  const [from, setFrom] = useState(defaultFrom);
  const { appliesTo, many, one } = dated;
  const fromOk = isDateKey(from);

  return (
    <Modal open onClose={onCancel} size="md">
      <div className="space-y-4">
        <div>
          <h3 className="text-base font-semibold text-gray-900">When does this start?</h3>
          <p className="mt-1 text-sm text-gray-600">
            {label}: {oldText} to <span className="font-medium text-gray-900">{newText}</span>
          </p>
        </div>

        <label className={`block cursor-pointer rounded-lg border p-3 ${choice === "from" ? "border-pink-300 bg-pink-50/50" : "border-gray-200"}`}>
          <span className="flex items-start gap-2">
            <input type="radio" name="dated-mode" className="mt-1" checked={choice === "from"} onChange={() => setChoice("from")} />
            <span className="flex-1">
              <span className="block text-sm font-medium text-gray-900">Starting from a date</span>
              <span className="mt-0.5 block text-xs text-gray-600">
                {appliesTo} on or after this date use {newText}. Earlier {many} keep {oldText}, so past pay and commission don&apos;t change.
              </span>
              <span className="mt-2 flex items-center gap-2 text-xs text-gray-600">
                {appliesTo}
                <input
                  type="date"
                  className={inputClass.xs}
                  value={from}
                  onChange={(e) => {
                    setFrom(e.target.value);
                    setChoice("from");
                  }}
                />
              </span>
            </span>
          </span>
        </label>

        <label className={`block cursor-pointer rounded-lg border p-3 ${choice === "all" ? "border-pink-300 bg-pink-50/50" : "border-gray-200"}`}>
          <span className="flex items-start gap-2">
            <input type="radio" name="dated-mode" className="mt-1" checked={choice === "all"} onChange={() => setChoice("all")} />
            <span className="flex-1">
              <span className="block text-sm font-medium text-gray-900">Recalculate everything</span>
              <span className="mt-0.5 block text-xs text-gray-600">
                Every {one}, past and future, uses {newText}. Past pay, job costs and commission on screen change to match. Use
                this to fix a number that was wrong from the start.
              </span>
            </span>
          </span>
        </label>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button size="sm" type="button" disabled={busy || (choice === "from" && !fromOk)} onClick={() => onSave(choice === "all" ? "all" : { from })}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
