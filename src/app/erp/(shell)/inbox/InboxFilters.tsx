"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SearchableSelect } from "@/app/erp/components/SearchableSelect";
import { inputClass } from "@/app/erp/components/ui";

/** Area, unread, and (All emails view) search filters, kept in the URL. */
export function InboxFilters({ allView, area, unreadOnly, q, areas }: { allView: boolean; area: string; unreadOnly: boolean; q: string; areas: string[] }) {
  const router = useRouter();
  const [query, setQuery] = useState(q);

  function go(next: { area?: string; unread?: boolean; q?: string }) {
    const p = new URLSearchParams();
    if (allView) p.set("view", "all");
    const a = next.area ?? area;
    if (a) p.set("area", a);
    if (!allView && (next.unread ?? unreadOnly)) p.set("unread", "1");
    const search = (next.q ?? query).trim();
    if (allView && search) p.set("q", search);
    const s = p.toString();
    router.push(`/erp/inbox${s ? `?${s}` : ""}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <SearchableSelect
        value={area}
        onChange={(v) => go({ area: v })}
        options={areas.map((a) => ({ value: a, label: a }))}
        placeholder="Search areas…"
        allLabel="All areas"
        className="w-52"
      />
      {!allView && (
        <button
          type="button"
          onClick={() => go({ unread: !unreadOnly })}
          aria-pressed={unreadOnly}
          className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
            unreadOnly ? "border-pink-300 bg-pink-50 text-pink-600" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
          }`}
        >
          Unread only
        </button>
      )}
      {allView && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            go({});
          }}
          className="sm:ml-auto"
        >
          <input
            className={`${inputClass.xs} w-64`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search subject or exact email…"
            aria-label="Search emails"
          />
        </form>
      )}
    </div>
  );
}
