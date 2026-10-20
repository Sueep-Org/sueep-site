"use client";

import { useState } from "react";
import { Button, InfoTip, Modal, inputClass, labelClass } from "@/app/erp/components/ui";
import { SearchableSelect } from "@/app/erp/components/SearchableSelect";
import type { BoardCard } from "@/lib/erp/pipelineBoard";
import type { Option } from "./LostReasonModal";

/** Confirm a re-bid with the GC that won: creates a new HubSpot deal in Lead. */
export function RebidModal({
  card,
  owners,
  defaultOwnerId,
  onClose,
  onSaved,
}: {
  card: BoardCard;
  owners: Option[];
  defaultOwnerId: string;
  onClose: () => void;
  onSaved: (rebid: { newDealId: string; url: string | null }) => void;
}) {
  const winner = card.winner?.name ?? "";
  const [name, setName] = useState(card.rebidName ?? `${card.name} - ${winner}`);
  const [ownerId, setOwnerId] = useState(defaultOwnerId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/erp/pipeline/deals/${card.id}/rebid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealName: name, ownerId }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string; newDealId?: string; url?: string | null } | null;
      if (!res.ok || !data || data.error || !data.newDealId) return setError(data?.error ?? "Couldn't create the deal. Try again.");
      onSaved({ newDealId: data.newDealId, url: data.url ?? null });
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} dismissible={!saving} size="md">
      <form
        className="space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div>
          <h2 className="flex items-center gap-1 text-base font-semibold text-gray-900">
            Re-bid with {winner}
            <InfoTip text="Creates a new post-construction deal in HubSpot at Lead, with the same amount, Area SQFT and Type of business. Company is the GC that won, and the Deal Description says which deal it came from. The lost deal stays lost." />
          </h2>
          <p className="mt-0.5 text-sm text-gray-500">From: {card.name}</p>
        </div>
        <div>
          <label htmlFor={`rebid-name-${card.id}`} className={labelClass.default}>
            New deal name
          </label>
          <input id={`rebid-name-${card.id}`} value={name} onChange={(e) => setName(e.target.value)} maxLength={250} className={inputClass.md} />
        </div>
        <div>
          <p className={labelClass.default}>Owner</p>
          <SearchableSelect className="mt-1" value={ownerId} onChange={setOwnerId} options={owners} allLabel="No owner" placeholder="No owner" />
        </div>
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || !name.trim()}>
            {saving ? "Creating…" : "Create in HubSpot"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
