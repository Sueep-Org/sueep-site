"use client";

import { useEffect, useState } from "react";

export type SOVItem = {
  id: string;
  order: number;
  description: string;
  scheduledValueCents: number;
  completed: boolean;
  billingStatus: string;
};

const BILLING_OPTIONS = [
  { value: "NOT_BILLED", label: "Not Billed" },
  { value: "BILLED",     label: "Billed" },
  { value: "PAID",       label: "Paid" },
] as const;

function billingBadgeCls(status: string): string {
  if (status === "PAID")    return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (status === "BILLED")  return "bg-blue-100 text-blue-700 border-blue-200";
  return "bg-gray-100 text-gray-600 border-gray-200";
}

function fmt(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function parseCents(val: string): number {
  const n = parseFloat(val.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
}

type Props = {
  projectId: string;
  initialItems: SOVItem[];
  canEdit: boolean;
};

export function ProjectSOVSection({ projectId, initialItems, canEdit }: Props) {
  const [items, setItems] = useState<SOVItem[]>(initialItems);
  const [adding, setAdding] = useState(false);

  useEffect(() => { setItems(initialItems); }, [initialItems]);
  const [newDesc, setNewDesc] = useState("");
  const [newValue, setNewValue] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDesc, setEditDesc] = useState("");
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!menuOpenId) return;
    function close() { setMenuOpenId(null); }
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menuOpenId]);

  const totalScheduled = items.reduce((s, i) => s + i.scheduledValueCents, 0);
  const totalCompleted = items.filter((i) => i.completed).reduce((s, i) => s + i.scheduledValueCents, 0);
  const completedCount = items.filter((i) => i.completed).length;

  async function saveNew() {
    if (!newDesc.trim()) { setError("Description is required."); return; }
    setError("");
    setSaving(true);
    try {
      const res = await fetch(`/api/erp/projects/${projectId}/sov/items`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          description: newDesc.trim(),
          scheduledValueCents: parseCents(newValue),
          order: items.length,
        }),
      });
      const data = (await res.json()) as SOVItem & { error?: string };
      if (!res.ok) { setError(data.error ?? "Failed to add item"); return; }
      setItems((prev) => [...prev, data]);
      setNewDesc("");
      setNewValue("");
      setAdding(false);
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit() {
    if (!editDesc.trim()) { setError("Description is required."); return; }
    setError("");
    setSaving(true);
    try {
      const res = await fetch(`/api/erp/projects/${projectId}/sov/items/${editingId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          description: editDesc.trim(),
          scheduledValueCents: parseCents(editValue),
        }),
      });
      const data = (await res.json()) as SOVItem & { error?: string };
      if (!res.ok) { setError(data.error ?? "Failed to update item"); return; }
      setItems((prev) => prev.map((i) => (i.id === editingId ? data : i)));
      setEditingId(null);
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function toggleCompleted(item: SOVItem) {
    const next = !item.completed;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, completed: next } : i)));
    try {
      await fetch(`/api/erp/projects/${projectId}/sov/items/${item.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ completed: next }),
      });
    } catch {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, completed: item.completed } : i)));
    }
  }

  async function updateBilling(item: SOVItem, billingStatus: string) {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, billingStatus } : i)));
    try {
      await fetch(`/api/erp/projects/${projectId}/sov/items/${item.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ billingStatus }),
      });
    } catch {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, billingStatus: item.billingStatus } : i)));
    }
  }

  async function deleteItem(id: string) {
    if (!confirm("Delete this line item?")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/erp/projects/${projectId}/sov/items/${id}`, { method: "DELETE" });
      if (!res.ok) { setError("Failed to delete item"); return; }
      setItems((prev) => prev.filter((i) => i.id !== id));
      if (editingId === id) setEditingId(null);
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Schedule of Values</h2>
        {canEdit && !adding && (
          <button
            type="button"
            onClick={() => { setAdding(true); setError(""); setEditingId(null); }}
            className="rounded-md bg-pink-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-pink-700"
          >
            + Add Item
          </button>
        )}
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      {/* Item list */}
      <div className="rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
        {items.length === 0 && !adding && (
          <p className="px-4 py-8 text-center text-xs text-gray-400">
            No items yet.{canEdit ? " Click \"+ Add Item\" to get started." : ""}
          </p>
        )}

        {items.map((item) => {
          const isEditing = editingId === item.id;

          if (isEditing) {
            return (
              <div key={item.id} className="flex items-center gap-3 bg-pink-50 px-4 py-3">
                <input
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  placeholder="Description of work"
                  className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-pink-400 focus:outline-none"
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  placeholder="0.00"
                  className="w-32 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-right text-gray-900 focus:border-pink-400 focus:outline-none"
                />
                <div className="flex gap-1.5">
                  <button type="button" onClick={saveEdit} disabled={saving} className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-700 disabled:bg-gray-300">Save</button>
                  <button type="button" onClick={() => { setEditingId(null); setError(""); }} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
                </div>
              </div>
            );
          }

          return (
            <div key={item.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
              {canEdit ? (
                <input
                  type="checkbox"
                  checked={item.completed}
                  onChange={() => toggleCompleted(item)}
                  className="h-4 w-4 rounded border-gray-300 text-pink-600 focus:ring-pink-500 cursor-pointer"
                />
              ) : (
                <span className={`h-4 w-4 flex-shrink-0 rounded border ${item.completed ? "border-emerald-500 bg-emerald-100" : "border-gray-300 bg-white"}`} />
              )}
              <span className={`flex-1 text-sm ${item.completed ? "line-through text-gray-400" : "text-gray-900"}`}>
                {item.description}
              </span>
              <span className={`text-sm font-medium tabular-nums ${item.completed ? "text-gray-400" : "text-gray-700"}`}>
                {fmt(item.scheduledValueCents)}
              </span>
              {canEdit ? (
                <select
                  value={item.billingStatus}
                  onChange={(e) => updateBilling(item, e.target.value)}
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold focus:outline-none cursor-pointer ${billingBadgeCls(item.billingStatus)}`}
                >
                  {BILLING_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              ) : (
                <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${billingBadgeCls(item.billingStatus)}`}>
                  {BILLING_OPTIONS.find((o) => o.value === item.billingStatus)?.label ?? item.billingStatus}
                </span>
              )}
              {canEdit && (
                <div className="relative" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => setMenuOpenId(menuOpenId === item.id ? null : item.id)}
                    className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    aria-label="More options"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                      <circle cx="8" cy="3" r="1.2" />
                      <circle cx="8" cy="8" r="1.2" />
                      <circle cx="8" cy="13" r="1.2" />
                    </svg>
                  </button>
                  {menuOpenId === item.id && (
                    <div className="absolute right-0 z-20 mt-1 w-28 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(item.id);
                          setEditDesc(item.description);
                          setEditValue((item.scheduledValueCents / 100).toFixed(2));
                          setError("");
                          setAdding(false);
                          setMenuOpenId(null);
                        }}
                        className="flex w-full items-center px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => { deleteItem(item.id); setMenuOpenId(null); }}
                        disabled={saving}
                        className="flex w-full items-center px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Add form inline at the bottom */}
        {adding && (
          <div className="flex items-center gap-3 bg-gray-50 px-4 py-3">
            <span className="h-4 w-4 flex-shrink-0 rounded border border-gray-300 bg-white" />
            <input
              autoFocus
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") saveNew(); if (e.key === "Escape") { setAdding(false); setError(""); } }}
              placeholder="Description of work"
              className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-pink-400 focus:outline-none"
            />
            <input
              type="number"
              min="0"
              step="0.01"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") saveNew(); if (e.key === "Escape") { setAdding(false); setError(""); } }}
              placeholder="0.00"
              className="w-32 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-right text-gray-900 focus:border-pink-400 focus:outline-none"
            />
            <div className="flex gap-1.5">
              <button type="button" onClick={saveNew} disabled={saving} className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-700 disabled:bg-gray-300">
                {saving ? "Saving..." : "Add"}
              </button>
              <button type="button" onClick={() => { setAdding(false); setNewDesc(""); setNewValue(""); setError(""); }} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Totals */}
      {items.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="flex divide-x divide-gray-200">
            <div className="flex-1 px-4 py-3">
              <p className="text-[10px] uppercase tracking-wide text-gray-500">Total Value</p>
              <p className="mt-1 text-base font-semibold text-gray-900">{fmt(totalScheduled)}</p>
            </div>
            <div className="flex-1 px-4 py-3">
              <p className="text-[10px] uppercase tracking-wide text-gray-500">Completed</p>
              <p className="mt-1 text-base font-semibold text-emerald-700">{fmt(totalCompleted)}</p>
              <p className="mt-0.5 text-xs text-gray-500">{completedCount} of {items.length} items</p>
            </div>
            <div className="flex-1 px-4 py-3">
              <p className="text-[10px] uppercase tracking-wide text-gray-500">Remaining</p>
              <p className="mt-1 text-base font-semibold text-gray-900">{fmt(totalScheduled - totalCompleted)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
