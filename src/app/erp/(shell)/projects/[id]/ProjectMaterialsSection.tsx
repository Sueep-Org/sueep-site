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
  "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";
const editInput =
  "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";
const label = "block text-xs font-medium text-gray-600";

const categoryLabel: Record<string, string> = {
  CLEANING_PRODUCTS: "Cleaning products",
  PAINT: "Paint",
};

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
  const [filterDate, setFilterDate] = useState("");
  const [filterItem, setFilterItem] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<{
    usedOn: string; category: string; itemName: string;
    quantity: string; unit: string; cost: string; notes: string;
  }>({ usedOn: "", category: "CLEANING_PRODUCTS", itemName: "", quantity: "", unit: "", cost: "", notes: "" });

  useEffect(() => { setEntries(initialEntries); }, [initialEntries]);

  async function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const form = e.currentTarget;
    const fd = new FormData(form);
    try {
      const res = await fetch(`/api/erp/projects/${projectId}/materials`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          usedOn: String(fd.get("usedOn") || ""),
          category: String(fd.get("category") || "CLEANING_PRODUCTS"),
          itemName: String(fd.get("itemName") || "").trim(),
          quantity: String(fd.get("quantity") || "").trim() || undefined,
          unit: String(fd.get("unit") || "").trim() || undefined,
          cost: String(fd.get("cost") || "").trim() || undefined,
          notes: String(fd.get("notes") || "").trim() || undefined,
        }),
      });
      const data = (await res.json()) as MaterialRow & { error?: string };
      if (!res.ok) { setError(data.error || "Failed to add material"); return; }
      setEntries((prev) => [data, ...prev]);
      form.reset();
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  function startEdit(r: MaterialRow) {
    setEditingId(r.id);
    setEditFields({
      usedOn: new Date(r.usedOn).toLocaleDateString("en-CA", { timeZone: "America/New_York" }),
      category: r.category,
      itemName: r.itemName,
      quantity: r.quantity != null ? String(r.quantity) : "",
      unit: r.unit ?? "",
      cost: (r.costCents / 100).toFixed(2),
      notes: r.notes ?? "",
    });
  }

  async function onSaveEdit(id: string) {
    const res = await fetch(`/api/erp/projects/${projectId}/materials/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        usedOn: editFields.usedOn,
        category: editFields.category,
        itemName: editFields.itemName,
        quantity: editFields.quantity || undefined,
        unit: editFields.unit || undefined,
        cost: editFields.cost,
        notes: editFields.notes || undefined,
      }),
    });
    if (res.ok) {
      const updated = (await res.json()) as MaterialRow;
      setEntries((prev) => prev.map((e) => (e.id === id ? updated : e)));
      setEditingId(null);
      router.refresh();
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this material entry?")) return;
    const res = await fetch(`/api/erp/projects/${projectId}/materials/${id}`, { method: "DELETE" });
    if (res.ok) {
      setEntries((prev) => prev.filter((e) => e.id !== id));
      router.refresh();
    }
  }

  const visibleEntries = entries.filter((r) => {
    if (filterDate) {
      const rowDate = new Date(r.usedOn).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
      if (rowDate !== filterDate) return false;
    }
    if (filterItem && !r.itemName.toLowerCase().includes(filterItem.toLowerCase())) return false;
    return true;
  });

  const totalCostCents = entries.reduce((s, e) => s + e.costCents, 0);
  const filteredTotalCents = visibleEntries.reduce((s, e) => s + e.costCents, 0);

  return (
    <div className="space-y-6">
      {/* Add form */}
      <form onSubmit={onAdd} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Add material entry</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className={label} htmlFor="m-usedOn">Date *</label>
            <input id="m-usedOn" name="usedOn" type="date" required className={input} />
          </div>
          <div>
            <label className={label} htmlFor="m-category">Category *</label>
            <select id="m-category" name="category" defaultValue="CLEANING_PRODUCTS" className={input}>
              <option value="CLEANING_PRODUCTS">Cleaning products</option>
              <option value="PAINT">Paint</option>
            </select>
          </div>
          <div>
            <label className={label} htmlFor="m-item">Item *</label>
            <input id="m-item" name="itemName" required className={input} placeholder="e.g. Degreaser, primer" />
          </div>
          <div>
            <label className={label} htmlFor="m-qty">Quantity</label>
            <input id="m-qty" name="quantity" type="number" min={0} step={0.01} className={input} />
          </div>
          <div>
            <label className={label} htmlFor="m-unit">Unit</label>
            <input id="m-unit" name="unit" className={input} placeholder="gal, bottle, case" />
          </div>
          <div>
            <label className={label} htmlFor="m-cost">Cost (USD) *</label>
            <input id="m-cost" name="cost" required className={input} placeholder="0.00" />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className={label} htmlFor="m-notes">Notes</label>
            <input id="m-notes" name="notes" className={input} />
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-red-400" role="alert">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="mt-4 rounded-md bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50"
        >
          {loading ? "Adding…" : "Add material"}
        </button>
      </form>

      {/* Log table */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Materials log</h2>
          <p className="text-sm text-gray-700">
            {filterDate || filterItem ? (
              <>
                Showing: <span className="font-semibold text-gray-900">{centsToDollars(filteredTotalCents)}</span>
                <span className="ml-1 text-xs text-gray-400">(total: {centsToDollars(totalCostCents)})</span>
              </>
            ) : (
              <>Total: <span className="font-semibold text-gray-900">{centsToDollars(totalCostCents)}</span></>
            )}
          </p>
        </div>

        <div className="mt-3 flex flex-wrap gap-3">
          <div className="flex-1 min-w-[140px]">
            <label className={label} htmlFor="mf-date">Filter by date</label>
            <input id="mf-date" type="date" className={input} value={filterDate} onChange={(e) => setFilterDate(e.target.value)} />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className={label} htmlFor="mf-item">Filter by item</label>
            <input id="mf-item" type="text" className={input} placeholder="Item name…" value={filterItem} onChange={(e) => setFilterItem(e.target.value)} />
          </div>
          {(filterDate || filterItem) && (
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => { setFilterDate(""); setFilterItem(""); }}
                className="mb-0.5 rounded-md border border-gray-200 px-3 py-2 text-xs text-gray-500 hover:bg-gray-100"
              >
                Clear
              </button>
            </div>
          )}
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-gray-200 text-xs uppercase text-gray-500">
              <tr>
                <th className="py-2 pr-2 font-medium">Date</th>
                <th className="py-2 pr-2 font-medium">Category</th>
                <th className="py-2 pr-2 font-medium">Item</th>
                <th className="py-2 pr-2 font-medium">Qty</th>
                <th className="py-2 pr-2 font-medium">Cost</th>
                <th className="py-2 pr-2 font-medium">Notes</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visibleEntries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-gray-500">
                    {filterDate || filterItem ? "No entries match the filters." : "No material entries yet."}
                  </td>
                </tr>
              ) : (
                visibleEntries.map((r) =>
                  editingId === r.id ? (
                    <tr key={r.id} className="bg-yellow-50">
                      <td className="py-1 pr-2">
                        <input type="date" className={editInput} value={editFields.usedOn} onChange={(e) => setEditFields((f) => ({ ...f, usedOn: e.target.value }))} />
                      </td>
                      <td className="py-1 pr-2">
                        <select className={editInput} value={editFields.category} onChange={(e) => setEditFields((f) => ({ ...f, category: e.target.value }))}>
                          <option value="CLEANING_PRODUCTS">Cleaning products</option>
                          <option value="PAINT">Paint</option>
                        </select>
                      </td>
                      <td className="py-1 pr-2">
                        <input type="text" className={editInput} value={editFields.itemName} onChange={(e) => setEditFields((f) => ({ ...f, itemName: e.target.value }))} />
                      </td>
                      <td className="py-1 pr-2">
                        <input type="text" className={editInput} placeholder="—" value={editFields.quantity} onChange={(e) => setEditFields((f) => ({ ...f, quantity: e.target.value }))} />
                      </td>
                      <td className="py-1 pr-2">
                        <input type="text" className={editInput} value={editFields.cost} onChange={(e) => setEditFields((f) => ({ ...f, cost: e.target.value }))} />
                      </td>
                      <td className="py-1 pr-2">
                        <input type="text" className={editInput} placeholder="—" value={editFields.notes} onChange={(e) => setEditFields((f) => ({ ...f, notes: e.target.value }))} />
                      </td>
                      <td className="py-1 text-right whitespace-nowrap">
                        <button type="button" onClick={() => onSaveEdit(r.id)} className="text-xs font-medium text-pink-600 hover:text-pink-800">Save</button>
                        <button type="button" onClick={() => setEditingId(null)} className="ml-2 text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={r.id}>
                      <td className="py-2 pr-2 text-gray-600">
                        {new Date(r.usedOn).toLocaleDateString("en-US", { timeZone: "America/New_York" })}
                      </td>
                      <td className="py-2 pr-2 text-gray-500">{categoryLabel[r.category] ?? r.category}</td>
                      <td className="py-2 pr-2 text-gray-900">{r.itemName}</td>
                      <td className="py-2 pr-2 text-gray-700">
                        {r.quantity != null ? `${r.quantity}${r.unit ? ` ${r.unit}` : ""}` : "—"}
                      </td>
                      <td className="py-2 pr-2 text-gray-800">{centsToDollars(r.costCents)}</td>
                      <td className="py-2 pr-2 text-gray-500">{r.notes || "—"}</td>
                      <td className="py-2 text-right whitespace-nowrap">
                        <button type="button" onClick={() => startEdit(r)} className="text-xs text-gray-500 hover:text-gray-700">Edit</button>
                        <button type="button" onClick={() => onDelete(r.id)} className="ml-2 text-xs text-red-500 hover:text-red-700">Delete</button>
                      </td>
                    </tr>
                  )
                )
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
