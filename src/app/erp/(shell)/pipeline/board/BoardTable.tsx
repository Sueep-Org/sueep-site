"use client";

import { useMemo, useState } from "react";
import { centsToDollarsCompact } from "@/lib/erp/money";
import type { BoardCard, BoardColumn } from "@/lib/erp/pipelineBoard";
import { cardFlag, TONE_CLASS } from "@/lib/erp/dealAttention";
import { shortDay } from "@/lib/erp/pipelineUi";
import { useBoard } from "./context";
import { FlameIcon } from "./FlameIcon";

type SortKey = "name" | "stage" | "owner" | "gc" | "amount" | "likely" | "bid" | "award" | "days" | "next";

/** What each column sorts by. Blank values always go last. */
function sortValue(c: BoardCard, key: SortKey, stageIndex: Map<string, number>): string | number | null {
  switch (key) {
    case "name": return c.name.toLowerCase();
    case "stage": return stageIndex.get(c.stageId) ?? null;
    case "owner": return c.owner?.toLowerCase() ?? null;
    case "gc": return c.gc?.label.toLowerCase() ?? null;
    case "amount": return c.cents || null;
    case "likely": return c.chance ? c.cents * c.chance.p : null;
    case "bid": return c.bidDate;
    case "award": return c.awardDate;
    case "days": return c.daysInStage;
    case "next": return c.nextStep?.dueDate ?? null;
  }
}

/**
 * The Deals table (PIPELINE_EXTRAS_PLAN Phase 8): the same filtered deals as
 * the board, one row each. Click a header to sort (again to flip); clicking a
 * row opens the panel. Tick boxes show for people who can bulk edit.
 */
export function BoardTable({
  rows,
  columns,
  selectable,
  selected,
  onSelect,
}: {
  rows: BoardCard[];
  columns: BoardColumn[];
  selectable: boolean;
  selected: Set<string>;
  onSelect: (ids: string[], on: boolean) => void;
}) {
  const b = useBoard();
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean } | null>(null);
  const stageIndex = useMemo(() => new Map(columns.map((c, i) => [c.stageId, i])), [columns]);
  const stageLabel = useMemo(() => new Map(columns.map((c) => [c.stageId, c.label])), [columns]);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    return [...rows].sort((x, y) => {
      const a = sortValue(x, sort.key, stageIndex), z = sortValue(y, sort.key, stageIndex);
      if (a == null || z == null) return a == null ? (z == null ? 0 : 1) : -1;
      const cmp = typeof a === "number" && typeof z === "number" ? a - z : String(a).localeCompare(String(z));
      return sort.desc ? -cmp : cmp;
    });
  }, [rows, sort, stageIndex]);

  const head = (key: SortKey, label: string, right = false) => (
    <th className={`whitespace-nowrap px-3 py-2 font-semibold ${right ? "text-right" : ""}`}>
      <button
        type="button"
        onClick={() => setSort((s) => (s?.key === key ? { key, desc: !s.desc } : { key, desc: key === "amount" || key === "likely" || key === "days" }))}
        className="uppercase hover:text-gray-900"
      >
        {label}
        {sort?.key === key ? (sort.desc ? " ↓" : " ↑") : ""}
      </button>
    </th>
  );

  const allOn = sorted.length > 0 && sorted.every((c) => selected.has(c.id));
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full min-w-[1000px] text-left text-xs">
        <thead className="border-b border-gray-300 bg-gray-200 text-[11px] text-gray-700">
          <tr>
            {selectable && (
              <th className="w-8 px-3 py-2">
                <input type="checkbox" aria-label="Select all shown" checked={allOn} onChange={(e) => onSelect(sorted.map((c) => c.id), e.target.checked)} />
              </th>
            )}
            {head("name", "Deal")}
            {head("stage", "Stage")}
            {head("owner", "Owner")}
            {head("gc", b.companyWord)}
            {head("amount", "Amount", true)}
            {head("likely", "Likely", true)}
            {head("bid", "Bid")}
            {head("award", "Award")}
            {head("days", "Days in stage", true)}
            {head("next", "Next step")}
            <th className="px-3 py-2 font-semibold uppercase">Flag</th>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr>
              <td colSpan={selectable ? 12 : 11} className="px-3 py-6 text-center text-gray-400">No deals match.</td>
            </tr>
          )}
          {sorted.map((c, i) => {
            const flag = cardFlag(b.attentionOf(c));
            return (
              <tr
                key={c.id}
                onClick={(e) => !(e.target as HTMLElement).closest("a,button,input") && b.openPanel(c)}
                className={`cursor-pointer ${selected.has(c.id) ? "bg-pink-50" : i % 2 === 0 ? "bg-white" : "bg-gray-50"} hover:bg-gray-100`}
              >
                {selectable && (
                  <td className="px-3 py-2">
                    <input type="checkbox" aria-label={`Select ${c.name}`} checked={selected.has(c.id)} onChange={(e) => onSelect([c.id], e.target.checked)} />
                  </td>
                )}
                <td className="max-w-[18rem] px-3 py-2 font-medium text-gray-900">
                  <span className="flex items-center gap-1">
                    {c.priority === "high" && <FlameIcon />}
                    <span className="truncate" title={c.name}>{c.name}</span>
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-gray-700">{stageLabel.get(c.stageId) ?? ""}</td>
                <td className="whitespace-nowrap px-3 py-2 text-gray-700">{c.owner ?? "-"}</td>
                <td className="max-w-[12rem] truncate px-3 py-2 text-gray-700" title={c.gc?.label}>{c.gc?.label ?? "-"}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-900">{c.cents ? centsToDollarsCompact(c.cents) : "-"}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-600">{c.chance ? centsToDollarsCompact(Math.round(c.cents * c.chance.p)) : "-"}</td>
                <td className="whitespace-nowrap px-3 py-2 text-gray-700">{c.bidDate ? shortDay(c.bidDate) : "-"}</td>
                <td className="whitespace-nowrap px-3 py-2 text-gray-700">{c.awardDate ? shortDay(c.awardDate) : "-"}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-700">{c.daysInStage ?? "-"}</td>
                <td className={`max-w-[14rem] truncate px-3 py-2 ${c.nextStep && c.nextStep.dueDate < b.today ? "font-medium text-red-600" : "text-gray-700"}`} title={c.nextStep?.text}>
                  {c.nextStep ? `${c.nextStep.text} · ${shortDay(c.nextStep.dueDate)}` : "-"}
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  {flag ? <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${TONE_CLASS[flag.tone]}`}>{flag.chip}</span> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
