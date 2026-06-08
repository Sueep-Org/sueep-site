"use client";

import { useState } from "react";
import Link from "next/link";

export type QualityCheckRow = {
  id: string;
  label: string;
  supervisorName: string;
  pmApproval: boolean;
  evidencePhotoCount: number;
  notes: string | null;
};

export function QualityChecksTable({ checks }: { checks: QualityCheckRow[] }) {
  const [query, setQuery] = useState("");

  const filtered = query.trim()
    ? checks.filter((c) =>
        [c.label, c.supervisorName, c.notes ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase())
      )
    : checks;

  return (
    <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 px-4 py-3">
        <div className="relative max-w-sm">
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
          >
            <path
              fillRule="evenodd"
              d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z"
              clipRule="evenodd"
            />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by project, supervisor, notes…"
            className="w-full rounded-md border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder-gray-400 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              aria-label="Clear search"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="border-b border-gray-300 bg-gray-200 text-xs font-semibold uppercase text-gray-700">
            <tr>
              <th className="px-4 py-3">Project / Request</th>
              <th className="px-4 py-3">Supervisor</th>
              <th className="px-4 py-3">PM approval</th>
              <th className="px-4 py-3">Evidence photos</th>
              <th className="px-4 py-3">Notes</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  {query ? "No results match your search." : "No quality checks yet."}
                </td>
              </tr>
            ) : (
              filtered.map((check, i) => (
                <tr
                  key={check.id}
                  className={`${i % 2 === 0 ? "bg-white" : "bg-gray-50"} transition-colors hover:bg-gray-100`}
                >
                  <td className="px-4 py-3 text-gray-900">{check.label}</td>
                  <td className="px-4 py-3 text-gray-900">{check.supervisorName}</td>
                  <td className="px-4 py-3 text-gray-900">{check.pmApproval ? "Yes" : "No"}</td>
                  <td className="px-4 py-3 text-gray-900">{check.evidencePhotoCount}</td>
                  <td className="px-4 py-3 text-gray-900">{check.notes ? check.notes.slice(0, 60) : "—"}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/erp/quality-checks/${check.id}`}
                      className="rounded-md bg-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-300"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
