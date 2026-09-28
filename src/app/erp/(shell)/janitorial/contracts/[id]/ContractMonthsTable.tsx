"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { centsToDollars } from "@/lib/erp/money";
import { PERIOD_BILLING_OPTIONS, billingBadgeCls } from "../../badges";

type Charge = { id: string; description: string; amountCents: number };
type Month = {
  id: string;
  periodStart: string;
  amountCents: number;
  billingStatus: string;
  commissionPaid: boolean;
  charges: Charge[];
};

function formatMonth(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function monthTotal(m: Month): number {
  return m.amountCents + m.charges.reduce((s, c) => s + c.amountCents, 0);
}

export function ContractMonthsTable({ contractId, months }: { contractId: string; months: Month[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [newMonth, setNewMonth] = useState(new Date().toISOString().slice(0, 7));

  const [editingAmountId, setEditingAmountId] = useState<string | null>(null);
  const [amountInput, setAmountInput] = useState("");

  const [addingChargeId, setAddingChargeId] = useState<string | null>(null);
  const [chargeDescription, setChargeDescription] = useState("");
  const [chargeAmount, setChargeAmount] = useState("");

  async function send(url: string, method: string, body?: unknown): Promise<boolean> {
    setError("");
    setBusy(true);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Something went wrong");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("Network error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addMonth(e: React.FormEvent) {
    e.preventDefault();
    await send(`/api/erp/janitorial/contracts/${contractId}/periods`, "POST", { month: newMonth });
  }

  async function saveAmount(m: Month) {
    if (await send(`/api/erp/janitorial/periods/${m.id}`, "PATCH", { amount: amountInput })) setEditingAmountId(null);
  }

  async function addCharge(e: React.FormEvent, m: Month) {
    e.preventDefault();
    const ok = await send(`/api/erp/janitorial/periods/${m.id}/charges`, "POST", {
      description: chargeDescription,
      amount: chargeAmount,
    });
    if (ok) {
      setAddingChargeId(null);
      setChargeDescription("");
      setChargeAmount("");
    }
  }

  function removeCharge(c: Charge) {
    if (!confirm(`Remove "${c.description}"?`)) return;
    void send(`/api/erp/janitorial/charges/${c.id}`, "DELETE");
  }

  function removeMonth(m: Month) {
    if (!confirm(`Remove ${formatMonth(m.periodStart)}? Use this only for a month that shouldn't be billed.`)) return;
    void send(`/api/erp/janitorial/periods/${m.id}`, "DELETE");
  }

  const billedTotal = months.reduce((s, m) => s + monthTotal(m), 0);
  const paidTotal = months.filter((m) => m.billingStatus === "PAID").reduce((s, m) => s + monthTotal(m), 0);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Billing by month</h2>
          <p className="text-xs text-gray-500">
            Months are added automatically on the billing day. Total {centsToDollars(billedTotal)}, paid {centsToDollars(paidTotal)}, outstanding{" "}
            {centsToDollars(billedTotal - paidTotal)}.
          </p>
        </div>
        <form onSubmit={addMonth} className="flex items-end gap-2">
          <div>
            <label className="block text-xs font-medium text-gray-600" htmlFor="add-month">Add a month manually</label>
            <input
              id="add-month"
              type="month"
              value={newMonth}
              onChange={(e) => setNewMonth(e.target.value)}
              className="mt-1 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900"
            />
          </div>
          <button type="submit" disabled={busy || !newMonth} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            Add
          </button>
        </form>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-gray-300 bg-gray-200 text-xs font-semibold uppercase text-gray-700">
              <tr>
                <th className="px-4 py-3">Month</th>
                <th className="px-4 py-3 text-right">Base amount</th>
                <th className="px-4 py-3">Extras</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Billing status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {months.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">No months yet. The first one is added on the next billing day.</td>
                </tr>
              ) : (
                months.map((m) => (
                  <tr key={m.id} className="border-t border-gray-100 align-top">
                    <td className="px-4 py-3 font-medium text-gray-900">{formatMonth(m.periodStart)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {editingAmountId === m.id ? (
                        <div className="flex items-center justify-end gap-2">
                          <input
                            type="text"
                            value={amountInput}
                            onChange={(e) => setAmountInput(e.target.value)}
                            className="w-24 rounded-md border border-gray-300 px-2 py-1 text-right text-sm"
                            aria-label="Base amount"
                          />
                          <button type="button" disabled={busy} onClick={() => saveAmount(m)} className="text-xs font-medium text-pink-600 hover:underline">
                            Save
                          </button>
                          <button type="button" onClick={() => setEditingAmountId(null)} className="text-xs text-gray-500 hover:underline">
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingAmountId(m.id);
                            setAmountInput((m.amountCents / 100).toFixed(2));
                          }}
                          className="text-gray-900 hover:text-pink-600 hover:underline"
                          title="Edit this month's amount (e.g. a prorated first month)"
                        >
                          {centsToDollars(m.amountCents)}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <ul className="space-y-1">
                        {m.charges.map((c) => (
                          <li key={c.id} className="flex items-center gap-2 text-xs text-gray-700">
                            <span>{c.description}</span>
                            <span className="tabular-nums text-gray-500">{centsToDollars(c.amountCents)}</span>
                            <button type="button" onClick={() => removeCharge(c)} className="text-gray-400 hover:text-red-600" aria-label={`Remove ${c.description}`}>
                              ×
                            </button>
                          </li>
                        ))}
                      </ul>
                      {addingChargeId === m.id ? (
                        <form onSubmit={(e) => addCharge(e, m)} className="mt-1 flex flex-wrap items-center gap-1.5">
                          <input
                            type="text"
                            placeholder="Description"
                            value={chargeDescription}
                            onChange={(e) => setChargeDescription(e.target.value)}
                            className="w-40 rounded-md border border-gray-300 px-2 py-1 text-xs"
                          />
                          <input
                            type="text"
                            placeholder="$0.00"
                            value={chargeAmount}
                            onChange={(e) => setChargeAmount(e.target.value)}
                            className="w-20 rounded-md border border-gray-300 px-2 py-1 text-xs"
                          />
                          <button type="submit" disabled={busy} className="text-xs font-medium text-pink-600 hover:underline">
                            Add
                          </button>
                          <button type="button" onClick={() => setAddingChargeId(null)} className="text-xs text-gray-500 hover:underline">
                            Cancel
                          </button>
                        </form>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setAddingChargeId(m.id);
                            setChargeDescription("");
                            setChargeAmount("");
                          }}
                          className="mt-1 text-xs text-pink-600 hover:underline"
                        >
                          + Add extra
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">{centsToDollars(monthTotal(m))}</td>
                    <td className="px-4 py-3">
                      <select
                        value={m.billingStatus}
                        disabled={busy}
                        onChange={(e) => send(`/api/erp/janitorial/periods/${m.id}`, "PATCH", { billingStatus: e.target.value })}
                        className={`cursor-pointer rounded-full border px-2.5 py-0.5 text-xs font-semibold focus:outline-none ${billingBadgeCls(m.billingStatus)}`}
                      >
                        {PERIOD_BILLING_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {m.billingStatus === "NOT_BILLED" && !m.commissionPaid && (
                        <button type="button" onClick={() => removeMonth(m)} className="text-xs text-gray-400 hover:text-red-600 hover:underline">
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
