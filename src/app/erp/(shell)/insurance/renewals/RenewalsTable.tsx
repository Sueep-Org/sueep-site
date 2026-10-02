"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { InfoTip, inputClass } from "@/app/erp/components/ui";
import type { ReissueRow } from "@/lib/erp/coiRenewals";
import { ExpiryBadge } from "../badges";

const fmtDay = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export function RenewalsTable({ rows }: { rows: ReissueRow[] }) {
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? rows.filter((r) => r.jobTitle.toLowerCase().includes(q) || r.holderName.toLowerCase().includes(q)) : rows;
  }, [rows, query]);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <h2 className="text-sm font-semibold text-gray-900">Need a new COI ({rows.length})</h2>
          <InfoTip text="Current COIs on unpaid projects where a policy on it has renewed or been replaced, or that expire within 30 days. Make the new COI in CoverDash, then click New version to add it to the project." />
        </div>
        {rows.length > 0 && (
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            aria-label="Search renewals"
            className={`${inputClass.xs} w-60`}
          />
        )}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
          {rows.length === 0 ? "Every COI is up to date." : "Nothing matches that search."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2 font-medium">Project</th>
                <th className="px-3 py-2 font-medium">For</th>
                <th className="px-3 py-2 font-medium">Why</th>
                <th className="px-3 py-2 font-medium">Good until</th>
                <th className="px-3 py-2 font-medium">Last sent to</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.map((r) => (
                <tr key={r.coiId} className="hover:bg-gray-50">
                  <td className="px-3 py-2.5">
                    <Link href={`/erp/projects/${r.projectId}?tab=COIs`} className="font-medium text-gray-900 hover:text-pink-600 hover:underline">
                      {r.jobTitle}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">{r.holderName}</td>
                  <td className="px-3 py-2.5 text-xs text-gray-700">{r.reasons.join(" · ")}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="tabular-nums">{fmtDay(r.expiresAt)}</span>
                      <ExpiryBadge status={r.status} />
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-600">{r.sentTo ?? <span className="text-gray-400">Not recorded</span>}</td>
                  <td className="px-3 py-2.5 text-right">
                    <Link
                      href={`/erp/projects/${r.projectId}?tab=COIs&newCoiFrom=${r.coiId}`}
                      className="whitespace-nowrap rounded-md bg-pink-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-pink-500"
                    >
                      New version
                    </Link>
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
