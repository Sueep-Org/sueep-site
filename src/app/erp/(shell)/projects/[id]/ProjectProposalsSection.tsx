"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button, InfoTip, Modal, inputClass, labelClass, useConfirm, useToast } from "@/app/erp/components/ui";
import { SearchableSelect } from "@/app/erp/components/SearchableSelect";
import { SOVMultiCombobox, type SOVItemOption } from "@/app/erp/components/SOVCombobox";
import { centsToDollars } from "@/lib/erp/money";
import { todayEasternKey } from "@/lib/erp/dates";
import { starsText } from "@/lib/erp/subScores";
import { Stars } from "@/app/erp/components/Stars";
import type { PastBidder } from "@/lib/erp/subBidLinks";
import {
  SUB_BID_STATUSES,
  SUB_BID_STATUS_LABELS,
  bidOurPriceCents,
  bidScopeKey,
  bidderKey,
  bidderLabel,
  type SubBidRow,
  type SubBidStatus,
} from "@/lib/erp/subBids";

const input = inputClass.md;
const label = labelClass.default;

type ContractorOption = { id: string; name: string; status: string; confidence: number | null; pricing: number | null };

/** "Confidence ★★★★☆ · Pricing ★★★★★" for the picker, leaving out a score they don't have yet. */
function scoreText(c: ContractorOption | undefined): string {
  if (!c) return "";
  return [c.confidence != null ? `Confidence ${starsText(c.confidence)}` : null, c.pricing != null ? `Pricing ${starsText(c.pricing)}` : null]
    .filter(Boolean)
    .join(" · ");
}

/** Both scores as stars beside a linked sub's name. */
function ScoreStars({ c }: { c: ContractorOption | undefined }) {
  if (!c || (c.confidence == null && c.pricing == null)) return null;
  return (
    <span className="flex items-center gap-1 text-[11px] text-gray-400">
      {c.confidence != null ? (
        <span className="flex items-center gap-0.5" title="Confidence">
          C <Stars value={c.confidence} size="xs" />
        </span>
      ) : null}
      {c.pricing != null ? (
        <span className="flex items-center gap-0.5" title="Pricing">
          P <Stars value={c.pricing} size="xs" />
        </span>
      ) : null}
    </span>
  );
}

type FormState = {
  mode: "profile" | "new";
  contractorId: string;
  bidderName: string;
  bidderCompany: string;
  bidderEmail: string;
  bidderPhone: string;
  amount: string;
  receivedOn: string;
  status: SubBidStatus;
  notes: string;
  sovItemIds: string[];
};

function emptyForm(): FormState {
  return {
    mode: "profile",
    contractorId: "",
    bidderName: "",
    bidderCompany: "",
    bidderEmail: "",
    bidderPhone: "",
    amount: "",
    receivedOn: todayEasternKey(),
    status: "RECEIVED",
    notes: "",
    sovItemIds: [],
  };
}

function formFromBid(b: SubBidRow): FormState {
  return {
    mode: b.contractorId ? "profile" : "new",
    contractorId: b.contractorId ?? "",
    bidderName: b.bidderName ?? "",
    bidderCompany: b.bidderCompany ?? "",
    bidderEmail: b.bidderEmail ?? "",
    bidderPhone: b.bidderPhone ?? "",
    amount: (b.amountCents / 100).toFixed(2),
    receivedOn: b.receivedOn ?? "",
    status: b.status,
    notes: b.notes ?? "",
    sovItemIds: b.sovItemIds,
  };
}

function pct(marginCents: number, ourCents: number): string {
  return ourCents > 0 ? `${Math.round((marginCents / ourCents) * 100)}%` : "-";
}

const ACTIVE: SubBidStatus[] = ["RECEIVED", "AWARDED"];

/** Proposals tab: subs' bids on this job and the margin each would leave us. */
export function ProjectProposalsSection({
  projectId,
  contractValueCents,
  sovItems,
  contractors,
  initialBids,
  pastBidders: initialPastBidders,
}: {
  projectId: string;
  contractValueCents: number | null;
  sovItems: SOVItemOption[];
  contractors: ContractorOption[];
  initialBids: SubBidRow[];
  /** Subs who bid before with no profile, to fill in the form as you type */
  pastBidders: PastBidder[];
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [bids, setBids] = useState(initialBids);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [pastBidders, setPastBidders] = useState(initialPastBidders);
  const [suggestField, setSuggestField] = useState<"bidderName" | "bidderCompany" | null>(null);

  const sovValues = useMemo(() => new Map(sovItems.map((s) => [s.id, s.scheduledValueCents ?? 0])), [sovItems]);
  const sovNames = useMemo(() => new Map(sovItems.map((s) => [s.id, s.description])), [sovItems]);
  const contractorById = useMemo(() => new Map(contractors.map((c) => [c.id, c])), [contractors]);

  // Typing a name or company under "No profile yet": past bidders who match
  // (click to fill in their info), plus subs who already have a profile.
  const suggestions = useMemo(() => {
    const q = (suggestField ? form[suggestField] : "").trim().toLowerCase();
    if (q.length < 2) return { bidders: [] as PastBidder[], profiles: [] as ContractorOption[] };
    const has = (v: string | null | undefined) => !!v && v.toLowerCase().includes(q);
    const isFilled = (b: PastBidder) =>
      (b.bidderName ?? "") === form.bidderName && (b.bidderCompany ?? "") === form.bidderCompany && (b.bidderEmail ?? "") === form.bidderEmail;
    return {
      bidders: pastBidders.filter((b) => (has(b.bidderName) || has(b.bidderCompany) || has(b.bidderEmail)) && !isFilled(b)).slice(0, 6),
      profiles: contractors.filter((c) => has(c.name)).slice(0, 3),
    };
  }, [suggestField, form, pastBidders, contractors]);

  function fillFromBidder(b: PastBidder) {
    setForm((f) => ({
      ...f,
      bidderName: b.bidderName ?? "",
      bidderCompany: b.bidderCompany ?? "",
      bidderEmail: b.bidderEmail ?? "",
      bidderPhone: b.bidderPhone ?? "",
    }));
    setSuggestField(null);
  }

  function pickProfile(c: ContractorOption) {
    setForm((f) => ({ ...f, mode: "profile", contractorId: c.id }));
    setSuggestField(null);
  }

  /** After saving a no-profile bid, remember the sub for next time without a reload. */
  function rememberBidder(row: SubBidRow) {
    const key = row.contractorId ? null : bidderKey(row);
    if (!key) return;
    setPastBidders((prev) => {
      const old = prev.find((b) => b.key === key);
      const merged: PastBidder = {
        key,
        bidderName: row.bidderName ?? old?.bidderName ?? null,
        bidderCompany: row.bidderCompany ?? old?.bidderCompany ?? null,
        bidderEmail: row.bidderEmail ?? old?.bidderEmail ?? null,
        bidderPhone: row.bidderPhone ?? old?.bidderPhone ?? null,
        bidCount: (old?.bidCount ?? 0) + (editingId ? 0 : 1),
        lastBidOn: row.receivedOn ?? old?.lastBidOn ?? null,
      };
      return [merged, ...prev.filter((b) => b.key !== key)];
    });
  }
  const contractorOptions = useMemo(
    () =>
      contractors.map((c) => {
        const scores = scoreText(c);
        return { value: c.id, label: `${c.status === "ACTIVE" ? c.name : `${c.name} (inactive)`}${scores ? ` · ${scores}` : ""}` };
      }),
    [contractors],
  );

  // Bids on the exact same lines sit together, cheapest first, whole job on top.
  const groups = useMemo(() => {
    const map = new Map<string, SubBidRow[]>();
    for (const b of bids) {
      const key = bidScopeKey(b.sovItemIds);
      map.set(key, [...(map.get(key) ?? []), b]);
    }
    return [...map.entries()]
      .map(([key, rows]) => {
        const sorted = [...rows].sort((a, b) => a.amountCents - b.amountCents);
        const ourCents = bidOurPriceCents(sorted[0].sovItemIds, sovValues, contractValueCents);
        const lowest = sorted.find((b) => ACTIVE.includes(b.status));
        return {
          key,
          title: key === "whole" ? "Whole job" : sorted[0].sovItemIds.map((id) => sovNames.get(id) ?? "Removed line").join(", "),
          ourCents,
          rows: sorted,
          lowestId: lowest && sorted.filter((b) => ACTIVE.includes(b.status)).length > 1 ? lowest.id : null,
        };
      })
      .sort((a, b) => (a.key === "whole" ? -1 : b.key === "whole" ? 1 : a.title.localeCompare(b.title)));
  }, [bids, sovValues, sovNames, contractValueCents]);

  const formOurCents = bidOurPriceCents(form.sovItemIds, sovValues, contractValueCents);
  const formAmountCents = Math.round(Number(form.amount.replace(/[$,]/g, "")) * 100);
  const formMargin = formOurCents != null && formAmountCents > 0 ? formOurCents - formAmountCents : null;

  function openNew() {
    setEditingId(null);
    setForm(emptyForm());
    setError("");
    setSuggestField(null);
    setFormOpen(true);
  }

  function openEdit(b: SubBidRow) {
    setEditingId(b.id);
    setForm(formFromBid(b));
    setError("");
    setFormOpen(true);
  }

  async function save() {
    setSaving(true);
    setError("");
    // A linked bid keeps whatever was typed about the bidder before it was linked.
    const payload = {
      contractorId: form.mode === "profile" ? form.contractorId || null : null,
      ...(form.mode === "new"
        ? { bidderName: form.bidderName, bidderCompany: form.bidderCompany, bidderEmail: form.bidderEmail, bidderPhone: form.bidderPhone }
        : {}),
      amount: form.amount,
      receivedOn: form.receivedOn || null,
      status: form.status,
      notes: form.notes,
      sovItemIds: form.sovItemIds,
    };
    const res = await fetch(editingId ? `/api/erp/projects/${projectId}/sub-bids/${editingId}` : `/api/erp/projects/${projectId}/sub-bids`, {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "Could not save.");
      return;
    }
    const row = data as SubBidRow;
    rememberBidder(row);
    setBids((prev) => (editingId ? prev.map((b) => (b.id === row.id ? row : b)) : [...prev, row]));
    setFormOpen(false);
  }

  async function setStatus(b: SubBidRow, status: SubBidStatus) {
    const res = await fetch(`/api/erp/projects/${projectId}/sub-bids/${b.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast(data.error ?? "Could not save.");
      return;
    }
    setBids((prev) => prev.map((x) => (x.id === b.id ? (data as SubBidRow) : x)));
  }

  async function remove(b: SubBidRow) {
    const ok = await confirm({ title: "Delete this bid?", message: `${bidderLabel(b)}, ${centsToDollars(b.amountCents)}.`, confirmLabel: "Delete" });
    if (!ok) return;
    const res = await fetch(`/api/erp/projects/${projectId}/sub-bids/${b.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast("Could not delete.");
      return;
    }
    setBids((prev) => prev.filter((x) => x.id !== b.id));
  }

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-1 text-sm font-semibold text-gray-800">
          Sub bids
          <InfoTip text="Bids subs gave us on this job. Margin is our price minus the bid: the contract value for whole-job bids, or the SOV line prices for bids on certain lines." wide />
        </p>
        <Button size="sm" onClick={openNew}>Add bid</Button>
      </div>

      {groups.length === 0 ? (
        <p className="rounded-md border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">No bids yet.</p>
      ) : (
        groups.map((g) => (
          <div key={g.key} className="overflow-hidden rounded-md border border-gray-200">
            <div className="flex items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-3 py-2">
              <p className="truncate text-sm font-medium text-gray-800">{g.title}</p>
              <p className="shrink-0 text-xs text-gray-500">
                Our price <span className="font-medium text-gray-800">{centsToDollars(g.ourCents)}</span>
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-gray-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Sub</th>
                    <th className="px-3 py-2 text-right font-medium">Bid</th>
                    <th className="px-3 py-2 text-right font-medium">Margin</th>
                    <th className="px-3 py-2 font-medium">Received</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {g.rows.map((b) => {
                    const margin = g.ourCents != null ? g.ourCents - b.amountCents : null;
                    const inactive = !ACTIVE.includes(b.status);
                    const details = [b.bidderCompany && b.contractorId == null ? b.bidderName : null, b.bidderEmail, b.bidderPhone, b.notes]
                      .filter(Boolean)
                      .join("\n");
                    return (
                      <tr key={b.id} className={inactive ? "text-gray-400" : "text-gray-800"}>
                        <td className="px-3 py-2">
                          <span className="flex items-center gap-1.5">
                            {b.contractorId ? (
                              <Link href={`/erp/contractors/${b.contractorId}`} className="font-medium hover:text-pink-600 hover:underline">
                                {bidderLabel(b)}
                              </Link>
                            ) : (
                              <>
                                <span className="font-medium">{bidderLabel(b)}</span>
                                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">No profile</span>
                              </>
                            )}
                            {b.contractorId ? <ScoreStars c={contractorById.get(b.contractorId)} /> : null}
                            {g.lowestId === b.id ? (
                              <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">Lowest</span>
                            ) : null}
                            {details ? <InfoTip text={details} wide /> : null}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">{centsToDollars(b.amountCents)}</td>
                        <td className={`px-3 py-2 text-right ${margin != null && margin < 0 && !inactive ? "text-red-600" : ""}`}>
                          {margin == null ? "-" : `${centsToDollars(margin)} (${pct(margin, g.ourCents ?? 0)})`}
                        </td>
                        <td className="px-3 py-2">{b.receivedOn ?? "-"}</td>
                        <td className="px-3 py-2">
                          <select
                            value={b.status}
                            onChange={(e) => setStatus(b, e.target.value as SubBidStatus)}
                            className={inputClass.xs}
                            aria-label="Status"
                          >
                            {SUB_BID_STATUSES.map((s) => (
                              <option key={s} value={s}>{SUB_BID_STATUS_LABELS[s]}</option>
                            ))}
                          </select>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">
                          <Button variant="ghost" size="xs" onClick={() => openEdit(b)}>Edit</Button>
                          <Button variant="ghost" size="xs" className="ml-2" onClick={() => remove(b)}>Delete</Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} size="lg">
        <div className="space-y-3">
          <p className="text-base font-semibold text-gray-900">{editingId ? "Edit bid" : "Add bid"}</p>

          <div className="flex gap-1 rounded-md bg-gray-100 p-1 text-xs">
            {(["profile", "new"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => set("mode", m)}
                className={`flex-1 rounded px-2 py-1 font-medium ${form.mode === m ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
              >
                {m === "profile" ? "Contractor profile" : "No profile yet"}
              </button>
            ))}
          </div>

          {form.mode === "profile" ? (
            <div>
              <label className={label}>Contractor</label>
              <div className="mt-1">
                <SearchableSelect value={form.contractorId} onChange={(v) => set("contractorId", v)} options={contractorOptions} placeholder="Search contractors" allLabel="Pick a contractor" />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {(["bidderName", "bidderCompany"] as const).map((field) => (
                <div key={field} className="relative">
                  <label className={label}>{field === "bidderName" ? "Name" : "Company"}</label>
                  <input
                    className={input}
                    value={form[field]}
                    autoComplete="off"
                    onChange={(e) => {
                      set(field, e.target.value);
                      setSuggestField(field);
                    }}
                    onFocus={() => setSuggestField(field)}
                    onBlur={() => setSuggestField(null)}
                  />
                  {suggestField === field && (suggestions.bidders.length > 0 || suggestions.profiles.length > 0) ? (
                    <div className="absolute left-0 z-20 mt-1 w-[calc(200%+0.75rem)] max-w-[calc(100vw-3rem)] overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg">
                      {suggestions.profiles.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => pickProfile(c)}
                          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
                        >
                          <span className="font-medium text-gray-900">{c.name}</span>
                          <span className="shrink-0 text-[11px] text-pink-600">Has a profile, use it</span>
                        </button>
                      ))}
                      {suggestions.bidders.map((b) => (
                        <button
                          key={b.key}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => fillFromBidder(b)}
                          className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                        >
                          <span className="flex items-center justify-between gap-2">
                            <span className="truncate font-medium text-gray-900">
                              {[b.bidderName, b.bidderCompany].filter(Boolean).join(", ")}
                            </span>
                            <span className="shrink-0 text-[11px] text-gray-400">
                              {b.bidCount} past bid{b.bidCount === 1 ? "" : "s"}
                            </span>
                          </span>
                          {b.bidderEmail || b.bidderPhone ? (
                            <span className="block truncate text-xs text-gray-500">{[b.bidderEmail, b.bidderPhone].filter(Boolean).join(" · ")}</span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
              <div>
                <label className={label}>Email</label>
                <input className={input} type="email" value={form.bidderEmail} onChange={(e) => set("bidderEmail", e.target.value)} />
              </div>
              <div>
                <label className={label}>Phone</label>
                <input className={input} value={form.bidderPhone} onChange={(e) => set("bidderPhone", e.target.value)} />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Bid amount ($)</label>
              <input className={input} inputMode="decimal" value={form.amount} onChange={(e) => set("amount", e.target.value)} />
            </div>
            <div>
              <label className={label}>Received</label>
              <input className={input} type="date" value={form.receivedOn} onChange={(e) => set("receivedOn", e.target.value)} />
            </div>
          </div>

          <div>
            <label className={`${label} flex items-center gap-1`}>
              Covers
              <InfoTip text="Leave empty if the bid is for the whole job." />
            </label>
            <div className="mt-1">
              <SOVMultiCombobox sovItems={sovItems} selectedIds={form.sovItemIds} onChange={(ids) => set("sovItemIds", ids)} />
            </div>
            <p className="mt-1.5 text-xs text-gray-500">
              Our price {centsToDollars(formOurCents)}
              {formMargin != null ? (
                <>
                  {" · "}
                  Margin <span className={formMargin < 0 ? "text-red-600" : "font-medium text-gray-800"}>{centsToDollars(formMargin)} ({pct(formMargin, formOurCents ?? 0)})</span>
                </>
              ) : null}
            </p>
          </div>

          {editingId ? (
            <div>
              <label className={label}>Status</label>
              <select className={input} value={form.status} onChange={(e) => set("status", e.target.value as SubBidStatus)}>
                {SUB_BID_STATUSES.map((s) => (
                  <option key={s} value={s}>{SUB_BID_STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
          ) : null}

          <div>
            <label className={label}>Notes</label>
            <textarea className={input} rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
