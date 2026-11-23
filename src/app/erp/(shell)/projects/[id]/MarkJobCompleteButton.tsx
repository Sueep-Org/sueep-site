"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Modal, inputClass, labelClass } from "@/app/erp/components/ui";
import { todayEasternKey } from "@/lib/erp/dates";

/**
 * The one place a whole job is marked complete (the schedule only marks single
 * days). Sets the end date and status COMPLETE in one PATCH; the API keeps its
 * own rules, like a turnover's checklist having to be finished first.
 */
export function MarkJobCompleteButton({
  projectId,
  jobTitle,
  complete,
  completedAtIso,
  completedBy,
  defaultEndDateKey,
  openChangeOrders,
}: {
  projectId: string;
  jobTitle: string;
  complete: boolean;
  completedAtIso: string | null;
  completedBy: string | null;
  defaultEndDateKey: string | null;
  openChangeOrders: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [endDate, setEndDate] = useState(defaultEndDateKey ?? todayEasternKey());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (complete) {
    const when = completedAtIso
      ? new Date(completedAtIso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" })
      : null;
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
        ✓ Job complete
        {when || completedBy ? (
          <span className="font-normal text-emerald-700/80">
            {when ? ` · ${when}` : ""}
            {completedBy ? ` · ${completedBy}` : ""}
          </span>
        ) : null}
      </span>
    );
  }

  async function save() {
    if (!endDate) {
      setError("Pick the day the job finished.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/erp/projects/${projectId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "COMPLETE", projectEndDate: endDate }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Could not mark the job complete.");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("Could not mark the job complete.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Mark job complete
      </Button>
      {open && (
        <Modal open onClose={() => setOpen(false)} dismissible={!saving} size="sm">
          <h3 className="text-base font-semibold text-gray-900">Mark the whole job complete?</h3>
          <p className="mt-1 text-sm text-gray-600">
            &quot;{jobTitle}&quot; will be closed and shows on Project Billing as ready to bill (unless it&apos;s already billed). To mark just one day done, use{" "}
            <span className="font-medium">Mark day complete</span> on the Schedule instead.
          </p>
          {openChangeOrders > 0 && (
            <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
              It still has {openChangeOrders} open change order{openChangeOrders === 1 ? "" : "s"}. Those stay open.
            </p>
          )}
          <label className={`${labelClass.default} mt-4 block`}>
            End date (the day the job finished)
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={`${inputClass.md} mt-1`} />
          </label>
          {error && <p className="mt-2 text-sm text-red-600" role="alert">{error}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : "Mark job complete"}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
