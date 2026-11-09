"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { InfoTip } from "@/app/erp/components/ui";
import type { ReviewListRow } from "@/lib/erp/subReviews";

/** Contractors page, Reviews tab: every open sub review (subReviews.ts), sortable by any column. */

type SortKey = "dateKey" | "subName" | "title" | "pmEmail" | "status" | "round" | "updatedAt";
type Filter = "ALL" | "PENDING" | "NEEDS_FIX";

const STATUS = {
  PENDING: { text: "Waiting for review", cls: "bg-amber-50 text-amber-800" },
  NEEDS_FIX: { text: "Waiting on sub fixes", cls: "bg-red-50 text-red-700" },
  PASSED: { text: "Passed", cls: "bg-emerald-50 text-emerald-700" },
} as const;

const COLUMNS: { key: SortKey; label: string; first: "asc" | "desc" }[] = [
  { key: "dateKey", label: "Day", first: "desc" },
  { key: "subName", label: "Sub", first: "asc" },
  { key: "title", label: "Job", first: "asc" },
  { key: "pmEmail", label: "PM", first: "asc" },
  { key: "status", label: "Status", first: "asc" },
  { key: "round", label: "Round", first: "desc" },
  { key: "updatedAt", label: "Waiting since", first: "asc" },
];

function dayText(key: string): string {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

function waitingText(iso: string): string {
  const hours = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (hours < 1) return "under an hour";
  if (hours < 48) return `${Math.floor(hours)} h`;
  return `${Math.floor(hours / 24)} days`;
}

export function ReviewsTab({ reviews }: { reviews: ReviewListRow[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "updatedAt", dir: "asc" });
  const [filter, setFilter] = useState<Filter>("ALL");
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = reviews.filter((r) => (filter === "ALL" || r.status === filter) && (!q || [r.subName, r.title, r.pmEmail].some((v) => v?.toLowerCase().includes(q))));
    const sign = sort.dir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const x = a[sort.key];
      const y = b[sort.key];
      // Empty values (no PM) always go last
      if (x == null || x === "") return 1;
      if (y == null || y === "") return -1;
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
      return c * sign || a.updatedAt.localeCompare(b.updatedAt);
    });
  }, [reviews, filter, query, sort]);

  const counts = { ALL: reviews.length, PENDING: reviews.filter((r) => r.status === "PENDING").length, NEEDS_FIX: reviews.filter((r) => r.status === "NEEDS_FIX").length };
  const filters: { id: Filter; label: string }[] = [
    { id: "ALL", label: "All open" },
    { id: "PENDING", label: "Waiting for review" },
    { id: "NEEDS_FIX", label: "Waiting on sub fixes" },
  ];

  function sortBy(c: (typeof COLUMNS)[number]) {
    setSort((s) => (s.key === c.key ? { key: c.key, dir: s.dir === "asc" ? "desc" : "asc" } : { key: c.key, dir: c.first }));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${filter === f.id ? "bg-pink-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
            >
              {f.label} <span className={filter === f.id ? "text-pink-100" : "text-gray-400"}>{counts[f.id]}</span>
            </button>
          ))}
          <InfoTip text="Subs' days that haven't passed their quality check yet, for every PM. Click a column to sort; click again to reverse. Passed days are on Sub Reviews under Projects." />
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search sub, job or PM"
          className="w-56 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
        />
      </div>

      {shown.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 bg-white px-4 py-10 text-center text-sm text-gray-500">
          {reviews.length === 0 ? "No open reviews. Subs' days show up here when they check out." : "Nothing matches."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                {COLUMNS.map((c) => (
                  <th key={c.key} className="px-4 py-2 font-medium" aria-sort={sort.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                    <button type="button" onClick={() => sortBy(c)} className={`inline-flex items-center gap-1 uppercase hover:text-gray-800 ${sort.key === c.key ? "text-gray-900" : ""}`}>
                      {c.label}
                      <span aria-hidden className="text-[10px]">{sort.key === c.key ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}</span>
                    </button>
                  </th>
                ))}
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {shown.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-2 text-gray-700">{dayText(r.dateKey)}</td>
                  <td className="px-4 py-2 text-gray-900">{r.subName}</td>
                  <td className="px-4 py-2">
                    <Link href={`/erp/projects/${r.projectId}`} className="text-gray-700 hover:text-pink-600">
                      {r.title}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-gray-500">{r.pmEmail ?? "No PM on the day"}</td>
                  <td className="px-4 py-2">
                    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[r.status].cls}`}>{STATUS[r.status].text}</span>
                  </td>
                  <td className="px-4 py-2 text-gray-500">{r.round}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-gray-500">{waitingText(r.updatedAt)}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    <Link href={`/erp/sub-reviews/${r.id}`} className="font-medium text-pink-600 hover:underline">
                      {r.status === "PENDING" && r.canReview ? "Review" : "Open"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
