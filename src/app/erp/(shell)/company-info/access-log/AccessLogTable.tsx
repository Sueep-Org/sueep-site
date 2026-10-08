"use client";

import { useMemo, useState } from "react";
import { inputClass } from "@/app/erp/components/ui";
import type { AccessLogRow } from "@/lib/erp/companyInfo";

/** Who revealed or copied which locked value, newest first. */
export function AccessLogTable({ entries, limit }: { entries: AccessLogRow[]; limit: number }) {
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => [e.label, e.userEmail].some((s) => s.toLowerCase().includes(q)));
  }, [entries, query]);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by item or person…"
          aria-label="Search access log"
          className={`${inputClass.xs} w-72`}
        />
        {entries.length >= limit && <span className="text-xs text-gray-400">Showing the latest {limit}</span>}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
          {entries.length === 0 ? "No one has revealed or copied a locked value yet." : "Nothing matches that search."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Who</th>
                <th className="px-3 py-2 font-medium">What</th>
                <th className="px-3 py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gray-600">
                    {new Date(e.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                  </td>
                  <td className="px-3 py-2 text-gray-900">{e.userEmail}</td>
                  <td className="px-3 py-2 text-gray-900">
                    {e.label}
                    <span className="ml-1.5 text-[11px] text-gray-400">{e.targetType === "LOGIN" ? "Login" : "Company info"}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        e.action === "COPY" ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {e.action === "COPY" ? "Copied" : "Viewed"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
