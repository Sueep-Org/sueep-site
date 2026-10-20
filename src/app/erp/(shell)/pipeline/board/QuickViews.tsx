"use client";

import { InfoTip } from "@/app/erp/components/ui";
import type { ViewKey } from "./filters";

/** One-click views above the board. Each is a preset of the filters, so the filter menu always shows what a view did. */
export function QuickViews({ views, active, onPick }: { views: { key: ViewKey; label: string }[]; active: ViewKey | null; onPick: (v: ViewKey) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {views.map((v) => (
        <button
          key={v.key}
          type="button"
          onClick={() => onPick(v.key)}
          aria-pressed={active === v.key}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            active === v.key ? "border-pink-300 bg-pink-50 text-pink-700" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-gray-900"
          }`}
        >
          {v.label}
        </button>
      ))}
      <InfoTip text="Quick views set the filters for you. My to-dos: your open deals that need something (late or missing next step, stuck, clean up, quiet, missing info). Clean up: deals 180+ days in one stage. Lost follow-up: lost deals that need a reason, a winner or a re-bid, including older ones. Bids this week: bid dates in the next 7 days, soonest first. Change any filter to make your own view." />
    </div>
  );
}
