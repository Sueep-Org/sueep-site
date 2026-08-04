"use client";

import { useState } from "react";
import { addDays, dayKey, monthMatrix, startOfMonth } from "@/lib/erp/schedule";

const WEEKDAY_HEADS = ["S", "M", "T", "W", "T", "F", "S"];

function shiftMonth(anchor: Date, delta: number): Date {
  return new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + delta, 1));
}

function monthLabel(anchor: Date): string {
  return anchor.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** A small month-grid date picker for selecting an arbitrary, not
 * necessarily consecutive, set of days — e.g. "duplicate this to more
 * days," where the picked days don't have to form a clean range or weekly
 * pattern. Purely a controlled selection surface: the caller owns the
 * selected set and what happens with it. */
export function MiniCalendarPicker({
  selectedKeys,
  onToggle,
  minDateKey,
  initialMonthAnchor,
}: {
  selectedKeys: Set<string>;
  onToggle: (dateKey: string) => void;
  /** Days before this (YYYY-MM-DD) render disabled — can't be picked. */
  minDateKey?: string;
  /** Which month the calendar opens on, as a YYYY-MM-DD date within it. */
  initialMonthAnchor: string;
}) {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date(`${initialMonthAnchor}T00:00:00.000Z`)));
  const matrix = monthMatrix(cursor);

  return (
    <div className="rounded border border-gray-200 p-2">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setCursor((c) => shiftMonth(c, -1))}
          aria-label="Previous month"
          className="rounded px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-100"
        >
          ‹
        </button>
        <span className="text-xs font-medium text-gray-700">{monthLabel(cursor)}</span>
        <button
          type="button"
          onClick={() => setCursor((c) => shiftMonth(c, 1))}
          aria-label="Next month"
          className="rounded px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-100"
        >
          ›
        </button>
      </div>
      <div className="mt-1.5 grid grid-cols-7 gap-0.5 text-center text-[9px] font-medium uppercase text-gray-400">
        {WEEKDAY_HEADS.map((d, i) => (
          <div key={i}>{d}</div>
        ))}
      </div>
      <div className="mt-0.5 grid grid-cols-7 gap-0.5">
        {matrix.flat().map((cell, i) => {
          const k = dayKey(cell);
          const inMonth = cell.getUTCMonth() === cursor.getUTCMonth();
          const disabled = !!minDateKey && k < minDateKey;
          const selected = selectedKeys.has(k);
          return (
            <button
              key={i}
              type="button"
              disabled={disabled}
              onClick={() => onToggle(k)}
              title={k}
              className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-medium ${
                selected
                  ? "bg-pink-600 text-white"
                  : disabled
                  ? "text-gray-300"
                  : inMonth
                  ? "text-gray-700 hover:bg-pink-50"
                  : "text-gray-300 hover:bg-pink-50"
              }`}
            >
              {cell.getUTCDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Advances to the day after `dateKey`, as a YYYY-MM-DD string — the
 * sensible default first pick when duplicating a card forward. */
export function dayAfter(dateKey: string): string {
  return dayKey(addDays(new Date(`${dateKey}T00:00:00.000Z`), 1));
}
