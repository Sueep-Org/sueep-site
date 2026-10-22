import Link from "next/link";
import { InfoTip } from "@/app/erp/components/ui";
import { BidFileLinks } from "@/app/erp/components/BidFileLinks";
import { centsToDollars } from "@/lib/erp/money";
import { SUB_BID_STATUS_LABELS } from "@/lib/erp/subBids";
import type { ContractorBidLine, ContractorBidSummary } from "@/lib/erp/subBidStats";

/** "8% under" / "12% over" / "Same", for how a bid compares with the cheapest other bid. */
export function vsLowestText(pct: number | null): string {
  if (pct == null) return "-";
  const r = Math.round(pct);
  return r === 0 ? "Same" : r < 0 ? `${-r}% under` : `${r}% over`;
}

function Stat({ label, value, tip }: { label: string; value: string; tip?: string }) {
  return (
    <div className="rounded-md border border-gray-200 px-3 py-2">
      <p className="flex items-center gap-1 text-[11px] text-gray-500">
        {label}
        {tip ? <InfoTip text={tip} wide /> : null}
      </p>
      <p className="text-lg font-semibold text-gray-900">{value}</p>
    </div>
  );
}

/** Read-only bid history on the contractor profile. Bids are added and edited on each project's Proposals tab. */
export function ContractorBidsSection({
  lines,
  summary,
  linker,
}: {
  lines: ContractorBidLine[];
  summary: ContractorBidSummary;
  /** Linking past bids from before they had a profile, shown on top */
  linker?: React.ReactNode;
}) {
  if (lines.length === 0) {
    return (
      <div className="space-y-4">
        {linker}
        <p className="rounded-md border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
          No bids yet. Bids are logged on a project&apos;s Financials, Proposals tab.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {linker}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Bids" value={String(summary.bids)} />
        <Stat label="Awarded" value={`${summary.awarded} (${Math.round((summary.awarded / summary.bids) * 100)}%)`} />
        <Stat
          label="Avg margin"
          value={summary.avgMarginPct == null ? "-" : `${Math.round(summary.avgMarginPct)}%`}
          tip="Average of our price minus their bid, as a percent of our price. Withdrawn bids don't count."
        />
        <Stat
          label="Vs other subs"
          value={vsLowestText(summary.avgVsLowestPct)}
          tip="On average, how their bid compared with the cheapest other sub's bid on the same work. Only bids where someone else also bid count."
        />
      </div>

      <div className="overflow-x-auto rounded-md border border-gray-200">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500">
            <tr>
              <th className="px-3 py-2 font-medium">Project</th>
              <th className="px-3 py-2 font-medium">Covers</th>
              <th className="px-3 py-2 text-right font-medium">Bid</th>
              <th className="px-3 py-2 text-right font-medium">Margin</th>
              <th className="px-3 py-2 font-medium">Vs others</th>
              <th className="px-3 py-2 font-medium">Received</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {lines.map((l) => {
              const faded = l.status === "WITHDRAWN" || l.status === "DECLINED";
              return (
                <tr key={l.id} className={faded ? "text-gray-400" : "text-gray-800"}>
                  <td className="px-3 py-2">
                    <Link href={`/erp/projects/${l.projectId}?tab=Proposals`} className="font-medium hover:text-pink-600 hover:underline">
                      {l.projectTitle}
                    </Link>
                    <BidFileLinks projectId={l.projectId} bidId={l.id} files={l.files} />
                  </td>
                  <td className="max-w-[220px] truncate px-3 py-2" title={l.scopeLabel}>{l.scopeLabel}</td>
                  <td className="px-3 py-2 text-right">{centsToDollars(l.amountCents)}</td>
                  <td className={`px-3 py-2 text-right ${l.marginCents != null && l.marginCents < 0 && !faded ? "text-red-600" : ""}`}>
                    {l.marginCents == null
                      ? "-"
                      : `${centsToDollars(l.marginCents)}${l.ourCents ? ` (${Math.round((l.marginCents / l.ourCents) * 100)}%)` : ""}`}
                  </td>
                  <td className="px-3 py-2" title={l.otherBids ? `${l.otherBids} other bid${l.otherBids === 1 ? "" : "s"}` : "Nobody else bid"}>
                    {vsLowestText(l.vsLowestPct)}
                  </td>
                  <td className="px-3 py-2">{l.receivedOn ?? "-"}</td>
                  <td className="px-3 py-2">{SUB_BID_STATUS_LABELS[l.status]}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
