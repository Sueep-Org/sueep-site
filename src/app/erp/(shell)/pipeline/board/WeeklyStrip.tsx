"use client";

import { InfoTip } from "@/app/erp/components/ui";
import { centsToDollars, centsToDollarsCompact } from "@/lib/erp/money";
import type { PipelineBoard } from "@/lib/erp/pipelineBoard";
import { CHART, shortDay } from "@/lib/erp/pipelineUi";

/** What happened to last week's open deals, in stacking order. */
const FLOW = [
  { key: "movedForward", label: "Moved forward", color: CHART.moved },
  { key: "won", label: "Won", color: CHART.won },
  { key: "lost", label: "Closed lost", color: CHART.lost },
  { key: "stayed", label: "Same stage", color: CHART.open },
] as const;

function Tile({ label, info, children }: { label: string; info: string; children: React.ReactNode }) {
  return (
    <div className="min-w-[9rem] rounded-lg border border-gray-200 bg-white px-3 py-2">
      <p className="flex items-center gap-1 text-[11px] font-medium text-gray-500">
        {label}
        <InfoTip align="right" text={info} />
      </p>
      {children}
    </div>
  );
}

/** "This week" above the board: last week's open deals as one bar, new deals, the open pipeline total and the forecast. */
export function WeeklyStrip({ board }: { board: PipelineBoard }) {
  const w = board.weekly;
  const f = board.forecast;
  const since = w ? shortDay(w.sinceDay) : null;
  const flow = w ? FLOW.map((x) => ({ ...x, n: w[x.key] })) : [];
  const total = flow.reduce((t, x) => t + x.n, 0);
  const open = w?.trend.at(-1);
  const max = f ? Math.max(f.cents, f.wonLast12Cents, 1) : 1;

  return (
    <div className="flex flex-wrap items-stretch gap-2">
      <div className="min-w-[16rem] flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2">
        <p className="flex items-center gap-1 text-[11px] font-medium text-gray-500">
          {w ? `Last week's ${w.baseOpen} open deals, since ${since}` : "This week"}
          <InfoTip
            text={
              w
                ? `What happened to the deals that were open on ${since}, the saved pipeline from a week ago (or the oldest saved day while there isn't one that old yet). Moved forward: now in a later stage. Won and Closed lost: closed since. Same stage: still where they were.`
                : "The ERP saves the pipeline every morning. This fills in once there's a saved day to compare with."
            }
          />
        </p>
        {w && total > 0 ? (
          <>
            {/* Part of a whole: one bar, 2px gaps between segments, every segment labeled below. */}
            <div className="mt-2 flex h-3 w-full gap-[2px] overflow-hidden rounded">
              {flow
                .filter((x) => x.n > 0)
                .map((x) => (
                  <div key={x.key} title={`${x.label}: ${x.n}`} className="h-full" style={{ width: `${(x.n / total) * 100}%`, background: x.color }} />
                ))}
            </div>
            <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-600">
              {flow.map((x) => (
                <li key={x.key} className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm" style={{ background: x.color }} />
                  {x.label} <span className="font-semibold tabular-nums text-gray-900">{x.n}</span>
                  {x.key === "won" && w.wonCents > 0 && <span className="text-gray-500">{centsToDollarsCompact(w.wonCents)}</span>}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-2 text-xs text-gray-400">Starts after the first daily snapshot.</p>
        )}
      </div>

      {w && (
        <Tile label="New" info={`Deals created since ${since} that are still open, and their HubSpot amounts.`}>
          <p className="text-lg font-semibold tabular-nums text-gray-900">
            +{w.newDeals}
            {w.newCents > 0 && <span className="ml-1 text-xs font-normal text-gray-500">{centsToDollarsCompact(w.newCents)}</span>}
          </p>
        </Tile>
      )}

      {w && (
        <Tile
          label="Open pipeline"
          info="Open deals' HubSpot amounts added up, as of this morning's saved pipeline."
        >
          <p className="text-lg font-semibold tabular-nums text-gray-900">{open ? centsToDollarsCompact(open.cents) : "-"}</p>
        </Tile>
      )}

      {f && (
        <Tile
          label="Forecast"
          info={`Each open deal's amount times its chance to win, adding up ${f.deals} deals. Clean up deals are left out because they're usually dead. A rough guide, not a promise: the gray bar is what we actually won from bids created in the last 12 months (${f.wonLast12} jobs).`}
        >
          {/* Two magnitudes on one scale: the forecast and, for scale, what we really won. */}
          <div className="mt-1 space-y-1 text-[11px]">
            {[
              { label: "Forecast", cents: f.cents, color: CHART.ink },
              { label: "Won, last 12 mo", cents: f.wonLast12Cents, color: CHART.muted },
            ].map((x) => (
              <div key={x.label} className="flex items-center gap-2" title={`${x.label}: ${centsToDollars(x.cents)}`}>
                <span className="w-20 shrink-0 text-gray-500">{x.label}</span>
                <span className="h-2 rounded-r" style={{ width: `${Math.max(4, (x.cents / max) * 72)}px`, background: x.color }} />
                <span className="font-semibold tabular-nums text-gray-900">{centsToDollarsCompact(x.cents)}</span>
              </div>
            ))}
          </div>
        </Tile>
      )}
    </div>
  );
}
