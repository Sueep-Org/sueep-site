"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { centsToDollars } from "@/lib/erp/money";

export type MaterialRow = {
  id: string;
  usedOn: string;
  category: "CLEANING_PRODUCTS" | "PAINT";
  itemName: string;
  quantity: number | null;
  unit: string | null;
  costCents: number;
  notes: string | null;
};

const input =
  "mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";
const label = "block text-xs font-medium text-zinc-400";

const categoryLabel = {
  CLEANING_PRODUCTS: "Cleaning products",
  PAINT: "Paint",
} as const;

export function ProjectMaterialsSection({
  projectId,
  initialEntries,
}: {
  projectId: string;
  initialEntries: MaterialRow[];
}) {
  const router = useRouter();
  const [entries, setEntries] = useState(initialEntries);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setEntries(initialEntries);
  }, [initialEntries]);

  async function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const usedOn = String(fd.get("usedOn") || "");
    const category = String(fd.get("category") || "CLEANING_PRODUCTS");
    const itemName = String(fd.get("itemName") || "").trim();
    const quantity = String(fd.get("quantity") || "").trim();
    const unit = String(fd.get("unit") || "").trim();
    const cost = String(fd.get("cost") || "").trim();
    const notes = String(fd.get("notes") || "").trim();

    try {
      const res = await fetch(`/api/erp/projects/${projectId}/materials`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          usedOn: usedOn ? new Date(usedOn).toISOString() : "",
          category,
          itemName,
          quantity: quantity || undefined,
          unit: unit || undefined,
          cost: cost || undefined,
          notes: notes || undefined,
        }),
      });
      const data = (await res.json()) as MaterialRow & { error?: string };
      if (!res.ok) {
        setError(data.error || "Failed to add material");
        setLoading(false);
        return;
      }
      setEntries((prev) => [data, ...prev]);
      e.currentTarget.reset();
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  const totalCostCents = entries.reduce((s, e) => s + e.costCents, 0);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Materials log</h2>
          <p className="text-sm text-zinc-300">
            Total materials: <span className="font-semibold text-white">{centsToDollars(totalCostCents)}</span>
          </p>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-zinc-800 text-xs uppercase text-zinc-500">
              <tr>
                <th className="py-2 pr-2 font-medium">Date</th>
                <th className="py-2 pr-2 font-medium">Category</th>
                <th className="py-2 pr-2 font-medium">Item</th>
                <th className="py-2 pr-2 font-medium">Qty</th>
                <th className="py-2 pr-2 font-medium">Cost</th>
                <th className="py-2 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-zinc-500">
                    No material entries yet.
                  </td>
                </tr>
              ) : (
                entries.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2 pr-2 text-zinc-300">{new Date(r.usedOn).toLocaleDateString()}</td>
                    <td className="py-2 pr-2 text-zinc-300">{categoryLabel[r.category]}</td>
                    <td className="py-2 pr-2 text-white">{r.itemName}</td>
                    <td className="py-2 pr-2 text-zinc-300">
                      {r.quantity != null ? `${r.quantity}${r.unit ? ` ${r.unit}` : ""}` : "—"}
                    </td>
                    <td className="py-2 pr-2 text-zinc-200">{centsToDollars(r.costCents)}</td>
                    <td className="py-2 text-zinc-500">{r.notes || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <form onSubmit={onAdd} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Add material entry</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className={label} htmlFor="m-usedOn">
              Date *
            </label>
            <input id="m-usedOn" name="usedOn" type="date" required className={input} />
          </div>
          <div>
            <label className={label} htmlFor="m-category">
              Category *
            </label>
            <select id="m-category" name="category" defaultValue="CLEANING_PRODUCTS" className={input}>
              <option value="CLEANING_PRODUCTS">Cleaning products</option>
              <option value="PAINT">Paint</option>
            </select>
          </div>
          <div>
            <label className={label} htmlFor="m-item">
              Item *
            </label>
            <input id="m-item" name="itemName" required className={input} placeholder="e.g. Degreaser, primer" />
          </div>
          <div>
            <label className={label} htmlFor="m-qty">
              Quantity
            </label>
            <input id="m-qty" name="quantity" type="number" min={0} step={0.01} className={input} />
          </div>
          <div>
            <label className={label} htmlFor="m-unit">
              Unit
            </label>
            <input id="m-unit" name="unit" className={input} placeholder="gal, bottle, case" />
          </div>
          <div>
            <label className={label} htmlFor="m-cost">
              Cost (USD) *
            </label>
            <input id="m-cost" name="cost" required className={input} placeholder="0.00" />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className={label} htmlFor="m-notes">
              Notes
            </label>
            <input id="m-notes" name="notes" className={input} />
          </div>
        </div>
        {error ? (
          <p className="mt-3 text-sm text-red-400" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={loading}
          className="mt-4 rounded-md bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50"
        >
          {loading ? "Adding…" : "Add material"}
        </button>
      </form>
    </div>
  );
}