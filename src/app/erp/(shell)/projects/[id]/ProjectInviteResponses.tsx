"use client";

import { useState } from "react";
import { InfoTip } from "@/app/erp/components/ui";
import type { ProjectInviteResponse } from "@/lib/erp/scheduleConfirmations";

const STATUS: Record<ProjectInviteResponse["status"], { label: string; className: string }> = {
  PENDING: { label: "Pending", className: "bg-gray-100 text-gray-700" },
  CONFIRMED: { label: "Accepted", className: "bg-emerald-100 text-emerald-800" },
  DECLINED: { label: "Declined", className: "bg-red-100 text-red-800" },
};

type Filter = "ALL" | ProjectInviteResponse["status"];

function dayLabel(key: string): string {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

function stamp(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) : "";
}

/** Each schedule invite sent for this job and its change orders, with Pending / Accepted / Declined. */
export function ProjectInviteResponses({ rows, todayKey }: { rows: ProjectInviteResponse[]; todayKey: string }) {
  const [filter, setFilter] = useState<Filter>("ALL");
  const [showPast, setShowPast] = useState(false);
  if (!rows.length) return null;

  const upcoming = rows.filter((r) => r.dateKey >= todayKey).reverse();
  const past = rows.filter((r) => r.dateKey < todayKey);
  const count = (s: ProjectInviteResponse["status"]) => upcoming.filter((r) => r.status === s).length;
  const shown = (showPast ? [...upcoming, ...past] : upcoming).filter((r) => filter === "ALL" || r.status === filter);

  const tab = (f: Filter, label: string) => (
    <button
      type="button"
      onClick={() => setFilter(f)}
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${filter === f ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
    >
      {label}
    </button>
  );

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Invite responses
          <InfoTip text="Answers to the Confirm / Can't make it buttons in each schedule invite. Counts are for today and later. A changed day goes back to Pending." />
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {tab("ALL", "All")}
          {tab("PENDING", `Pending ${count("PENDING")}`)}
          {tab("CONFIRMED", `Accepted ${count("CONFIRMED")}`)}
          {tab("DECLINED", `Declined ${count("DECLINED")}`)}
        </div>
      </div>

      {shown.length ? (
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500">
                <th className="py-1.5 pr-4 font-medium">Day</th>
                <th className="py-1.5 pr-4 font-medium">Person</th>
                <th className="py-1.5 pr-4 font-medium">Role</th>
                <th className="py-1.5 pr-4 font-medium">Status</th>
                <th className="py-1.5 font-medium">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {shown.map((r) => {
                const s = STATUS[r.status];
                return (
                  <tr key={r.uid} className={r.dateKey < todayKey ? "text-gray-400" : ""}>
                    <td className="whitespace-nowrap py-1.5 pr-4">{dayLabel(r.dateKey)}</td>
                    <td className="py-1.5 pr-4">
                      {r.personName}
                      {r.changeOrder ? <div className="text-xs text-gray-500">{r.title}</div> : null}
                    </td>
                    <td className="py-1.5 pr-4 text-gray-600">{r.role}</td>
                    <td className="py-1.5 pr-4">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${s.className}`}>
                        {s.label}
                        {r.reason ? <InfoTip text={`Reason: ${r.reason}`} /> : null}
                      </span>
                    </td>
                    <td className="whitespace-nowrap py-1.5 text-xs text-gray-500">
                      {r.status === "PENDING" ? `Sent ${stamp(r.inviteSentAt)}` : stamp(r.respondedAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-3 text-sm text-gray-500">Nothing here.</p>
      )}

      {past.length ? (
        <button type="button" onClick={() => setShowPast((v) => !v)} className="mt-2 text-xs text-gray-500 hover:text-gray-700">
          {showPast ? "Hide past days" : `Show past days (${past.length})`}
        </button>
      ) : null}
    </section>
  );
}
