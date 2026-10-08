"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { centsToDollars } from "@/lib/erp/money";
import { daysBetween } from "@/lib/erp/managementCalendar";
import { BillingStatusBadge, ContractStatusBadge } from "./badges";

export type ContractRow = {
  id: string;
  buildingName: string;
  address: string | null;
  serviceAreas: string | null;
  status: string;
  monthlyRateCents: number;
  latest: { label: string; totalCents: number; billingStatus: string } | null;
  margin: { revenueCents: number; costCents: number; marginCents: number } | null;
  /** "YYYY-MM-DD" end of the current yearly term */
  expirationDate: string | null;
  /** "YYYY-MM-DD" earliest quality check not marked done */
  nextCheck: string | null;
  salesperson: string | null;
};

type StatusFilter = "current" | "ended" | "all";

/** Contracts list with search and a status filter (ended contracts hidden by default). */
export function ContractsTable({ rows, marginMonthLabel, today }: { rows: ContractRow[]; marginMonthLabel: string; today: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("current");

  const endedCount = rows.filter((r) => r.status === "ENDED").length;
  const q = query.trim().toLowerCase();
  const visible = rows.filter((r) => {
    if (status === "current" && r.status === "ENDED") return false;
    if (status === "ended" && r.status !== "ENDED") return false;
    if (!q) return true;
    return [r.buildingName, r.address, r.serviceAreas, r.salesperson].some((v) => v?.toLowerCase().includes(q));
  });

  const filters: [StatusFilter, string][] = [
    ["current", "Current"],
    ["ended", `Ended${endedCount ? ` (${endedCount})` : ""}`],
    ["all", "All"],
  ];

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search buildings, addresses, salespeople…"
          aria-label="Search contracts"
          className="w-full max-w-sm rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
        />
        <div className="inline-flex overflow-hidden rounded-md border border-gray-300 text-xs" role="group" aria-label="Contract status">
          {filters.map(([value, text]) => (
            <button
              key={value}
              type="button"
              onClick={() => setStatus(value)}
              aria-pressed={status === value}
              className={`px-3 py-1.5 font-medium ${status === value ? "bg-pink-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              {text}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="border-b border-gray-300 bg-gray-200 text-xs font-semibold uppercase text-gray-700">
              <tr>
                <th className="px-4 py-3">Building</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Monthly rate</th>
                <th className="px-4 py-3">Latest month</th>
                <th className="px-4 py-3 text-right">Margin, {marginMonthLabel}</th>
                <th className="px-4 py-3">Expires</th>
                <th className="px-4 py-3">Next check</th>
                <th className="px-4 py-3">Salesperson</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                    {rows.length === 0
                      ? "No janitorial contracts yet."
                      : q
                        ? `No contracts match "${query.trim()}".`
                        : status === "ended"
                          ? "No ended contracts."
                          : "No current contracts."}
                  </td>
                </tr>
              ) : (
                visible.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => router.push(`/erp/janitorial/contracts/${r.id}`)}
                    className={`cursor-pointer border-t border-gray-100 align-top hover:bg-gray-50 ${r.status === "ENDED" ? "text-gray-400" : ""}`}
                  >
                    <td className="px-4 py-3">
                      <a
                        href={`/erp/janitorial/contracts/${r.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="font-medium text-gray-900 hover:text-pink-600 hover:underline"
                      >
                        {r.buildingName}
                      </a>
                      {r.serviceAreas && <p className="mt-0.5 line-clamp-1 max-w-xs text-xs text-gray-400" title={r.serviceAreas}>{r.serviceAreas}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <ContractStatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums text-gray-900">{centsToDollars(r.monthlyRateCents)}</td>
                    <td className="px-4 py-3">
                      {r.latest ? (
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-gray-700">{r.latest.label}</span>
                          <span className="tabular-nums text-gray-500">{centsToDollars(r.latest.totalCents)}</span>
                          <BillingStatusBadge status={r.latest.billingStatus} />
                        </div>
                      ) : (
                        <span className="text-gray-400">None yet</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {r.margin ? (
                        <span
                          title={`Billed ${centsToDollars(r.margin.revenueCents)}, labor ${centsToDollars(r.margin.costCents)}`}
                          className={`font-semibold ${r.margin.marginCents < 0 ? "text-red-600" : "text-emerald-700"}`}
                        >
                          {centsToDollars(r.margin.marginCents)}
                          {r.margin.marginCents < 0 && (
                            <span className="ml-1 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">Losing money</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-gray-400">No data</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {r.status === "ENDED" ? <span className="text-gray-400">-</span> : <ExpirationCell date={r.expirationDate} today={today} />}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {r.status === "ENDED" ? <span className="text-gray-400">-</span> : <NextCheckCell date={r.nextCheck} today={today} />}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{r.salesperson ?? <span className="text-gray-400">Unassigned</span>}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/** Expiration date, amber within 60 days or when missing, red once it has passed. */
function ExpirationCell({ date, today }: { date: string | null; today: string }) {
  if (!date) return <span className="text-amber-600">Not set</span>;
  const days = daysBetween(today, date);
  const text = new Date(`${date}T00:00:00.000Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  if (days < 0) return <span className="font-medium text-red-600">{text}, expired</span>;
  if (days <= 60) return <span className="font-medium text-amber-600">{text}</span>;
  return <span className="text-gray-700">{text}</span>;
}

/** Next quality check, red when it's past and not marked done. */
function NextCheckCell({ date, today }: { date: string | null; today: string }) {
  if (!date) return <span className="text-gray-400">None scheduled</span>;
  const text = new Date(`${date}T00:00:00.000Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  if (date < today) return <span className="font-medium text-red-600">{text}, overdue</span>;
  return <span className={date === today ? "font-medium text-amber-600" : "text-gray-700"}>{date === today ? "Today" : text}</span>;
}
