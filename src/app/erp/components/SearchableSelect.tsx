"use client";

import { useEffect, useRef, useState } from "react";

export type SearchableSelectOption = { value: string; label: string };

/**
 * Text input that filters a list of options as you type, with a dropdown to
 * pick from — the default list-picker for this ERP instead of a plain
 * `<select>`, which doesn't scale once a list grows past a handful of items.
 */
export function SearchableSelect({
  id,
  value,
  onChange,
  options,
  placeholder = "Search…",
  allLabel = "All",
  className = "",
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  allLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedLabel = options.find((o) => o.value === value)?.label ?? "";
  const displayValue = open ? query : selectedLabel;

  const filtered = options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()));
  const filteredWithAll = query.trim() === "" ? options : filtered;

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  function select(nextValue: string) {
    onChange(nextValue);
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
      inputRef.current?.blur();
      return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((i) => Math.min(i + 1, filteredWithAll.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlighted === -1) select("");
      else if (filteredWithAll[highlighted]) select(filteredWithAll[highlighted].value);
    }
  }

  return (
    <div className={`relative ${className}`} ref={ref}>
      <div className="relative">
        <input
          id={id}
          ref={inputRef}
          type="text"
          value={displayValue}
          placeholder={placeholder}
          onFocus={(e) => {
            setOpen(true);
            setQuery("");
            setHighlighted(-1);
            e.target.select();
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlighted(-1);
            if (!open) setOpen(true);
          }}
          onKeyDown={onKeyDown}
          className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 pr-7 text-xs text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
        />
        {value ? (
          <button
            type="button"
            aria-label="Clear"
            onClick={() => {
              onChange("");
              setQuery("");
              setOpen(false);
            }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            ×
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="absolute left-0 z-20 mt-1 max-h-64 w-full min-w-[12rem] overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
          <button
            type="button"
            onClick={() => select("")}
            className={`block w-full rounded-md px-2.5 py-1.5 text-left text-xs ${
              highlighted === -1 ? "bg-pink-50 text-pink-600" : "text-gray-500 hover:bg-gray-50"
            }`}
          >
            {allLabel}
          </button>
          {filteredWithAll.length === 0 ? (
            <p className="px-2.5 py-2 text-xs text-gray-400">No matches</p>
          ) : (
            filteredWithAll.map((opt, i) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => select(opt.value)}
                className={`block w-full truncate rounded-md px-2.5 py-1.5 text-left text-xs ${
                  i === highlighted
                    ? "bg-pink-50 text-pink-600"
                    : opt.value === value
                      ? "font-medium text-gray-900"
                      : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                {opt.label}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
