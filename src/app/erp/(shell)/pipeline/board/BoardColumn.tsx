"use client";

import { useState } from "react";
import { InfoTip } from "@/app/erp/components/ui";
import { centsToDollarsCompact } from "@/lib/erp/money";
import type { BoardCard as Card, BoardColumn as Column } from "@/lib/erp/pipelineBoard";
import { BoardCard } from "./BoardCard";
import { useBoard } from "./context";

/**
 * One stage: colored top (pink open, green won, gray lost), count, total,
 * likely $, stuck count, and its cards. Also a drop target. Likely $ uses the
 * weekly forecast's rule (forecastOf): amount times chance to win, open
 * post-con deals only, Clean up deals left out.
 */
export function BoardColumn({ col, cards, closedDays, recentOnly }: { col: Column; cards: Card[]; closedDays: number; recentOnly: boolean }) {
  const b = useBoard();
  const [over, setOver] = useState(false);
  const total = cards.reduce((s, c) => s + c.cents, 0);
  const stuck = cards.filter((c) => c.stuck).length;
  const scored = col.outcome === "open" ? cards.filter((c) => c.chance && !c.cleanup) : [];
  const likely = scored.reduce((s, c) => s + c.cents * c.chance!.p, 0);
  const tone = col.outcome === "won" ? "border-t-emerald-400" : col.outcome === "lost" ? "border-t-gray-300" : "border-t-pink-300";
  const canDrop = !!b.dragging && b.canMove(b.dragging, col);
  return (
    <section
      onDragOver={(e) => {
        if (!canDrop) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (!over) setOver(true);
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (canDrop) b.drop(col);
      }}
      className={`flex w-60 shrink-0 flex-col rounded-lg border border-t-4 bg-gray-50 ${tone} ${
        over && canDrop ? "border-pink-400 ring-2 ring-pink-200" : canDrop ? "border-dashed border-gray-300" : "border-gray-200"
      }`}
    >
      <header className="border-b border-gray-200 px-2.5 py-2">
        <h2 className="truncate text-xs font-semibold text-gray-900">{col.label}</h2>
        <p className="flex flex-wrap items-center gap-x-1 text-[11px] text-gray-500">
          {cards.length} · {centsToDollarsCompact(total)}
          {scored.length > 0 && (
            <span
              className="text-gray-700"
              title={`Each deal's amount times its chance to win, added up (${scored.length} deal${scored.length === 1 ? "" : "s"}; clean-up deals left out)`}
            >
              · ~{centsToDollarsCompact(Math.round(likely))} likely
            </span>
          )}
          {stuck > 0 && (
            <span className="text-amber-700" title={`Stuck after ${col.stuckLimit} days in this stage`}>
              · {stuck} stuck
            </span>
          )}
          {recentOnly && col.hidden > 0 && (
            <>
              <span className="text-gray-400">· {col.hidden} older</span>
              <InfoTip
                text={`Deals not created or active in the last ${closedDays} days are hidden here. Pick All under Older deals in the filter to see them.`}
              />
            </>
          )}
        </p>
      </header>
      <div className="max-h-[70vh] space-y-1.5 overflow-y-auto p-2">
        {cards.length === 0 ? <p className="px-1 py-2 text-xs text-gray-300">None</p> : cards.map((c) => <BoardCard key={c.id} c={c} outcome={col.outcome} />)}
      </div>
    </section>
  );
}
