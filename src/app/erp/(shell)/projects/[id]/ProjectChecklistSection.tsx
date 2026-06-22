"use client";

import { useEffect, useState } from "react";

export type ChecklistItemRow = {
  id: string;
  createdAt: string;
  date: string;
  title: string;
  completed: boolean;
  notes: string | null;
};

const inputCls =
  "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";
const labelCls = "block text-xs font-medium text-gray-600";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateHeading(iso: string) {
  const d = new Date(iso + "T00:00:00");
  const today = todayIso();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayIso = yesterday.toISOString().slice(0, 10);

  if (iso === today) return "Today — " + d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  if (iso === yesterdayIso) return "Yesterday — " + d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function groupByDate(items: ChecklistItemRow[]): { dateIso: string; items: ChecklistItemRow[] }[] {
  const map = new Map<string, ChecklistItemRow[]>();
  for (const item of items) {
    const dateIso = item.date.slice(0, 10);
    if (!map.has(dateIso)) map.set(dateIso, []);
    map.get(dateIso)!.push(item);
  }
  return Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([dateIso, items]) => ({ dateIso, items }));
}

function ChecklistDateGroup({
  dateIso,
  items,
  projectId,
  onToggle,
  onDelete,
  defaultOpen,
}: {
  dateIso: string;
  items: ChecklistItemRow[];
  projectId: string;
  onToggle: (itemId: string, completed: boolean) => void;
  onDelete: (itemId: string) => void;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const doneCount = items.filter((i) => i.completed).length;

  return (
    <div className="rounded-md border border-gray-200 bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-800">{formatDateHeading(dateIso)}</span>
          <span className="text-xs text-gray-400">
            {doneCount}/{items.length} done
          </span>
        </div>
        <svg
          className={`h-4 w-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-gray-100 divide-y divide-gray-100">
          {items.map((item) => (
            <ChecklistItem
              key={item.id}
              item={item}
              projectId={projectId}
              onToggle={onToggle}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ChecklistItem({
  item,
  projectId,
  onToggle,
  onDelete,
}: {
  item: ChecklistItemRow;
  projectId: string;
  onToggle: (itemId: string, completed: boolean) => void;
  onDelete: (itemId: string) => void;
}) {
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleToggle() {
    setToggling(true);
    try {
      const res = await fetch(`/api/erp/projects/${projectId}/checklist/${item.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ completed: !item.completed }),
      });
      if (res.ok) onToggle(item.id, !item.completed);
    } finally {
      setToggling(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${item.title}"?`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/erp/projects/${projectId}/checklist/${item.id}`, { method: "DELETE" });
      if (res.ok) onDelete(item.id);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className={`flex items-start gap-3 px-4 py-3 ${item.completed ? "bg-gray-50" : ""}`}>
      <button
        type="button"
        onClick={handleToggle}
        disabled={toggling}
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors
          ${item.completed
            ? "border-pink-500 bg-pink-500 text-white"
            : "border-gray-300 bg-white hover:border-pink-400"
          } disabled:opacity-50`}
        aria-label={item.completed ? "Mark incomplete" : "Mark complete"}
      >
        {item.completed && (
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      <div className="min-w-0 flex-1">
        <p className={`text-sm ${item.completed ? "text-gray-400 line-through" : "text-gray-800"}`}>
          {item.title}
        </p>
        {item.notes && (
          <p className="mt-0.5 text-xs text-gray-400">{item.notes}</p>
        )}
      </div>

      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        className="shrink-0 text-gray-300 hover:text-red-400 transition-colors disabled:opacity-50"
        aria-label="Delete item"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

export function ProjectChecklistSection({
  projectId,
  initialItems,
}: {
  projectId: string;
  initialItems: ChecklistItemRow[];
}) {
  const [items, setItems] = useState(initialItems);
  const [addDate, setAddDate] = useState(todayIso());
  const [addTitle, setAddTitle] = useState("");
  const [addNotes, setAddNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  const groups = groupByDate(items);
  const today = todayIso();

  async function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const title = addTitle.trim();
    if (!title) { setError("Item title is required"); return; }

    setLoading(true);
    try {
      const res = await fetch(`/api/erp/projects/${projectId}/checklist`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date: addDate, title, notes: addNotes.trim() || undefined }),
      });
      const data = (await res.json()) as ChecklistItemRow & { error?: string };
      if (!res.ok) { setError((data as { error?: string }).error || "Failed to add item"); return; }
      setItems((prev) => [data, ...prev].sort((a, b) => b.date.localeCompare(a.date) || a.createdAt.localeCompare(b.createdAt)));
      setAddTitle("");
      setAddNotes("");
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  function handleToggle(itemId: string, completed: boolean) {
    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, completed } : i)));
  }

  function handleDelete(itemId: string) {
    setItems((prev) => prev.filter((i) => i.id !== itemId));
  }

  return (
    <div className="space-y-5">
      {/* Add new item */}
      <form onSubmit={onAdd} className="rounded-md border border-gray-200 bg-gray-50 p-4 space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Add checklist item</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className={labelCls} htmlFor="cl-date">Date</label>
            <input
              id="cl-date"
              type="date"
              className={inputCls}
              value={addDate}
              onChange={(e) => setAddDate(e.target.value)}
              required
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor="cl-title">Item</label>
            <input
              id="cl-title"
              type="text"
              className={inputCls}
              value={addTitle}
              onChange={(e) => setAddTitle(e.target.value)}
              placeholder="e.g. Inspect floors on level 3"
              required
            />
          </div>
          <div className="sm:col-span-3">
            <label className={labelCls} htmlFor="cl-notes">Notes (optional)</label>
            <input
              id="cl-notes"
              type="text"
              className={inputCls}
              value={addNotes}
              onChange={(e) => setAddNotes(e.target.value)}
              placeholder="Any extra context"
            />
          </div>
        </div>
        {error && <p className="text-xs text-red-500" role="alert">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-pink-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50"
        >
          {loading ? "Adding…" : "Add item"}
        </button>
      </form>

      {/* Date groups */}
      {groups.length === 0 ? (
        <p className="rounded-md border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400">
          No checklist items yet. Add the first one above.
        </p>
      ) : (
        <div className="space-y-2">
          {groups.map(({ dateIso, items: groupItems }) => (
            <ChecklistDateGroup
              key={dateIso}
              dateIso={dateIso}
              items={groupItems}
              projectId={projectId}
              onToggle={handleToggle}
              onDelete={handleDelete}
              defaultOpen={dateIso === today}
            />
          ))}
        </div>
      )}
    </div>
  );
}
