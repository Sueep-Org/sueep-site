"use client";

import { useState } from "react";
import { Button, InfoTip, Modal, inputClass, labelClass } from "@/app/erp/components/ui";
import type { BoardCard } from "@/lib/erp/pipelineBoard";
import type { NextStep } from "@/lib/erp/dealFollowUps";

/** "YYYY-MM-DD" plus n days. */
function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + n)).toISOString().slice(0, 10);
}

/** Add, change or finish a deal's next step. ERP only. `onSaved(null)` means it was marked done. */
export function NextStepModal({
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
  onSaved: (next: NextStep | null) => void;
}) {
  const existing = card.nextStep;
  const [text, setText] = useState(existing?.text ?? "");
  const [dueDate, setDueDate] = useState(existing?.dueDate ?? addDays(today, 3));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(method: "PUT" | "DELETE") {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/erp/pipeline/deals/${card.id}/next-step`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "PUT" ? JSON.stringify({ pipeline, dealName: card.name, text, dueDate }) : undefined,
      });
      const data = (await res.json().catch(() => null)) as { error?: string; nextStep?: NextStep } | null;
      if (!res.ok || !data || data.error) return setError(data?.error ?? "Couldn't save. Try again.");
      onSaved(method === "PUT" ? (data.nextStep ?? null) : null);
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
          void send("PUT");
        }}
      >
        <div>
          <h2 className="flex items-center gap-1 text-base font-semibold text-gray-900">
            Next step
            <InfoTip text="What has to happen next on this deal and by when. Saved in the ERP only. Overdue ones turn red on the board, and owners get them in the Monday email." />
          </h2>
          <p className="mt-0.5 text-sm text-gray-500">{card.name}</p>
        </div>
        <div>
          <label htmlFor={`ns-text-${card.id}`} className={labelClass.default}>
            What
          </label>
          <input
            id={`ns-text-${card.id}`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={300}
            placeholder="Call the GC about the bid"
            autoFocus
            className={inputClass.md}
          />
        </div>
        <div>
          <label htmlFor={`ns-due-${card.id}`} className={labelClass.default}>
            Due
          </label>
          <input id={`ns-due-${card.id}`} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputClass.md} />
        </div>
        {existing && <p className="text-xs text-gray-400">Last set by {existing.byEmail}</p>}
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex items-center justify-between gap-2">
          {existing ? (
            <Button variant="secondary" onClick={() => void send("DELETE")} disabled={busy}>
              Done
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !text.trim() || !dueDate}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
