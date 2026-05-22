"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const inputCls =
  "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";
const labelCls = "block text-xs font-medium text-gray-600";

const BILLING_OPTIONS = [
  { value: "", label: "— None —" },
  { value: "BILLING", label: "Billing" },
  { value: "INACTIVE", label: "Inactive" },
  { value: "INVOICE_PAID", label: "Invoice Paid" },
];

type Props = {
  projectId: string;
  changeOrderId: string;
  percentInvoiced: number;
  billingStatus: string | null;
};

export function ChangeOrderBillingEditor({ projectId, changeOrderId, percentInvoiced, billingStatus }: Props) {
  const router = useRouter();
  const [pct, setPct] = useState(percentInvoiced === 0 ? "" : String(percentInvoiced));
  const [status, setStatus] = useState(billingStatus ?? "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/erp/projects/${projectId}/change-orders/${changeOrderId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          percentInvoiced: pct === "" ? 0 : Number(pct),
          billingStatus: status || null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Update failed");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Billing</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor="co-billing-pct">
            % Invoiced
          </label>
          <input
            id="co-billing-pct"
            type="number"
            min={0}
            max={100}
            step={1}
            className={inputCls}
            value={pct}
            onChange={(e) => setPct(e.target.value)}
            placeholder="0"
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="co-billing-status">
            Billing status
          </label>
          <select
            id="co-billing-status"
            className={inputCls}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {BILLING_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error ? (
        <p className="mt-2 text-xs text-red-400" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={loading}
        className="mt-4 rounded-md bg-pink-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-pink-500 disabled:opacity-50"
      >
        {loading ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
