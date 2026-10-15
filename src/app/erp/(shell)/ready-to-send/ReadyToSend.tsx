"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, InfoTip, Modal, inputClass, labelClass, useConfirm, useToast } from "@/app/erp/components/ui";
import { centsToDollars, parseMoneyInput } from "@/lib/erp/money";
import type { DraftLine } from "@/lib/hubspot/invoiceDrafts";

export type MonthRow = { periodId: string; building: string; month: string; note: string | null; discardedBy: string | null };

export type DraftRow = MonthRow & {
  /** month: a janitorial month (periodId). items: picked finished work (rowId is the ItemInvoiceDraft id). */
  kind: "month" | "items";
  rowId: string;
  hubspotInvoiceId: string;
  invoiceDateKey: string;
  dueDate: string | null;
  lines: DraftLine[];
  amountCents: number;
  charges: { description: string; amountCents: number }[];
  /** What the ERP says the invoice should total now */
  totalCents: number;
  /** What was last pushed to the HubSpot draft */
  draftTotalCents: number;
  client: string | null;
  method: string | null;
  sendTo: string | null;
};

export type BillableItemRow = { key: string; kind: "TURN" | "SOV" | "CO"; title: string; lineDescription: string; cents: number; doneKey: string; href: string };

export type BillableGroupRow = {
  key: string;
  name: string;
  type: "BUILDING" | "PROJECT";
  hasDeal: boolean;
  client: string | null;
  method: string | null;
  sendTo: string | null;
  items: BillableItemRow[];
};

/** API base for a draft row: janitorial months and picked items live in different places. */
function draftUrl(d: DraftRow): string {
  return d.kind === "month" ? `/api/erp/invoice-drafts/${d.rowId}` : `/api/erp/item-drafts/${d.rowId}`;
}

export type ContractSetting = {
  id: string;
  building: string;
  label: string;
  autoDraft: boolean;
  billingDay: number;
  monthlyRateCents: number;
  hasDeal: boolean;
  nextDraftKey: string;
};

function fmtDay(key: string | null): string {
  if (!key) return "Not set";
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

async function call(url: string, method: string, body?: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { ok: res.ok, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

export function ReadyToSend({
  drafts,
  billable,
  failed,
  discarded,
  contracts,
  approveEnabled,
  isAdmin,
}: {
  drafts: DraftRow[];
  billable: BillableGroupRow[];
  failed: MonthRow[];
  discarded: MonthRow[];
  contracts: ContractSetting[];
  approveEnabled: boolean;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<DraftRow | null>(null);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
      router.refresh();
    }
  }

  async function draftNow() {
    await run("draft-now", async () => {
      const { ok, data } = await call("/api/erp/invoice-drafts/run", "POST", {});
      if (!ok) return toast(String(data.error ?? "Could not run."));
      const outcomes = (data.outcomes ?? []) as { result: string; building: string; month: string; note?: string }[];
      const made = outcomes.filter((o) => o.result === "drafted").length;
      const errors = outcomes.filter((o) => o.result === "error");
      toast(
        errors.length
          ? `${made} drafted. ${errors.length} failed: ${errors.map((e) => `${e.building} ${e.month}`).join(", ")}.`
          : made
            ? `${made} draft${made === 1 ? "" : "s"} made.`
            : "Nothing due yet.",
      );
    });
  }

  async function approve(rows: DraftRow[]) {
    const total = rows.reduce((s, r) => s + r.totalCents, 0);
    const ok = await confirm({
      title: rows.length === 1 ? `Approve ${rows[0]!.building}, ${rows[0]!.month}?` : `Approve ${rows.length} invoices?`,
      message: `Opens ${rows.length === 1 ? "the invoice" : "them"} in HubSpot (${centsToDollars(total)}). HubSpot sends open invoices to QuickBooks. This can't be undone from the ERP.`,
      confirmLabel: "Approve",
      danger: false,
    });
    if (!ok) return;
    await run("approve", async () => {
      const done: string[] = [];
      for (const r of rows) {
        const { ok: good, data } = await call(`${draftUrl(r)}/approve`, "POST");
        if (!good) {
          toast(`${r.building} ${r.month}: ${String(data.error ?? "Could not approve.")}`);
          break;
        }
        done.push(String(data.number ?? r.building));
      }
      if (done.length) toast(`Approved ${done.join(", ")}.`);
      setSelected(new Set());
    });
  }

  async function discard(r: DraftRow) {
    const ok = await confirm({
      title: `Discard ${r.building}, ${r.month}?`,
      message:
        r.kind === "month"
          ? "Deletes the draft in HubSpot. This month won't be drafted again unless you click Draft again below."
          : "Deletes the draft in HubSpot. Its items go back on Ready to bill.",
      confirmLabel: "Discard",
      danger: true,
    });
    if (!ok) return;
    await run(`discard-${r.rowId}`, async () => {
      const { ok: good, data } = await call(draftUrl(r), "DELETE");
      toast(good ? "Discarded." : String(data.error ?? "Could not discard."));
    });
  }

  async function redraft(m: MonthRow) {
    await run(`redraft-${m.periodId}`, async () => {
      const { ok, data } = await call(`/api/erp/invoice-drafts/${m.periodId}/redraft`, "POST");
      toast(ok ? "Drafted." : String(data.error ?? "Could not draft."));
    });
  }

  async function setApprove(on: boolean) {
    await run("approve-switch", async () => {
      const { ok, data } = await call("/api/erp/invoice-drafts/settings", "PUT", { approveEnabled: on });
      if (!ok) toast(String(data.error ?? "Could not save."));
    });
  }

  const selectedRows = drafts.filter((d) => selected.has(d.rowId));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm ${approveEnabled ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
          Approve is {approveEnabled ? "on" : "off"}
          <InfoTip text="Off until the first real invoice is approved together with the bookkeeper watching QuickBooks. Only an Admin can switch it." />
          {isAdmin && (
            <Button size="xs" variant="secondary" disabled={busy !== null} onClick={() => void setApprove(!approveEnabled)}>
              Turn {approveEnabled ? "off" : "on"}
            </Button>
          )}
        </div>
        <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => void draftNow()}>
          {busy === "draft-now" ? "Checking…" : "Draft now"}
        </Button>
        <InfoTip text="Runs the same check as the daily run: drafts any month that's due for contracts with Auto-draft on." />
        {selectedRows.length > 0 && (
          <Button size="sm" className="ml-auto" disabled={!approveEnabled || busy !== null} onClick={() => void approve(selectedRows)}>
            Approve selected ({selectedRows.length})
          </Button>
        )}
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-900">Drafts waiting ({drafts.length})</h2>
        {drafts.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">No drafts waiting.</p>
        ) : (
          drafts.map((d) => {
            const stale = d.totalCents !== d.draftTotalCents;
            return (
              <div key={d.rowId} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={selected.has(d.rowId)}
                      onChange={(e) =>
                        setSelected((s) => {
                          const next = new Set(s);
                          if (e.target.checked) next.add(d.rowId);
                          else next.delete(d.rowId);
                          return next;
                        })
                      }
                    />
                    <span>
                      <span className="block font-medium text-gray-900">
                        {d.building}, {d.month}
                      </span>
                      <span className="block text-xs text-gray-500">
                        Invoice date {fmtDay(d.invoiceDateKey)} · Due {fmtDay(d.dueDate)}
                      </span>
                    </span>
                  </label>
                  <div className="text-right">
                    <div className="text-lg font-semibold tabular-nums text-gray-900">{centsToDollars(d.totalCents)}</div>
                    <div className="text-xs text-gray-500">
                      {d.client ?? "No client company"}
                      {d.method ? ` · ${d.method}` : ""}
                      {d.sendTo ? ` · ${d.sendTo}` : ""}
                    </div>
                  </div>
                </div>
                <table className="mt-3 w-full text-sm">
                  <tbody className="divide-y divide-gray-100">
                    {d.lines.map((l, i) => (
                      <tr key={i}>
                        <td className="py-1 pr-2 text-gray-900">
                          {l.name}
                          <span className="ml-2 text-xs text-gray-500">{l.description}</span>
                        </td>
                        <td className="py-1 text-right tabular-nums text-gray-900">{centsToDollars(l.amountCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(d.note || stale) && (
                  <div className="mt-2 space-y-1 text-xs text-amber-800">
                    {d.note && <p className="rounded bg-amber-50 px-2 py-1">{d.note}</p>}
                    {stale && (
                      <p className="rounded bg-amber-50 px-2 py-1">
                        The draft in HubSpot says {centsToDollars(d.draftTotalCents)}. Approve updates it to {centsToDollars(d.totalCents)} first.
                      </p>
                    )}
                  </div>
                )}
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700" disabled={busy !== null} onClick={() => void discard(d)}>
                    Discard
                  </Button>
                  {d.kind === "month" && (
                    <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => setEditing(d)}>
                      Edit
                    </Button>
                  )}
                  <Button size="sm" disabled={!approveEnabled || busy !== null} onClick={() => void approve([d])} title={approveEnabled ? undefined : "Approve is off"}>
                    Approve
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </section>

      <ReadyToBill groups={billable} />

      {failed.length > 0 && (
        <section className="space-y-2">
          <h2 className="flex items-center gap-1 text-sm font-semibold text-gray-900">
            Couldn&apos;t draft
            <InfoTip text="Months the ERP tried to draft but HubSpot said no. Fix the reason, then Try again." />
          </h2>
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white text-sm shadow-sm">
            {failed.map((m) => (
              <li key={m.periodId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                <div className="min-w-0">
                  <div className="font-medium text-gray-900">
                    {m.building}, {m.month}
                  </div>
                  <div className="text-xs text-red-700">{m.note}</div>
                </div>
                <Button size="xs" variant="secondary" disabled={busy !== null} onClick={() => void redraft(m)}>
                  Try again
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {discarded.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-900">Discarded</h2>
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white text-sm shadow-sm">
            {discarded.map((m) => (
              <li key={m.periodId} className="flex items-center justify-between gap-2 px-4 py-2">
                <span className="text-gray-700">
                  {m.building}, {m.month}
                  {m.discardedBy && <span className="ml-2 text-xs text-gray-500">by {m.discardedBy}</span>}
                </span>
                <Button size="xs" variant="secondary" disabled={busy !== null} onClick={() => void redraft(m)}>
                  Draft again
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ContractSettings contracts={contracts} />

      {editing && <EditDraft draft={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ContractSettings({ contracts }: { contracts: ContractSetting[] }) {
  const router = useRouter();
  const toast = useToast();
  const [labels, setLabels] = useState<Record<string, string>>(() => Object.fromEntries(contracts.map((c) => [c.id, c.label])));

  async function patch(id: string, body: Record<string, unknown>) {
    const { ok, data } = await call(`/api/erp/invoice-drafts/contracts/${id}`, "PATCH", body);
    if (!ok) toast(String(data.error ?? "Could not save."));
    router.refresh();
  }

  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-1 text-sm font-semibold text-gray-900">
        Janitorial contracts
        <InfoTip text="Turn Auto-draft on one contract at a time. Turn it on only once nobody makes that contract's invoice by hand in HubSpot, or the month gets two invoices." />
      </h2>
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2 font-medium">Auto-draft</th>
              <th className="px-3 py-2 font-medium">Building</th>
              <th className="px-3 py-2 font-medium">
                <span className="inline-flex items-center gap-1">
                  Invoice label
                  <InfoTip text='Shown as "Recurring cleaning <label>" on the invoice. Blank uses the building name.' />
                </span>
              </th>
              <th className="px-3 py-2 text-right font-medium">Monthly</th>
              <th className="px-3 py-2 font-medium">Billing day</th>
              <th className="px-3 py-2 font-medium">Next draft</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {contracts.map((c) => (
              <tr key={c.id}>
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label={`Auto-draft ${c.building}`}
                    checked={c.autoDraft}
                    disabled={!c.hasDeal && !c.autoDraft}
                    onChange={(e) => void patch(c.id, { autoDraftInvoices: e.target.checked })}
                  />
                </td>
                <td className="px-3 py-2 text-gray-900">
                  {c.building}
                  {!c.hasDeal && <span className="ml-2 text-xs text-red-700">No HubSpot deal linked</span>}
                </td>
                <td className="px-3 py-2">
                  <input
                    value={labels[c.id] ?? ""}
                    placeholder={c.building}
                    onChange={(e) => setLabels((l) => ({ ...l, [c.id]: e.target.value }))}
                    onBlur={() => (labels[c.id] ?? "") !== c.label && void patch(c.id, { invoiceLabel: labels[c.id] ?? "" })}
                    className={`${inputClass.sm} w-48`}
                  />
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-900">{centsToDollars(c.monthlyRateCents)}</td>
                <td className="px-3 py-2 text-gray-700">{c.billingDay}</td>
                <td className="px-3 py-2 text-gray-700">{c.autoDraft ? fmtDay(c.nextDraftKey) : <span className="text-gray-400">Off</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function EditDraft({ draft, onClose }: { draft: DraftRow; onClose: () => void }) {
  const router = useRouter();
  const [amount, setAmount] = useState((draft.amountCents / 100).toFixed(2));
  const [extras, setExtras] = useState(draft.charges.map((c) => ({ description: c.description, amount: (c.amountCents / 100).toFixed(2) })));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    const amountCents = parseMoneyInput(amount);
    if (amountCents == null) return setError("Enter the monthly amount.");
    const charges = [];
    for (const x of extras) {
      if (!x.description.trim() && !x.amount.trim()) continue;
      const cents = parseMoneyInput(x.amount);
      if (!x.description.trim() || cents == null) return setError("Each extra needs a description and an amount.");
      charges.push({ description: x.description.trim(), amountCents: cents });
    }
    setSaving(true);
    setError("");
    const { ok, data } = await call(`/api/erp/invoice-drafts/${draft.periodId}`, "PUT", { amountCents, charges });
    setSaving(false);
    if (!ok) return setError(String(data.error ?? "Could not save."));
    onClose();
    router.refresh();
  }

  return (
    <Modal open onClose={onClose} dismissible={!saving} size="md">
      <h3 className="text-base font-semibold text-gray-900">
        {draft.building}, {draft.month}
      </h3>
      <p className="mt-1 text-xs text-gray-500">Saves on the month in the ERP (Billing shows the same) and updates the HubSpot draft.</p>
      <div className="mt-4 space-y-3">
        <label className={labelClass.default}>
          Monthly amount
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className={`${inputClass.md} sm:w-40`} />
        </label>
        <div>
          <span className={`${labelClass.default} flex items-center gap-1`}>
            Extras this month
            <InfoTip text="Each extra is its own line on the invoice, e.g. Pool chairs cleaning." />
          </span>
          <div className="mt-1 space-y-2">
            {extras.map((x, i) => (
              <div key={i} className="flex gap-2">
                <input
                  value={x.description}
                  onChange={(e) => setExtras((xs) => xs.map((y, j) => (j === i ? { ...y, description: e.target.value } : y)))}
                  placeholder="Description"
                  className={`${inputClass.sm} flex-1`}
                />
                <input
                  value={x.amount}
                  onChange={(e) => setExtras((xs) => xs.map((y, j) => (j === i ? { ...y, amount: e.target.value } : y)))}
                  placeholder="0.00"
                  inputMode="decimal"
                  className={`${inputClass.sm} w-28`}
                />
                <Button size="xs" variant="ghost" onClick={() => setExtras((xs) => xs.filter((_, j) => j !== i))}>
                  Remove
                </Button>
              </div>
            ))}
            <Button size="xs" variant="secondary" onClick={() => setExtras((xs) => [...xs, { description: "", amount: "" }])}>
              + Add extra
            </Button>
          </div>
        </div>
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </Modal>
  );
}


/** Finished, unbilled work with no invoice yet. Tick items and draft: one invoice per building or job. */
function ReadyToBill({ groups }: { groups: BillableGroupRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const allItems = groups.flatMap((g) => g.items);
  const amountOf = (i: BillableItemRow) => amounts[i.key] ?? (i.cents / 100).toFixed(2);
  const pickedItems = allItems.filter((i) => picked.has(i.key));
  const pickedGroups = groups.filter((g) => g.items.some((i) => picked.has(i.key))).length;

  function toggle(keys: string[], on: boolean) {
    setPicked((p) => {
      const next = new Set(p);
      for (const k of keys) {
        if (on) next.add(k);
        else next.delete(k);
      }
      return next;
    });
  }

  async function draft() {
    const picks = [];
    for (const i of pickedItems) {
      const cents = parseMoneyInput(amountOf(i));
      if (cents == null || cents < 0) return toast(`Check the amount for ${i.title}.`);
      picks.push({ key: i.key, amountCents: cents });
    }
    setBusy(true);
    const { ok, data } = await call("/api/erp/item-drafts", "POST", { picks });
    setBusy(false);
    if (!ok) return toast(String(data.error ?? "Could not draft."));
    const results = (data.results ?? []) as { group: string; ok: boolean; note?: string }[];
    const made = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok);
    toast(failed.length ? `${made} drafted. Not drafted: ${failed.map((f) => `${f.group} (${f.note})`).join("; ")}` : `${made} draft${made === 1 ? "" : "s"} made.`);
    setPicked(new Set());
    setAmounts({});
    router.refresh();
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-1 text-sm font-semibold text-gray-900">
          Ready to bill ({allItems.length})
          <InfoTip text="Finished work that isn't billed and has no invoice yet: unit turns, post-construction SOV lines and change orders. Tick what to bill and click Draft invoice. You get one draft per building or job, one line per item. Amounts can be changed first." />
        </h2>
        {pickedItems.length > 0 && (
          <Button size="sm" className="ml-auto" disabled={busy} onClick={() => void draft()}>
            {busy ? "Drafting…" : `Draft invoice${pickedGroups === 1 ? "" : "s"} (${pickedItems.length} item${pickedItems.length === 1 ? "" : "s"}, ${pickedGroups} invoice${pickedGroups === 1 ? "" : "s"})`}
          </Button>
        )}
      </div>
      {groups.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">Nothing finished is waiting to be billed.</p>
      ) : (
        groups.map((g) => {
          const keys = g.items.map((i) => i.key);
          const all = keys.every((k) => picked.has(k));
          return (
            <div key={g.key} className="rounded-lg border border-gray-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-2">
                <label className="flex items-center gap-2 font-medium text-gray-900">
                  <input type="checkbox" checked={all} disabled={!g.hasDeal} onChange={(e) => toggle(keys, e.target.checked)} />
                  {g.name}
                  <span className="text-xs font-normal text-gray-500">{g.type === "BUILDING" ? "Building" : "Job"}</span>
                </label>
                <span className="text-xs text-gray-500">
                  {g.hasDeal ? (
                    [g.client ?? "No client company", g.method, g.sendTo].filter(Boolean).join(" · ")
                  ) : (
                    <span className="text-red-700">No HubSpot deal linked, so it can&apos;t be drafted here</span>
                  )}
                </span>
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  {g.items.map((i) => (
                    <tr key={i.key}>
                      <td className="w-8 px-4 py-1.5">
                        <input type="checkbox" aria-label={`Bill ${i.title}`} checked={picked.has(i.key)} disabled={!g.hasDeal} onChange={(e) => toggle([i.key], e.target.checked)} />
                      </td>
                      <td className="py-1.5 pr-2">
                        <a href={i.href} className="text-gray-900 hover:text-pink-600">
                          {i.kind === "TURN" ? i.lineDescription : i.title}
                        </a>
                        <span className="ml-2 text-xs text-gray-500">
                          {i.kind === "TURN" ? "Unit turn" : i.kind === "SOV" ? "SOV line" : "Change order"} · done {fmtDay(i.doneKey)}
                        </span>
                      </td>
                      <td className="px-4 py-1.5 text-right">
                        <input
                          aria-label={`Amount for ${i.title}`}
                          value={amountOf(i)}
                          onChange={(e) => setAmounts((a) => ({ ...a, [i.key]: e.target.value }))}
                          inputMode="decimal"
                          className={`${inputClass.sm} w-28 text-right tabular-nums`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })
      )}
    </section>
  );
}
