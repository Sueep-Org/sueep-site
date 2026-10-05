"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SearchableSelect } from "@/app/erp/components/SearchableSelect";
import { inputClass } from "@/app/erp/components/ui";
import { STATUS_STYLE } from "./status";

/** Type, status, and search filters for the Email Log, kept in the URL. */
export function LogFilters({ type, status, q, typeOptions }: { type: string; status: string; q: string; typeOptions: { value: string; label: string }[] }) {
  const router = useRouter();
  const [query, setQuery] = useState(q);

  function go(next: { type?: string; status?: string; q?: string }) {
    const p = new URLSearchParams();
    const t = next.type ?? type;
    const s = next.status ?? status;
    const search = (next.q ?? query).trim();
    if (t) p.set("type", t);
    if (s) p.set("status", s);
    if (search) p.set("q", search);
    const str = p.toString();
    router.push(`/erp/notifications/log${str ? `?${str}` : ""}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <SearchableSelect
        value={type}
        onChange={(v) => go({ type: v })}
        options={typeOptions}
        placeholder="Search email types…"
        allLabel="All emails"
        className="w-56"
      />
      <div className="flex gap-1">
        {[["", "All"], ...Object.entries(STATUS_STYLE).map(([k, v]) => [k, v.label])].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => go({ status: value })}
            aria-pressed={status === value}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
              status === value ? "border-pink-300 bg-pink-50 text-pink-600" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go({});
        }}
        className="ml-auto"
      >
        <input
          className={`${inputClass.xs} w-60`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search subject or exact email…"
          aria-label="Search"
        />
      </form>
    </div>
  );
}
