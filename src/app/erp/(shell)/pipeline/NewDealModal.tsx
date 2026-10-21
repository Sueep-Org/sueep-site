"use client";

import { useMemo, useState } from "react";
import { Button, InfoTip, Modal, inputClass, labelClass } from "@/app/erp/components/ui";
import { SearchableSelect } from "@/app/erp/components/SearchableSelect";
import { parseMoneyInput } from "@/lib/erp/money";
import type { BoardCard, BoardColumn } from "@/lib/erp/pipelineBoard";
import type { Option } from "./LostReasonModal";

const OTHER = "__other";
const LEAD = /^\s*leads?\s*$/i;

/** Lowercase letters and digits only, so "Ardmore House II - HIGH" and "ardmore house ii high" match. */
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * New deal on the Deals board: creates it in HubSpot in this pipeline, in an
 * open stage (Lead to start). Warns when a deal with a similar name is
 * already on the board.
 */
export function NewDealModal({
  pipeline,
  columns,
  cards,
  owners,
  companies,
  typeOptions,
  defaultOwnerId,
  onClose,
  onSaved,
}: {
  pipeline: "post-con" | "janitorial";
  /** Open stages only */
  columns: BoardColumn[];
  /** For the similar name warning */
  cards: BoardCard[];
  owners: Option[];
  companies: Option[];
  /** HubSpot Type of business options; the field is hidden when there are none */
  typeOptions: Option[];
  defaultOwnerId: string;
  onClose: () => void;
  onSaved: (deal: { newDealId: string; name: string }) => void;
}) {
  const isJan = pipeline === "janitorial";
  const [name, setName] = useState("");
  const [stageId, setStageId] = useState((columns.find((c) => LEAD.test(c.label)) ?? columns[0])?.stageId ?? "");
  const [ownerId, setOwnerId] = useState(defaultOwnerId);
  const [company, setCompany] = useState("");
  const [otherName, setOtherName] = useState("");
  const [bidDate, setBidDate] = useState("");
  const [walkDate, setWalkDate] = useState("");
  const [amount, setAmount] = useState("");
  const [sqft, setSqft] = useState("");
  const [typeOfBusiness, setTypeOfBusiness] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const similar = useMemo(() => {
    const q = squash(name);
    if (q.length < 4) return [];
    return cards.filter((c) => {
      const n = squash(c.name);
      return n === q || (q.length >= 8 && (n.includes(q) || q.includes(n)));
    });
  }, [name, cards]);

  async function save() {
    setError(null);
    const cents = amount.trim() ? parseMoneyInput(amount) : null;
    if (amount.trim() && cents == null) return setError("Check the amount.");
    const sq = sqft.trim() ? Number(sqft.replace(/,/g, "")) : null;
    if (sqft.trim() && (sq == null || !Number.isFinite(sq))) return setError("Check the square footage.");
    const companyName = company === OTHER ? otherName.trim() : company ? (companies.find((c) => c.value === company)?.label ?? "") : "";

    setSaving(true);
    try {
      const res = await fetch("/api/erp/pipeline/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pipeline,
          name,
          stageId,
          ownerId: ownerId || null,
          company: companyName || null,
          bidDate: bidDate || null,
          walkDate: walkDate || null,
          cents,
          sqft: sq,
          typeOfBusiness: typeOfBusiness || null,
        }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string; newDealId?: string } | null;
      if (!res.ok || !data || data.error || !data.newDealId) return setError(data?.error ?? "Couldn't create the deal. Try again.");
      onSaved({ newDealId: data.newDealId, name: name.trim() });
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
        <h2 className="flex items-center gap-1 text-base font-semibold text-gray-900">
          New {isJan ? "janitorial" : "post-construction"} deal
          <InfoTip text="Creates the deal in HubSpot and adds it to this board. Only the name is needed; fill the rest in now or later with Edit info. Won and lost are set later, by moving the card." />
        </h2>

        <div>
          <label htmlFor="new-deal-name" className={labelClass.default}>
            Deal name
          </label>
          <input
            id="new-deal-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={250}
            placeholder={isJan ? "Property name" : "Job name - GC"}
            autoFocus
            className={inputClass.md}
          />
          {similar.length > 0 && (
            <p className="mt-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
              Already on the board: {similar.slice(0, 3).map((c) => c.name).join(", ")}
              {similar.length > 3 ? ` and ${similar.length - 3} more` : ""}. Make sure this isn&apos;t the same job.
            </p>
          )}
        </div>

        <div>
          <p className={labelClass.default}>Stage</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {columns.map((c) => (
              <button
                key={c.stageId}
                type="button"
                onClick={() => setStageId(c.stageId)}
                aria-pressed={c.stageId === stageId}
                className={`rounded-full border px-2.5 py-1 text-xs ${
                  c.stageId === stageId ? "border-pink-300 bg-pink-50 text-pink-700" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <p className={labelClass.default}>Owner</p>
            <SearchableSelect className="mt-1" value={ownerId} onChange={setOwnerId} options={owners} allLabel="No owner" placeholder="No owner" />
          </div>
          <div className="sm:col-span-2">
            <p className={labelClass.default}>{isJan ? "Company" : "GC"}</p>
            <SearchableSelect
              className="mt-1"
              value={company}
              onChange={setCompany}
              options={[...companies, { value: OTHER, label: "Other" }]}
              allLabel="None"
              placeholder="None"
            />
            {company === OTHER && (
              <input value={otherName} onChange={(e) => setOtherName(e.target.value)} placeholder="Company name" aria-label="Company name" className={inputClass.md} />
            )}
          </div>
          <div>
            <label htmlFor="new-deal-bid" className={labelClass.default}>
              Bid Date
            </label>
            <input id="new-deal-bid" type="date" value={bidDate} onChange={(e) => setBidDate(e.target.value)} className={inputClass.md} />
          </div>
          <div>
            <label htmlFor="new-deal-walk" className={labelClass.default}>
              Job Walk Date
            </label>
            <input id="new-deal-walk" type="date" value={walkDate} onChange={(e) => setWalkDate(e.target.value)} className={inputClass.md} />
          </div>
          <div>
            <label htmlFor="new-deal-amount" className={labelClass.default}>
              Amount
            </label>
            <input
              id="new-deal-amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="$"
              className={inputClass.md}
            />
          </div>
          <div>
            <label htmlFor="new-deal-sqft" className={labelClass.default}>
              Area SQFT
            </label>
            <input id="new-deal-sqft" value={sqft} onChange={(e) => setSqft(e.target.value)} inputMode="numeric" className={inputClass.md} />
          </div>
          {typeOptions.length > 0 && (
            <div className="sm:col-span-2">
              <p className={labelClass.default}>Type of business</p>
              <SearchableSelect
                className="mt-1"
                value={typeOfBusiness}
                onChange={setTypeOfBusiness}
                options={typeOptions}
                allLabel="Not set"
                placeholder="Not set"
              />
            </div>
          )}
        </div>

        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || !name.trim() || !stageId}>
            {saving ? "Creating…" : "Create in HubSpot"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
