"use client";

import { useEffect, useRef, useState } from "react";
import { inputClass } from "@/app/erp/components/ui";
import { centsToDollars } from "@/lib/erp/money";

export type SOVItemOption = {
  id: string;
  description: string;
  completed: boolean;
  /** Line price, when the caller is allowed to show it. */
  scheduledValueCents?: number | null;
};

const input = inputClass.md;

/** Price of each picked SOV line plus a total, so a sub can be quoted on
 * the spot. Renders nothing when prices aren't available (callers pass null
 * prices for roles that can't see financials). */
export function SOVPriceSummary({ sovItems, selectedIds }: { sovItems: SOVItemOption[]; selectedIds: string[] }) {
  const priced = selectedIds
    .map((id) => sovItems.find((s) => s.id === id))
    .filter((s): s is SOVItemOption => s?.scheduledValueCents != null);
  if (priced.length === 0) return null;
  return (
    <div className="mt-1.5 rounded border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs">
      {priced.map((s) => (
        <div key={s.id} className="flex justify-between gap-2 text-gray-600">
          <span className="truncate">{s.description}</span>
          <span className="shrink-0">{centsToDollars(s.scheduledValueCents)}</span>
        </div>
      ))}
      {priced.length > 1 ? (
        <div className="mt-1 flex justify-between gap-2 border-t border-gray-200 pt-1 font-medium text-gray-800">
          <span>Total</span>
          <span>{centsToDollars(priced.reduce((sum, s) => sum + (s.scheduledValueCents ?? 0), 0))}</span>
        </div>
      ) : null}
    </div>
  );
}

/** Multi-select SOV item picker: selected items show as removable chips above
 * a search box; each list row shows a checkbox for "selected here" plus a
 * separate emerald check for "already marked complete" on the SOV item itself. */
export function SOVMultiCombobox({
  sovItems,
  selectedIds,
  onChange,
}: {
  sovItems: SOVItemOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedSet = new Set(selectedIds);
  const filtered = query.trim()
    ? sovItems.filter((s) => s.description.toLowerCase().includes(query.toLowerCase()))
    : sovItems;

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  function toggle(id: string) {
    onChange(selectedSet.has(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  }

  return (
    <div ref={containerRef} className="relative">
      {selectedIds.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {selectedIds.map((id) => {
            const item = sovItems.find((s) => s.id === id);
            if (!item) return null;
            return (
              <span key={id} className="inline-flex items-center gap-1 rounded-full bg-pink-50 px-2 py-1 text-xs text-pink-700">
                {item.description}
                <button
                  type="button"
                  onClick={() => toggle(id)}
                  className="text-pink-400 hover:text-pink-700"
                  aria-label={`Remove ${item.description}`}
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}
      <input
        type="text"
        autoComplete="off"
        className={input}
        placeholder="Search SOV items…"
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onKeyDown={(e) => { if (e.key === "Escape") { setOpen(false); setQuery(""); } }}
      />
      {open && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg text-sm">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-gray-400">No matching items</li>
          ) : null}
          {filtered.map((sov) => {
            const isSelected = selectedSet.has(sov.id);
            return (
              <li
                key={sov.id}
                onMouseDown={(e) => { e.preventDefault(); toggle(sov.id); }}
                className={`flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-pink-50 hover:text-pink-700 ${isSelected ? "bg-pink-50/60 text-pink-700" : "text-gray-900"}`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  readOnly
                  className="pointer-events-none h-3.5 w-3.5 shrink-0 rounded border-gray-300 text-pink-600"
                />
                <span className="flex-1">{sov.description}</span>
                {sov.scheduledValueCents != null ? (
                  <span className="shrink-0 text-xs text-gray-500">{centsToDollars(sov.scheduledValueCents)}</span>
                ) : null}
                {sov.completed ? <span className="shrink-0 text-emerald-500 text-xs">✓ done</span> : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
