"use client";

import { useState } from "react";
import { Button, InfoTip, Modal, inputClass, labelClass } from "@/app/erp/components/ui";
import { SearchableSelect } from "@/app/erp/components/SearchableSelect";
import { parseMoneyInput } from "@/lib/erp/money";
import type { BoardCard } from "@/lib/erp/pipelineBoard";

export type Option = { value: string; label: string };
export type LostSaved = { stageId: string; reasons: string[]; winner: { name: string; priceCents: number | null } | null };

const GC_NOT_AWARDED = "GC Not Awarded";
const OTHER = "__other";

/**
 * Pick the lost reason for a lost deal, or mark an open deal lost with one.
 * Saves to HubSpot. GC Not Awarded also asks who won and their price (ERP only).
 */
export function LostReasonModal({
  card,
  pipeline,
  markLost,
  lostStageLabel,
  reasonOptions,
  companies,
  onClose,
  onSaved,
}: {
  card: BoardCard;
  pipeline: "post-con" | "janitorial";
  /** true when the deal is open and this moves it to lost */
  markLost: boolean;
  lostStageLabel: string;
  reasonOptions: Option[];
  companies: Option[];
  onClose: () => void;
  onSaved: (saved: LostSaved) => void;
}) {
  const [reasons, setReasons] = useState<string[]>(card.lostReasons.filter((r) => reasonOptions.some((o) => o.value === r)));
  const winnerCompany = card.winner ? (companies.find((c) => c.label === card.winner!.name)?.value ?? OTHER) : "";
  const [company, setCompany] = useState(winnerCompany);
  const [otherName, setOtherName] = useState(winnerCompany === OTHER ? (card.winner?.name ?? "") : "");
  const [price, setPrice] = useState(card.winner?.priceCents != null ? (card.winner.priceCents / 100).toFixed(2) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const askWinner = reasons.includes(GC_NOT_AWARDED);

  async function save() {
    setError(null);
    const priceCents = price.trim() ? parseMoneyInput(price) : null;
    if (price.trim() && priceCents == null) return setError("Check the winning price.");
    const name = company === OTHER ? otherName.trim() : (companies.find((c) => c.value === company)?.label ?? "");
    setSaving(true);
    try {
      const res = await fetch(`/api/erp/pipeline/deals/${card.id}/lost`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pipeline,
          reasons,
          markLost,
          winner: askWinner && name ? { companyId: company !== OTHER ? company : null, name, priceCents } : null,
        }),
      });
      const data = (await res.json().catch(() => null)) as (LostSaved & { error?: string }) | null;
      if (!res.ok || !data || data.error) return setError(data?.error ?? "Couldn't save. Try again.");
      onSaved(data);
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} dismissible={!saving} size="md">
      <div className="space-y-4 p-5">
        <div>
          <h2 className="flex items-center gap-1 text-base font-semibold text-gray-900">
            {markLost ? "Mark lost" : "Lost reason"}
            <InfoTip
              text={
                markLost
                  ? `Moves the deal to ${lostStageLabel} in HubSpot and saves the reason there. It never creates an ERP project.`
                  : "Saves HubSpot's Deal Lost Reason on this deal. Pick more than one if they all apply."
              }
            />
          </h2>
          <p className="mt-0.5 text-sm text-gray-500">{card.name}</p>
        </div>

        <fieldset>
          <legend className={labelClass.default}>Reason</legend>
          <div className="mt-1.5 grid grid-cols-1 gap-1 sm:grid-cols-2">
            {reasonOptions.map((o) => (
              <label key={o.value} className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={reasons.includes(o.value)}
                  onChange={(e) => setReasons((r) => (e.target.checked ? [...r, o.value] : r.filter((x) => x !== o.value)))}
                  className="h-4 w-4 rounded border-gray-300 text-pink-600 focus:ring-pink-400"
                />
                {o.label}
              </label>
            ))}
          </div>
        </fieldset>

        {askWinner && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={`${labelClass.default} flex items-center gap-1`}>
                GC that won
                <InfoTip text="Optional. Saved in the ERP only, for re-bidding with the GC who got the job. Pick Other to type a name." />
              </label>
              <SearchableSelect
                className="mt-1"
                value={company}
                onChange={setCompany}
                options={[...companies, { value: OTHER, label: "Other" }]}
                allLabel="Not known"
                placeholder="Not known"
              />
              {company === OTHER && (
                <input value={otherName} onChange={(e) => setOtherName(e.target.value)} placeholder="GC name" aria-label="GC name" className={inputClass.md} />
              )}
            </div>
            <div>
              <label htmlFor={`winprice-${card.id}`} className={`${labelClass.default} flex items-center gap-1`}>
                Their price
                <InfoTip text="Optional. What the winning sub charged, if the GC told us." />
              </label>
              <input
                id={`winprice-${card.id}`}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                inputMode="decimal"
                placeholder="$"
                className={inputClass.md}
              />
            </div>
          </div>
        )}

        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || reasons.length === 0}>
            {saving ? "Saving…" : markLost ? "Mark lost" : "Save"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
