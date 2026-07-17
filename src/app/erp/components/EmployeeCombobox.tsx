"use client";

import { useEffect, useRef, useState } from "react";

export type EmployeeOption = { id: string; name: string };

const inputClass =
  "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";

export function EmployeeCombobox({
  employees,
  value,
  onChange,
}: {
  employees: EmployeeOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = employees.find((e) => e.id === value);
  const displayName = selected?.name ?? "";

  const filtered = query.trim()
    ? employees.filter((e) => e.name.toLowerCase().includes(query.toLowerCase()))
    : employees;

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        if (!value) setQuery("");
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [value]);

  function handleSelect(emp: EmployeeOption) {
    onChange(emp.id);
    setQuery(emp.name);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        autoComplete="off"
        className={inputClass}
        placeholder={displayName || "Type to search…"}
        value={open ? query : displayName}
        onFocus={() => { setQuery(""); setOpen(true); }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); if (value) onChange(""); }}
        onKeyDown={(e) => {
          if (e.key === "Escape") { setOpen(false); setQuery(displayName); }
        }}
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-gray-200 bg-white py-1 text-sm shadow-lg">
          {filtered.map((emp) => (
            <li
              key={emp.id}
              onMouseDown={(e) => { e.preventDefault(); handleSelect(emp); }}
              className="cursor-pointer px-3 py-2 text-gray-900 hover:bg-pink-50 hover:text-pink-700"
            >
              {emp.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
