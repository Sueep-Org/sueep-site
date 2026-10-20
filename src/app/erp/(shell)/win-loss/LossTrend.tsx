"use client";

import { useState } from "react";
import { LOSS_GROUPS, type LossGroup, type LossQuarter } from "@/lib/erp/lossGroups";

/**
 * Colors per reason group, in stacking order (bottom first). The four named
 * reasons were checked together with the dataviz palette validator; Price is
 * the same violet as Lost for Price on the price chart. Other and No reason
 * are neutral grays, not categories.
 */
const COLOR: Record<LossGroup, string> = {
  "GC Not Awarded": "#eb6834",
  Price: "#4a3aa7",
  "No Answer": "#eda100",
  "Proyecto en HOLD": "#1baf7a",
  other: "#9ca3af",
  none: "#e5e7eb",
};

const short = (key: string) => {
  const [y, q] = key.split(" ");
  return `${q}'${y!.slice(2)}`;
};

/** Lost deals per quarter as 100% bars split by main reason, with the count on top. */
export function LossTrend({ quarters }: { quarters: LossQuarter[] }) {
  const [table, setTable] = useState(false);
  const groups = LOSS_GROUPS.filter((g) => quarters.some((q) => q.parts[g.key] > 0));
  if (!quarters.some((q) => q.total)) return <p className="text-sm text-gray-500">No lost deals since 2023 for this type of work.</p>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Legend: always present, so identity never rests on color alone. */}
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-600">
          {groups.map((g) => (
            <li key={g.key} className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm" style={{ background: COLOR[g.key] }} />
              {g.label}
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => setTable((v) => !v)} className="text-xs font-medium text-gray-500 hover:text-gray-900">
          {table ? "Show chart" : "Show table"}
        </button>
      </div>

      {table ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500">
                <th className="pb-1 pr-2 font-medium">Quarter</th>
                <th className="px-2 pb-1 text-right font-medium">Lost</th>
                {groups.map((g) => (
                  <th key={g.key} className="px-2 pb-1 text-right font-medium">
                    {g.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {quarters.map((q) => (
                <tr key={q.key}>
                  <td className="py-1.5 pr-2 text-gray-900">{q.key}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{q.total}</td>
                  {groups.map((g) => (
                    <td key={g.key} className="px-2 py-1.5 text-right tabular-nums text-gray-700">
                      {q.parts[g.key] || ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="flex min-w-[36rem] items-end gap-1.5">
            {quarters.map((q) => (
              <div key={q.key} className="flex min-w-0 flex-1 flex-col items-center">
                <span className="text-[11px] tabular-nums text-gray-500">{q.total}</span>
                {/* 100% bar, square at the baseline, 2px surface gaps between reasons, rounded only at the top end. */}
                <div className="mt-0.5 flex h-32 w-full max-w-[24px] flex-col-reverse gap-[2px] overflow-hidden rounded-t">
                  {q.total === 0 ? (
                    <div className="h-px w-full bg-gray-200" />
                  ) : (
                    groups
                      .filter((g) => q.parts[g.key] > 0)
                      .map((g) => (
                        <div
                          key={g.key}
                          title={`${q.key} · ${g.label}: ${q.parts[g.key]} of ${q.total} (${Math.round((q.parts[g.key] / q.total) * 100)}%)`}
                          style={{ height: `${(q.parts[g.key] / q.total) * 100}%`, background: COLOR[g.key] }}
                          className="w-full shrink-0"
                        />
                      ))
                  )}
                </div>
                <span className="mt-1 text-[10px] text-gray-500">{short(q.key)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
