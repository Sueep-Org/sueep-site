"use client";

import { useState } from "react";
import { centsToDollars } from "@/lib/erp/money";
import type { PriceDotRow, PriceDotScope } from "@/lib/erp/winLoss";

/** Same won and lost colors as the other Win/Loss charts; the three checked with the dataviz palette validator. */
const COLOR: Record<PriceDotRow["key"], string> = { won: "#2a78d6", lost: "#eb6834", lostPrice: "#4a3aa7" };
const GRID = "#e5e7eb";
/** Rows need a few bids before their medians are worth comparing. */
const MIN_TO_COMPARE = 3;

const W = 640;
const LABEL_W = 150;
const PLOT_L = LABEL_W + 10;
const PLOT_R = W - 16;
const ROW_H = 36;
const AXIS_H = 22;

const money = (v: number) => `$${v.toFixed(2)}`;

/** Spread dots up and down a little inside their row so overlapping prices stay visible. Same id, same spot. */
function jitter(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((Math.abs(h) % 1000) / 1000 - 0.5) * 14;
}

function niceTicks(lo: number, hi: number): number[] {
  const raw = (hi - lo) / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Number(v.toFixed(6)));
  return out;
}

/** The one plain sentence above each strip. */
function summary(s: PriceDotScope): string {
  const won = s.rows.find((r) => r.key === "won")!;
  const lost = s.rows.find((r) => r.key === "lost")!;
  if (won.dots.length < MIN_TO_COMPARE || lost.dots.length < MIN_TO_COMPARE || won.median == null || lost.median == null)
    return `Too few ${won.dots.length < MIN_TO_COMPARE ? "won" : "lost"} bids with sq ft to compare yet.`;
  const diff = lost.median / won.median - 1;
  if (Math.abs(diff) < 0.05) return `Won and lost bids were priced about the same (${money(won.median)} vs ${money(lost.median)}).`;
  return `Lost bids were priced ${Math.round(Math.abs(diff) * 100)}% ${diff > 0 ? "higher" : "lower"} than won ones (${money(lost.median)} vs ${money(won.median)}).`;
}

function Strip({ s }: { s: PriceDotScope }) {
  const all = s.rows.flatMap((r) => r.dots.map((d) => d.perSqft));
  if (!all.length) return null;
  const lo = Math.min(...all) * 0.95;
  const hi = Math.max(...all) * 1.05;
  const x = (v: number) => PLOT_L + ((v - lo) / (hi - lo || 1)) * (PLOT_R - PLOT_L);
  const ticks = niceTicks(lo, hi);
  const h = s.rows.length * ROW_H + AXIS_H;
  return (
    <div>
      <p className="text-xs font-semibold text-gray-900">{s.label}</p>
      <p className="text-xs text-gray-600">{summary(s)}</p>
      <svg viewBox={`0 0 ${W} ${h}`} className="mt-1 w-full" role="img" aria-label={`${s.label}: price per sq ft of won and lost bids`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={0} y2={h - AXIS_H} stroke={GRID} strokeWidth={1} />
            <text x={x(t)} y={h - 6} textAnchor="middle" fontSize={11} fill="#6b7280">
              {money(t)}
            </text>
          </g>
        ))}
        {s.rows.map((r, i) => {
          const cy = i * ROW_H + ROW_H / 2;
          return (
            <g key={r.key}>
              {/* Row label carries identity, so color is never the only cue. */}
              <rect x={0} y={cy - 4} width={8} height={8} rx={2} fill={COLOR[r.key]} />
              <text x={14} y={cy - 2} fontSize={12} fill="#111827">
                {r.label}
              </text>
              <text x={14} y={cy + 12} fontSize={10} fill="#6b7280">
                {r.dots.length} bids{r.median != null ? ` · median ${money(r.median)}` : ""}
              </text>
              {r.dots.map((d) => (
                <a key={d.id} href={d.url ?? undefined} target="_blank" rel="noreferrer">
                  <circle
                    cx={x(d.perSqft)}
                    cy={cy + jitter(d.id)}
                    r={4}
                    fill={COLOR[r.key]}
                    fillOpacity={0.75}
                    stroke="#fff"
                    strokeWidth={2}
                    className="cursor-pointer"
                  >
                    <title>{`${d.name}\n${money(d.perSqft)} per sq ft · ${centsToDollars(d.cents)} for ${d.sqft.toLocaleString()} sq ft`}</title>
                  </circle>
                </a>
              ))}
              {r.median != null && r.dots.length > 0 && (
                <line x1={x(r.median)} x2={x(r.median)} y1={cy - 13} y2={cy + 13} stroke="#111827" strokeWidth={2} strokeLinecap="round">
                  <title>{`${r.label} median: ${money(r.median)}`}</title>
                </line>
              )}
            </g>
          );
        })}
      </svg>
      {s.excluded > 0 && (
        <p className="text-[11px] text-gray-400">
          {s.excluded} bids left out: their price is 3 times the middle or more (or a third or less), usually a typo in HubSpot.
        </p>
      )}
    </div>
  );
}

/** Won vs lost $ per sq ft, one strip per type of work, with a table view. */
export function PriceDots({ scopes }: { scopes: PriceDotScope[] }) {
  const [table, setTable] = useState(false);
  const shown = scopes.filter((s) => s.rows.some((r) => r.dots.length));
  if (!shown.length) return <p className="text-sm text-gray-500">No won or lost bids with an amount and Area SQFT in this period.</p>;
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button type="button" onClick={() => setTable((v) => !v)} className="text-xs font-medium text-gray-500 hover:text-gray-900">
          {table ? "Show chart" : "Show table"}
        </button>
      </div>
      {table ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500">
              <th className="pb-1 pr-2 font-medium">Type of work</th>
              <th className="px-2 pb-1 font-medium"></th>
              <th className="px-2 pb-1 text-right font-medium">Bids</th>
              <th className="px-2 pb-1 text-right font-medium">Median</th>
              <th className="pb-1 pl-2 text-right font-medium">Range</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {shown.flatMap((s) =>
              s.rows.map((r) => {
                const v = r.dots.map((d) => d.perSqft);
                return (
                  <tr key={`${s.scope}-${r.key}`}>
                    <td className="py-1.5 pr-2 text-gray-900">{r.key === "won" ? s.label : ""}</td>
                    <td className="px-2 py-1.5 text-gray-700">{r.label}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{r.dots.length}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{r.median != null ? money(r.median) : "-"}</td>
                    <td className="py-1.5 pl-2 text-right tabular-nums text-gray-500">
                      {v.length ? `${money(Math.min(...v))} to ${money(Math.max(...v))}` : ""}
                    </td>
                  </tr>
                );
              }),
            )}
          </tbody>
        </table>
      ) : (
        shown.map((s) => <Strip key={s.scope} s={s} />)
      )}
    </div>
  );
}
