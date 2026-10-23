"use client";

import { useState } from "react";
import { Modal } from "@/app/erp/components/ui";
import type { BoardCard } from "@/lib/erp/pipelineBoard";
import type { Priority } from "@/lib/erp/pipelineUi";
import { PriorityPicker } from "./DealInfoModal";

/** One click sets the deal's HubSpot Priority, from the card menu. */
export function PriorityModal({
  card,
  pipeline,
  onClose,
  onSaved,
}: {
  card: BoardCard;
  pipeline: "post-con" | "janitorial";
  onClose: () => void;
  onSaved: (p: Priority | null) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(v: Priority | "") {
    if (v === (card.priority ?? "")) return onClose();
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/erp/pipeline/deals/${card.id}/info`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pipeline, changes: { priority: v || null } }),
    }).catch(() => null);
    setSaving(false);
    const data = (await res?.json().catch(() => null)) as { error?: string } | null;
    if (!res?.ok || data?.error) return setError(data?.error ?? "Couldn't save. Try again.");
    onSaved(v || null);
  }

  return (
    <Modal open onClose={onClose} dismissible={!saving} size="sm">
      <div className="space-y-3 p-5">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Priority</h2>
          <p className="mt-0.5 text-sm text-gray-500">{card.name}</p>
        </div>
        <PriorityPicker value={card.priority ?? ""} onChange={(v) => void pick(v)} disabled={saving} />
        <p className="text-xs text-gray-500">Saves to HubSpot right away.</p>
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </div>
    </Modal>
  );
}
