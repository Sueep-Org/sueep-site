"use client";

import { useEffect, useRef, useState } from "react";

export type ComboboxOption = { value: string; label: string };

const inputClass =
  "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";

/** Generic single-select searchable dropdown for a short label/value option
 * list (e.g. a status or type filter) — same type-to-filter/click-outside
 * pattern as EmployeeCombobox, used in place of a plain <select> for list
 * pickers. `allLabel` renders as the "no filter" option at the top. */
export function OptionCombobox({
  options,
  value,
  onChange,
  allLabel = "All",
  placeholder = "Type to search…",
}: {
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  allLabel?: string;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const allOptions: ComboboxOption[] = [{ value: "", label: allLabel }, ...options];
  const selected = allOptions.find((o) => o.value === value);
  const displayLabel = selected?.label ?? allLabel;

  const filtered = query.trim()
    ? allOptions.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : allOptions;

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

  function handleSelect(opt: ComboboxOption) {
    onChange(opt.value);
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        autoComplete="off"
        className={inputClass}
        placeholder={placeholder}
        value={open ? query : displayLabel}
        onFocus={() => { setQuery(""); setOpen(true); }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === "Escape") { setOpen(false); setQuery(""); }
        }}
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-gray-200 bg-white py-1 text-sm shadow-lg">
          {filtered.map((opt) => (
            <li
              key={opt.value}
              onMouseDown={(e) => { e.preventDefault(); handleSelect(opt); }}
              className="cursor-pointer px-3 py-2 text-gray-900 hover:bg-pink-50 hover:text-pink-700"
            >
              {opt.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
