"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { centsToDollars, centsToDollarsCompact } from "@/lib/erp/money";
import type { CashForecast, ForecastWeek } from "@/lib/erp/dashboardCashForecast";

/** Categorical slots 1 and 2 of the dataviz palette, checked against the white card. */
const IN_COLOR = "#2a78d6";
const OUT_COLOR = "#eb6834";
const NET_COLOR = "#374151"; // gray-700, a text-ink line so it never reads as a third series hue
const GRID_COLOR = "#e5e7eb"; // gray-200

const W = 640;
const H = 240;
const PAD = { top: 12, right: 12, bottom: 28, left: 52 };
const BAR_W = 18;

function weekLabel(key: string): string {
  return new Date(`${key}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** 1, 2 or 5 times a power of ten, so the axis reads in round numbers. */
function niceStep(range: number, ticks: number): number {
  const raw = range / ticks;
  const pow = 10 ** Math.floor(Math.log10(raw || 1));
  return [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? pow * 10;
}

/** A bar from the baseline to `to`, rounded 4px only at the data end. */
function barPath(x: number, base: number, to: number, w: number): string {
  const h = Math.abs(to - base);
  if (h < 0.5) return "";
  const r = Math.min(4, h, w / 2);
  if (to < base) {
    return `M${x},${base} V${to + r} Q${x},${to} ${x + r},${to} H${x + w - r} Q${x + w},${to} ${x + w},${to + r} V${base} Z`;
  }
  return `M${x},${base} V${to - r} Q${x},${to} ${x + r},${to} H${x + w - r} Q${x + w},${to} ${x + w},${to - r} V${base} Z`;
}

export function CashForecastChart({ forecast }: { forecast: CashForecast }) {
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const { weeks } = forecast;

  const top = Math.max(1, ...weeks.map((w) => Math.max(w.inCents, w.runningNetCents)));
  const bottom = Math.max(0, ...weeks.map((w) => Math.max(w.outCents, -w.runningNetCents)));
  const step = niceStep(top + bottom, 4);
  const yMax = Math.ceil(top / step) * step;
  const yMin = -Math.ceil(bottom / step) * step;
  const plotH = H - PAD.top - PAD.bottom;
  const plotW = W - PAD.left - PAD.right;
  const y = (cents: number) => PAD.top + ((yMax - cents) / (yMax - yMin)) * plotH;
  const band = plotW / weeks.length;
  const cx = (i: number) => PAD.left + band * i + band / 2;
  const ticks: number[] = [];
  for (let v = yMin; v <= yMax + 1; v += step) ticks.push(v);

  const netPath = weeks.map((w, i) => `${i ? "L" : "M"}${cx(i)},${y(w.runningNetCents)}`).join(" ");
  const active = hover != null ? weeks[hover] : null;

  return (
    <div className="space-y-3 px-2 pb-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: IN_COLOR }} />Money in</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: OUT_COLOR }} />Money out</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-3 rounded" style={{ backgroundColor: NET_COLOR }} />Running net</span>
        <button type="button" onClick={() => setShowTable((s) => !s)} className="ml-auto font-medium text-gray-500 hover:text-gray-900">
          {showTable ? "Show chart" : "Show table"}
        </button>
      </div>

      {showTable ? (
        <ForecastTable weeks={weeks} />
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Money in and out by week for the next 8 weeks, with the running net">
            {ticks.map((v) => (
              <g key={v}>
                <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke={v === 0 ? "#9ca3af" : GRID_COLOR} strokeWidth={1} />
                <text x={PAD.left - 6} y={y(v)} dy="0.32em" textAnchor="end" className="fill-gray-400 text-[10px] tabular-nums">
                  {centsToDollarsCompact(v)}
                </text>
              </g>
            ))}
            {weeks.map((w, i) => (
              <g key={w.startKey} opacity={hover == null || hover === i ? 1 : 0.45}>
                <path d={barPath(cx(i) - BAR_W / 2, y(0), y(w.inCents), BAR_W)} fill={IN_COLOR} />
                <path d={barPath(cx(i) - BAR_W / 2, y(0), y(-w.outCents), BAR_W)} fill={OUT_COLOR} />
                <text x={cx(i)} y={H - 8} textAnchor="middle" className="fill-gray-500 text-[10px]">{weekLabel(w.startKey)}</text>
              </g>
            ))}
            <path d={netPath} fill="none" stroke={NET_COLOR} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {weeks.map((w, i) => (
              <circle key={w.startKey} cx={cx(i)} cy={y(w.runningNetCents)} r={4} fill={NET_COLOR} stroke="#ffffff" strokeWidth={2} />
            ))}
            {/* Hit targets: the whole week column, bigger than any mark. */}
            {weeks.map((w, i) => (
              <rect
                key={w.startKey}
                x={PAD.left + band * i}
                y={PAD.top}
                width={band}
                height={plotH}
                fill="transparent"
                tabIndex={0}
                aria-label={`Week of ${weekLabel(w.startKey)}: in ${centsToDollars(w.inCents)}, out ${centsToDollars(w.outCents)}, running net ${centsToDollars(w.runningNetCents)}`}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                className="cursor-default outline-none"
              />
            ))}
          </svg>
          {active && hover != null && <WeekTooltip week={active} leftPct={(cx(hover) / W) * 100} />}
        </div>
      )}

      <TermsEditor termsDays={forecast.termsDays} canEdit={forecast.canEditTerms} />
      <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-gray-400">
        {forecast.assumptions.map((a) => <li key={a}>{a}</li>)}
      </ul>
    </div>
  );
}

function WeekTooltip({ week, leftPct }: { week: ForecastWeek; leftPct: number }) {
  const alignRight = leftPct > 60;
  return (
    <div
      className="pointer-events-none absolute top-2 z-10 w-60 rounded-lg border border-gray-200 bg-white p-3 text-xs shadow-lg"
      style={alignRight ? { right: `${100 - leftPct + 3}%` } : { left: `${leftPct + 3}%` }}
    >
      <p className="font-medium text-gray-500">Week of {weekLabel(week.startKey)}</p>
      <PartList title="In" color={IN_COLOR} total={week.inCents} parts={week.inParts} />
      <PartList title="Out" color={OUT_COLOR} total={week.outCents} parts={week.outParts} />
      <div className="mt-2 flex justify-between border-t border-gray-100 pt-2">
        <span className="text-gray-500">Running net</span>
        <span className={`font-semibold tabular-nums ${week.runningNetCents < 0 ? "text-red-600" : "text-gray-900"}`}>{centsToDollars(week.runningNetCents)}</span>
      </div>
    </div>
  );
}

function PartList({ title, color, total, parts }: { title: string; color: string; total: number; parts: { label: string; cents: number }[] }) {
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-gray-500"><span className="h-0.5 w-3 rounded" style={{ backgroundColor: color }} />{title}</span>
        <span className="font-semibold tabular-nums text-gray-900">{centsToDollars(total)}</span>
      </div>
      {parts.map((p) => (
        <div key={p.label} className="flex justify-between gap-2 pl-4 text-gray-400">
          <span className="truncate">{p.label}</span>
          <span className="tabular-nums">{centsToDollarsCompact(p.cents)}</span>
        </div>
      ))}
    </div>
  );
}

function ForecastTable({ weeks }: { weeks: ForecastWeek[] }) {
  const cell = "px-2 py-1.5 text-right tabular-nums";
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-gray-500">
          <tr className="border-b border-gray-100">
            <th className="px-2 py-1.5 text-left font-medium">Week of</th>
            <th className={`${cell} font-medium`}>In</th>
            <th className={`${cell} font-medium`}>Out</th>
            <th className={`${cell} font-medium`}>Running net</th>
          </tr>
        </thead>
        <tbody className="text-gray-700">
          {weeks.map((w) => (
            <tr key={w.startKey} className="border-b border-gray-50" title={[...w.inParts.map((p) => `In: ${p.label} ${centsToDollars(p.cents)}`), ...w.outParts.map((p) => `Out: ${p.label} ${centsToDollars(p.cents)}`)].join("\n")}>
              <td className="px-2 py-1.5">{weekLabel(w.startKey)}</td>
              <td className={cell}>{centsToDollars(w.inCents)}</td>
              <td className={cell}>{centsToDollars(w.outCents)}</td>
              <td className={`${cell} ${w.runningNetCents < 0 ? "text-red-600" : ""}`}>{centsToDollars(w.runningNetCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TermsEditor({ termsDays, canEdit }: { termsDays: number; canEdit: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(String(termsDays));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!canEdit) return null;

  async function save() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/erp/settings/cash-forecast-terms", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ days: Number(value) }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      setError((await res?.json().catch(() => null))?.error ?? "Couldn't save");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
      <label htmlFor="forecast-terms">Payment terms</label>
      <input
        id="forecast-terms"
        type="number"
        min={0}
        max={120}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-16 rounded-md border border-gray-300 px-2 py-1 text-xs tabular-nums focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
      />
      <span>days</span>
      {value !== String(termsDays) && (
        <button type="button" onClick={save} disabled={saving} className="rounded-md bg-pink-600 px-2.5 py-1 font-medium text-white hover:bg-pink-700 disabled:opacity-50">
          {saving ? "Saving..." : "Save"}
        </button>
      )}
      {error && <span className="text-red-600">{error}</span>}
    </div>
  );
}
