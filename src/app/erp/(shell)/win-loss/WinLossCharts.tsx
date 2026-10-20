"use client";

import { useState } from "react";
import Link from "next/link";
import { centsToDollars, centsToDollarsCompact } from "@/lib/erp/money";
import type { Row } from "@/lib/erp/winLoss";

/**
 * Win/loss charts. Won and lost are categorical slots 1 and 2 of the dataviz
 * palette (same as the cash forecast chart), validated on the white card.
 * Open is a neutral gray: not decided yet, not a third category.
 */
const WON = "#2a78d6";
const LOST = "#eb6834";
const OPEN = "#d1d5db";
const GRID = "#e5e7eb";
const GAP = 2;

const pct = (x: number | null) => (x == null ? "-" : `${Math.round(x * 100)}%`);

export function Legend({ withOpen = true }: { withOpen?: boolean }) {
  const items: [string, string][] = [["Won", WON], ["Lost", LOST], ...(withOpen ? ([["Open", OPEN]] as [string, string][]) : [])];
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
      {items.map(([label, color]) => (
        <span key={label} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
          {label}
        </span>
      ))}
    </div>
  );
}

function Tip({ row, extra }: { row: Row; extra?: string }) {
  return (
    <div className="pointer-events-none absolute right-0 top-full z-10 mt-1 w-56 rounded-lg border border-gray-200 bg-white p-3 text-xs shadow-lg">
      <p className="font-medium text-gray-500">{row.label}</p>
      <p className="mt-1 text-base font-semibold text-gray-900">{pct(row.winRate)} win rate</p>
      {[
        ["Won", WON, `${row.won}${row.wonCents ? ` · ${centsToDollars(row.wonCents)}` : ""}`],
        ["Lost", LOST, `${row.lost}${row.lostCents ? ` · ${centsToDollars(row.lostCents)}` : ""}`],
        ["Open", OPEN, String(row.open)],
      ].map(([label, color, value]) => (
        <div key={label} className="mt-1 flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-gray-500">
            <span className="h-0.5 w-3 rounded" style={{ backgroundColor: color }} />
            {label}
          </span>
          <span className="font-medium tabular-nums text-gray-900">{value}</span>
        </div>
      ))}
      {extra && <p className="mt-2 text-gray-400">{extra}</p>}
    </div>
  );
}

function RowsTable({ rows, first }: { rows: Row[]; first: string }) {
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs text-gray-500">
        <tr>
          <th className="py-1 pr-2 font-medium">{first}</th>
          <th className="px-2 py-1 text-right font-medium">Bids</th>
          <th className="px-2 py-1 text-right font-medium">Won</th>
          <th className="px-2 py-1 text-right font-medium">Lost</th>
          <th className="px-2 py-1 text-right font-medium">Open</th>
          <th className="px-2 py-1 text-right font-medium">Win rate</th>
          <th className="py-1 pl-2 text-right font-medium">Won $</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {rows.map((r) => (
          <tr key={r.key}>
            <td className="py-1.5 pr-2 text-gray-900">
              {r.label}
              {r.note && <span className="block text-[11px] text-gray-400">{r.note}</span>}
            </td>
            <td className="px-2 py-1.5 text-right tabular-nums">{r.bids}</td>
            <td className="px-2 py-1.5 text-right tabular-nums">{r.won}</td>
            <td className="px-2 py-1.5 text-right tabular-nums">{r.lost}</td>
            <td className="px-2 py-1.5 text-right tabular-nums">{r.open}</td>
            <td className="px-2 py-1.5 text-right tabular-nums">{pct(r.winRate)}</td>
            <td className="py-1.5 pl-2 text-right tabular-nums">{r.wonCents ? centsToDollarsCompact(r.wonCents) : ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TableToggle({ showTable, onToggle }: { showTable: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} className="text-xs font-medium text-gray-500 hover:text-gray-900">
      {showTable ? "Show chart" : "Show table"}
    </button>
  );
}

/**
 * One horizontal bar per row: won, lost and open bids side by side, all on
 * one count scale, with the win rate at the end. For GCs and job sizes.
 */
export function StackedBars({ rows, first, limit }: { rows: Row[]; first: string; limit?: number }) {
  const [hover, setHover] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(false);
  const shown = limit ? rows.slice(0, limit) : rows;
  const max = Math.max(1, ...shown.map((r) => r.bids));
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Legend />
        <TableToggle showTable={showTable} onToggle={() => setShowTable((s) => !s)} />
      </div>
      {showTable ? (
        <RowsTable rows={shown} first={first} />
      ) : (
        <ul className="space-y-1.5">
          {shown.map((r) => {
            const seg = (n: number) => `${(n / max) * 100}%`;
            return (
              <li
                key={r.key}
                className="relative grid grid-cols-[minmax(0,11rem)_1fr_3rem] items-center gap-2 text-sm"
                tabIndex={0}
                aria-label={`${r.label}: ${r.bids} bids, ${r.won} won, ${r.lost} lost, ${r.open} open, ${pct(r.winRate)} win rate`}
                onPointerEnter={() => setHover(r.key)}
                onPointerLeave={() => setHover(null)}
                onFocus={() => setHover(r.key)}
                onBlur={() => setHover(null)}
              >
                <span className="min-w-0 text-gray-900" title={r.note ? `${r.label}\n${r.note}` : r.label}>
                  <span className="block truncate">
                    {r.href ? (
                      <Link href={r.href} className="text-pink-600 hover:underline">
                        {r.label}
                      </Link>
                    ) : (
                      r.label
                    )}
                  </span>
                  {r.note && <span className="block truncate text-[11px] text-gray-400">{r.note}</span>}
                </span>
                <span className="flex h-5 items-center" style={{ gap: GAP }}>
                  {(
                    [
                      [r.won, WON],
                      [r.lost, LOST],
                      [r.open, OPEN],
                    ] as const
                  )
                    .filter(([n]) => n > 0)
                    .map(([n, color], i, all) => (
                      // Square at the baseline, rounded only at the bar's end.
                      <span
                        key={color}
                        className={`h-full ${i === all.length - 1 ? "rounded-r" : ""}`}
                        style={{ width: seg(n), backgroundColor: color, opacity: hover && hover !== r.key ? 0.5 : 1 }}
                      />
                    ))}
                  <span className="ml-1.5 text-xs tabular-nums text-gray-500">{r.bids}</span>
                </span>
                <span className="text-right text-xs font-medium tabular-nums text-gray-900">{pct(r.winRate)}</span>
                {hover === r.key && <Tip row={r} />}
              </li>
            );
          })}
        </ul>
      )}
      {limit && rows.length > limit && (
        <p className="text-xs text-gray-500">
          Top {limit} of {rows.length} by bids. The number after each bar is bids; the right column is the win rate.
        </p>
      )}
    </div>
  );
}

/** Columns per quarter: won and lost bids stacked, win rate on the cap. Open bids are left out (not decided). */
export function QuarterColumns({ rows }: { rows: Row[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const W = 640,
    H = 220,
    PAD = { top: 22, right: 8, bottom: 26, left: 8 };
  const plotH = H - PAD.top - PAD.bottom;
  const band = (W - PAD.left - PAD.right) / Math.max(1, rows.length);
  const barW = Math.min(24, band - 6);
  const max = Math.max(1, ...rows.map((r) => r.won + r.lost));
  const h = (n: number) => (n / max) * plotH;
  const base = H - PAD.bottom;
  const active = hover != null ? rows[hover] : null;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Legend withOpen={false} />
        <TableToggle showTable={showTable} onToggle={() => setShowTable((s) => !s)} />
      </div>
      {showTable ? (
        <RowsTable rows={rows} first="Quarter" />
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Won and lost bids per quarter, with the win rate">
            <line x1={PAD.left} x2={W - PAD.right} y1={base} y2={base} stroke={GRID} strokeWidth={1} />
            {rows.map((r, i) => {
              const x = PAD.left + band * i + (band - barW) / 2;
              const wonH = h(r.won);
              const lostH = h(r.lost);
              const fade = hover != null && hover !== i ? 0.45 : 1;
              const lostTop = base - wonH - (r.won && r.lost ? GAP : 0) - lostH;
              return (
                <g key={r.key} opacity={fade}>
                  {r.won > 0 && <rect x={x} y={base - wonH} width={barW} height={wonH} fill={WON} rx={r.lost ? 0 : 3} />}
                  {r.lost > 0 && <path d={topRounded(x, lostTop, barW, lostH)} fill={LOST} />}
                  {r.won + r.lost > 0 && (
                    <text x={x + barW / 2} y={lostTop - 6} textAnchor="middle" className="fill-gray-600 text-[10px] font-medium">
                      {pct(r.winRate)}
                    </text>
                  )}
                  {(i % Math.ceil(rows.length / 12) === 0 || i === rows.length - 1) && (
                    <text x={x + barW / 2} y={H - 8} textAnchor="middle" className="fill-gray-500 text-[10px]">
                      {r.label}
                    </text>
                  )}
                </g>
              );
            })}
            {rows.map((r, i) => (
              <rect
                key={`hit-${r.key}`}
                x={PAD.left + band * i}
                y={PAD.top}
                width={band}
                height={plotH + PAD.bottom}
                fill="transparent"
                tabIndex={0}
                aria-label={`${r.label}: ${r.won} won, ${r.lost} lost, ${pct(r.winRate)} win rate`}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                className="outline-none"
              />
            ))}
          </svg>
          {active && hover != null && (
            <div
              className="pointer-events-none absolute top-0"
              style={
                hover / rows.length > 0.6
                  ? { right: `${100 - ((hover + 0.5) / rows.length) * 100 + 4}%` }
                  : { left: `${((hover + 0.5) / rows.length) * 100 + 4}%` }
              }
            >
              <div className="relative">
                <Tip row={active} extra={active.open ? `${active.open} still open, not in the bar.` : undefined} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function topRounded(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, h, w / 2);
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

/** Single-color bars for a list of counts (loss reasons). Value at the bar's tip. */
export function CountBars({
  items,
  color = LOST,
}: {
  items: { label: string; count: number; cents: number; share: number; muted?: boolean }[];
  color?: string;
}) {
  const [showTable, setShowTable] = useState(false);
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <TableToggle showTable={showTable} onToggle={() => setShowTable((s) => !s)} />
      </div>
      {showTable ? (
        <table className="w-full text-sm">
          <tbody className="divide-y divide-gray-100">
            {items.map((i) => (
              <tr key={i.label}>
                <td className="py-1.5 pr-2 text-gray-900">{i.label}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{i.count}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{pct(i.share)}</td>
                <td className="py-1.5 pl-2 text-right tabular-nums">{i.cents ? centsToDollarsCompact(i.cents) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <ul className="space-y-1.5">
          {items.map((i) => (
            <li
              key={i.label}
              className="grid grid-cols-[minmax(0,11rem)_1fr] items-center gap-2 text-sm"
              title={`${i.count} lost bids, ${pct(i.share)} of losses${i.cents ? `, ${centsToDollars(i.cents)}` : ""}`}
            >
              <span className={`truncate ${i.muted ? "text-gray-500" : "text-gray-900"}`}>{i.label}</span>
              <span className="flex h-5 items-center gap-1.5">
                <span className="h-full rounded-r" style={{ width: `${(i.count / max) * 85}%`, backgroundColor: i.muted ? OPEN : color }} />
                <span className="text-xs tabular-nums text-gray-600">
                  {i.count} <span className="text-gray-400">({pct(i.share)})</span>
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
