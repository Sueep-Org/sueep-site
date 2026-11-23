"use client";

import { useEffect, useState } from "react";
import { Button, Modal, useToast } from "@/app/erp/components/ui";
import { DEFAULT_PAYROLL_ANCHOR, payPeriodForDay } from "@/lib/erp/payPeriods";
import { todayEasternKey } from "@/lib/erp/dates";
import type { SubPayLineKind } from "@/lib/erp/subPayHold";

/** The pay line being held or released (Payroll page and contractor profile). */
export type SubPayHoldTarget = {
  mode: "hold" | "release";
  kind: SubPayLineKind;
  id: string;
  amountCents: number;
  /** e.g. "Jane Sub, 123 Main · Unit 4", shown in the dialog */
  label: string;
  /** The line's own date, "YYYY-MM-DD" */
  date: string | null;
};

const inputCls = "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";

function fmt(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDay(day: string | Date): string {
  const d = typeof day === "string" ? new Date(`${day}T00:00:00Z`) : day;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** Hold a sub's pay line, or release it into the pay period holding the date picked (see subPayHold.ts). */
export function SubPayHoldDialog({ target, onClose, onDone }: { target: SubPayHoldTarget | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [note, setNote] = useState("");
  const [payDate, setPayDate] = useState("");
  const [anchorISO, setAnchorISO] = useState(DEFAULT_PAYROLL_ANCHOR);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!target) return;
    setNote("");
    setPayDate(todayEasternKey());
    if (target.mode === "release") {
      fetch("/api/erp/settings/payroll-anchor")
        .then((r) => r.json())
        .then((d: { anchor?: string }) => { if (d.anchor) setAnchorISO(d.anchor); })
        .catch(() => {});
    }
  }, [target]);

  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(payDate);
  const period = target?.mode === "release" && validDate ? payPeriodForDay(payDate, anchorISO) : null;

  async function save() {
    if (!target) return;
    setSaving(true);
    try {
      const body = target.mode === "hold"
        ? { action: "hold", kind: target.kind, id: target.id, note }
        : { action: "release", kind: target.kind, id: target.id, payDate };
      const res = await fetch("/api/erp/payroll/sub-pay-hold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { toast(d.error ?? "Could not save", "error"); return; }
      toast(target.mode === "hold" ? "Pay put on hold." : "Pay released.", "success");
      onDone();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={!!target} onClose={onClose} size="sm">
      {target && (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <div>
            <h2 className="text-base font-semibold text-gray-900">{target.mode === "hold" ? "Hold pay" : "Release pay"}</h2>
            <p className="mt-1 text-sm text-gray-600">
              {fmt(target.amountCents)} for {target.label}{target.date ? ` (${fmtDay(target.date)})` : ""}.
              {target.mode === "hold" ? " It comes out of payroll and waits under Sub pay on hold until it's released." : ""}
            </p>
          </div>
          {target.mode === "hold" ? (
            <label className="block text-xs font-medium text-gray-600">
              Reason <span className="font-normal text-gray-400">(optional)</span>
              <input type="text" value={note} autoFocus placeholder="e.g. Not paid out on the Nov 14 run"
                onChange={(e) => setNote(e.target.value)} className={inputCls} />
            </label>
          ) : (
            <>
              <label className="block text-xs font-medium text-gray-600">
                Pay it on
                <input type="date" required value={payDate} onChange={(e) => setPayDate(e.target.value)} className={inputCls} />
              </label>
              {period && <p className="text-xs text-gray-500">Goes in the {fmtDay(period.start)} – {fmtDay(period.end)} pay period.</p>}
            </>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100">Cancel</button>
            <Button size="sm" type="submit" disabled={saving || (target.mode === "release" && !validDate)}>
              {saving ? "Saving..." : target.mode === "hold" ? "Hold pay" : "Release"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
