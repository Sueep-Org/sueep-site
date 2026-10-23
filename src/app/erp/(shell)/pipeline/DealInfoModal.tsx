"use client";

import { useState } from "react";
import { Button, InfoTip, Modal, inputClass, labelClass } from "@/app/erp/components/ui";
import { SearchableSelect } from "@/app/erp/components/SearchableSelect";
import { parseMoneyInput } from "@/lib/erp/money";
import type { BoardCard } from "@/lib/erp/pipelineBoard";
import { MISSING_LABELS, type MissingField } from "@/lib/erp/pipelineMissing";
import type { Option } from "./LostReasonModal";
import { PRIORITIES, type Priority } from "@/lib/erp/pipelineUi";
import { FlameIcon } from "./board/FlameIcon";

const OTHER = "__other";

/** What changed, in the card's own terms, so the board can show it before the next HubSpot refresh. */
export type InfoSaved = {
  ownerId: string | null;
  owner: string | null;
  companyText: string | null;
  gc: BoardCard["gc"];
  bidDate: string | null;
  walkDate: string | null;
  awardDate?: string | null;
  cents: number;
  sqft: number | null;
  priority?: Priority | null;
};

/** None / Low / Medium / High as one row of buttons. */
export function PriorityPicker({ value, onChange, disabled }: { value: Priority | ""; onChange: (v: Priority | "") => void; disabled?: boolean }) {
  const options: { value: Priority | ""; label: string }[] = [{ value: "", label: "None" }, ...[...PRIORITIES].reverse()];
  return (
    <div className="mt-1 inline-flex overflow-hidden rounded-md border border-gray-300">
      {options.map((o) => (
        <button
          key={o.value || "none"}
          type="button"
          disabled={disabled}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`flex items-center gap-1 border-l border-gray-300 px-3 py-1.5 text-xs font-medium first:border-l-0 disabled:opacity-50 ${
            value === o.value ? "bg-pink-50 text-pink-700" : "bg-white text-gray-600 hover:bg-gray-50"
          }`}
        >
          {o.value === "high" && <FlameIcon />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Edit an open deal's owner, GC, dates, amount, sq ft and priority. Saves to HubSpot;
 * only changed fields are sent. Missing fields for the deal's stage are
 * marked so the person knows what to fill in.
 */
export function DealInfoModal({
  card,
  pipeline,
  owners,
  companies,
  mayEditCompanies,
  onClose,
  onSaved,
  moveTo,
}: {
  card: BoardCard;
  pipeline: "post-con" | "janitorial";
  owners: Option[];
  companies: Option[];
  /** Admin and Business Manager can add a typed name to a company's other names */
  mayEditCompanies: boolean;
  onClose: () => void;
  onSaved: (saved: InfoSaved) => void;
  /** Opened by a move into a stage that needs these fields: they're marked, and Save must fill them */
  moveTo?: { label: string; missing: MissingField[] };
}) {
  const startCompany = card.gc?.companyId ?? (card.companyText ? OTHER : "");
  const startName = startCompany === OTHER ? (card.companyText ?? "") : startCompany ? (companies.find((c) => c.value === startCompany)?.label ?? "") : "";
  const [ownerId, setOwnerId] = useState(owners.some((o) => o.value === card.ownerId) ? (card.ownerId ?? "") : "");
  const [company, setCompany] = useState(startCompany);
  const [otherName, setOtherName] = useState(startCompany === OTHER ? (card.companyText ?? "") : "");
  const [aliasOf, setAliasOf] = useState("");
  const [bidDate, setBidDate] = useState(card.bidDate ?? "");
  const [walkDate, setWalkDate] = useState(card.walkDate ?? "");
  const [awardDate, setAwardDate] = useState(card.awardDate ?? "");
  const [amount, setAmount] = useState(card.cents ? (card.cents / 100).toFixed(2) : "");
  const [sqft, setSqft] = useState(card.sqft != null ? String(card.sqft) : "");
  const [priority, setPriority] = useState<Priority | "">(card.priority ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const need = (f: MissingField) => (moveTo ? moveTo.missing : card.missing).includes(f);
  const tag = (f: MissingField) => (need(f) ? <span className="ml-1 rounded bg-sky-50 px-1 text-[10px] font-medium text-sky-700">Missing</span> : null);

  /** The card as it is, for a move whose fields were already filled. */
  function currentInfo(): InfoSaved {
    return { ownerId: card.ownerId, owner: card.owner, companyText: card.companyText, gc: card.gc, bidDate: card.bidDate, walkDate: card.walkDate, awardDate: card.awardDate, cents: card.cents, sqft: card.sqft, priority: card.priority };
  }

  async function save() {
    setError(null);
    const cents = amount.trim() ? parseMoneyInput(amount) : null;
    if (amount.trim() && cents == null) return setError("Check the amount.");
    const sq = sqft.trim() ? Number(sqft.replace(/,/g, "")) : null;
    if (sqft.trim() && (sq == null || !Number.isFinite(sq))) return setError("Check the square footage.");
    const companyName = company === OTHER ? otherName.trim() : company ? (companies.find((c) => c.value === company)?.label ?? "") : "";

    // Only what changed, so an untouched field never overwrites HubSpot.
    const changes: Record<string, unknown> = {};
    if (ownerId !== (card.ownerId ?? "") && (ownerId || owners.some((o) => o.value === card.ownerId))) changes.ownerId = ownerId || null;
    // Compared with what the form started with: a GC matched from the deal name isn't written unless someone picks one.
    if (companyName !== startName) changes.company = companyName || null;
    if (bidDate !== (card.bidDate ?? "")) changes.bidDate = bidDate || null;
    if (walkDate !== (card.walkDate ?? "")) changes.walkDate = walkDate || null;
    if (awardDate !== (card.awardDate ?? "")) changes.awardDate = awardDate || null;
    if ((cents ?? 0) !== card.cents) changes.cents = cents;
    if (sq !== card.sqft) changes.sqft = sq;
    if (priority !== (card.priority ?? "")) changes.priority = priority || null;
    const alias = company === OTHER && aliasOf ? aliasOf : null;
    if (moveTo) {
      // Everything the stage needs must be filled before the move can go ahead.
      const filled: Record<MissingField, boolean> = {
        owner: !!ownerId || owners.some((o) => o.value === card.ownerId),
        company: !!companyName || (!!card.gc && companyName === startName),
        bidDate: !!bidDate,
        walkDate: !!walkDate,
        awardDate: !!awardDate,
        amount: (cents ?? 0) > 0,
        sqft: !!sq && sq > 0,
      };
      const left = moveTo.missing.filter((f) => !filled[f]);
      if (left.length) return setError(`To move to ${moveTo.label}, fill in: ${left.map((f) => (f === "company" ? (pipeline === "janitorial" ? "Company" : "GC") : MISSING_LABELS[f])).join(", ")}.`);
    }
    if (!Object.keys(changes).length && !alias) return moveTo ? onSaved(currentInfo()) : onClose();

    setSaving(true);
    try {
      const res = await fetch(`/api/erp/pipeline/deals/${card.id}/info`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipeline, changes, aliasCompanyId: alias }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok || !data || data.error) return setError(data?.error ?? "Couldn't save. Try again.");
      const picked = company && company !== OTHER ? companies.find((c) => c.value === company) : null;
      const aliasTo = alias ? companies.find((c) => c.value === alias) : null;
      onSaved({
        ownerId: ownerId || null,
        owner: owners.find((o) => o.value === ownerId)?.label ?? (ownerId ? card.owner : null),
        companyText: companyName || null,
        gc: picked
          ? { key: `c:${picked.value}`, label: picked.label, companyId: picked.value }
          : aliasTo
            ? { key: `c:${aliasTo.value}`, label: aliasTo.label, companyId: aliasTo.value }
            : companyName
              ? companyName === card.companyText
                ? card.gc
                : { key: `t:${companyName.toLowerCase()}`, label: companyName, companyId: null }
              : null,
        bidDate: bidDate || null,
        walkDate: walkDate || null,
        awardDate: awardDate || null,
        cents: cents ?? 0,
        sqft: sq,
        priority: priority || null,
      });
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
            {moveTo ? `Fill in to move to ${moveTo.label}` : "Edit info"}
            <InfoTip text="Saves to the HubSpot deal. Only the fields you change are sent. Leave a field blank to clear it. Missing marks what this deal should have for its stage." />
          </h2>
          <p className="mt-0.5 text-sm text-gray-500">{card.name}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className={labelClass.default}>Owner{tag("owner")}</p>
            <SearchableSelect
              className="mt-1"
              value={ownerId}
              onChange={setOwnerId}
              options={owners}
              allLabel={card.owner && !owners.some((o) => o.value === card.ownerId) ? `${card.owner} (keep)` : "No owner"}
              placeholder={card.owner ?? "No owner"}
            />
          </div>
          <div>
            <p className={labelClass.default}>
              {pipeline === "janitorial" ? "Company" : "GC"}
              {tag("company")}
            </p>
            <SearchableSelect
              className="mt-1"
              value={company}
              onChange={setCompany}
              options={[...companies, { value: OTHER, label: "Other" }]}
              allLabel="None"
              placeholder="None"
            />
            {company === OTHER && (
              <>
                <input
                  value={otherName}
                  onChange={(e) => setOtherName(e.target.value)}
                  placeholder="Company name"
                  aria-label="Company name"
                  className={inputClass.md}
                />
                {mayEditCompanies && otherName.trim() && (
                  <div className="mt-1.5">
                    <p className={`${labelClass.compact} flex items-center gap-1`}>
                      Same company as
                      <InfoTip text="Optional. Adds this spelling to the company's other names, so deals with it count for that company from now on." />
                    </p>
                    <SearchableSelect
                      className="mt-1"
                      value={aliasOf}
                      onChange={setAliasOf}
                      options={companies}
                      allLabel="Not a company we have"
                      placeholder="Not a company we have"
                    />
                  </div>
                )}
              </>
            )}
          </div>
          <div>
            <label htmlFor={`bid-${card.id}`} className={labelClass.default}>
              Bid Date{tag("bidDate")}
            </label>
            <input id={`bid-${card.id}`} type="date" value={bidDate} onChange={(e) => setBidDate(e.target.value)} className={inputClass.md} />
          </div>
          <div>
            <label htmlFor={`walk-${card.id}`} className={labelClass.default}>
              Job Walk Date{tag("walkDate")}
            </label>
            <input id={`walk-${card.id}`} type="date" value={walkDate} onChange={(e) => setWalkDate(e.target.value)} className={inputClass.md} />
          </div>
          {pipeline === "post-con" && (
            <div>
              <label htmlFor={`award-${card.id}`} className={labelClass.default}>
                Award Date{tag("awardDate")}
              </label>
              <input id={`award-${card.id}`} type="date" value={awardDate} onChange={(e) => setAwardDate(e.target.value)} className={inputClass.md} />
            </div>
          )}
          <div>
            <label htmlFor={`amt-${card.id}`} className={labelClass.default}>
              Amount{tag("amount")}
            </label>
            <input
              id={`amt-${card.id}`}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="$"
              className={inputClass.md}
            />
          </div>
          <div>
            <label htmlFor={`sqft-${card.id}`} className={labelClass.default}>
              Area SQFT{tag("sqft")}
            </label>
            <input id={`sqft-${card.id}`} value={sqft} onChange={(e) => setSqft(e.target.value)} inputMode="numeric" className={inputClass.md} />
          </div>
          <div className="sm:col-span-2">
            <p className={`${labelClass.default} flex items-center gap-1`}>
              Priority
              <InfoTip text="HubSpot's deal Priority. High shows a flame on the card." />
            </p>
            <PriorityPicker value={priority} onChange={setPriority} />
          </div>
        </div>

        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : moveTo ? "Save and move" : "Save"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
