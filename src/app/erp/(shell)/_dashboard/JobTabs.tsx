"use client";

import { Fragment, useState } from "react";
import Link from "next/link";

export type JobTabRow = {
  id: string;
  href: string;
  title: string;
  /** Quiet line under the title (e.g. "Upcoming, starts Jan 12, 2027"). */
  note?: string;
  value: string;
  /** Exact amounts on hover. */
  valueTitle?: string;
  /** Red when it's a loss. */
  negative?: boolean;
  /** Quiet text after the value (a margin or an amount). */
  secondary?: string;
  /** Rows with a group sit under that heading, after the ungrouped rows. */
  group?: string;
};

export type JobTab = {
  key: string;
  label: string;
  rows: JobTabRow[];
  empty: string;
  footer?: string;
  /** Show only this many rows until "See all" is clicked. */
  limit?: number;
};

/** One card with a few job lists behind tabs. */
export function JobTabs({ tabs }: { tabs: JobTab[] }) {
  const [active, setActive] = useState(tabs[0]?.key);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const tab = tabs.find((t) => t.key === active) ?? tabs[0];
  const showAll = expanded[tab.key] || !tab.limit || tab.rows.length <= tab.limit;
  const rows = showAll ? tab.rows : tab.rows.slice(0, tab.limit);

  return (
    <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
      <div role="tablist" className="flex gap-5 border-b border-gray-100 px-4">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={t.key === tab.key}
            onClick={() => setActive(t.key)}
            className={`-mb-px border-b-2 py-3 text-sm font-medium transition ${
              t.key === tab.key ? "border-gray-900 text-gray-900" : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="p-2">
        {rows.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-gray-400">{tab.empty}</p>
        ) : (
          <ul className="max-h-[28rem] overflow-y-auto">
            {rows.map((r, i) => (
              <Fragment key={r.id}>
                {r.group && r.group !== rows[i - 1]?.group && (
                  <li className="mt-2 border-t border-gray-100 px-2 pb-1 pt-3 text-xs font-medium text-gray-500">{r.group}</li>
                )}
                <li>
                  <Link href={r.href} className="flex items-baseline justify-between gap-3 rounded-md px-2 py-2 transition hover:bg-gray-50">
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-gray-700" title={r.title}>{r.title}</span>
                      {r.note && <span className="block text-xs text-gray-400">{r.note}</span>}
                    </span>
                    <span className="shrink-0 text-sm tabular-nums" title={r.valueTitle}>
                      <span className={r.negative ? "text-red-600" : "text-gray-900"}>{r.value}</span>
                      {r.secondary && <span className="ml-1.5 text-xs text-gray-400">{r.secondary}</span>}
                    </span>
                  </Link>
                </li>
              </Fragment>
            ))}
          </ul>
        )}
        {(tab.footer || (tab.limit && tab.rows.length > tab.limit)) && rows.length > 0 && (
          <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-2 pb-1 pt-2.5 text-xs">
            {tab.limit && tab.rows.length > tab.limit ? (
              <button
                type="button"
                onClick={() => setExpanded((e) => ({ ...e, [tab.key]: !showAll }))}
                className="font-medium text-gray-500 hover:text-gray-900"
              >
                {showAll ? "Show fewer" : `See all ${tab.rows.length}`}
              </button>
            ) : <span />}
            {tab.footer && <span className="text-gray-500">{tab.footer}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
