"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { InfoTip } from "@/app/erp/components/ui/InfoTip";
import type { JobTabRow } from "./JobTabs";
import type { CashForecast } from "@/lib/erp/dashboardCashForecast";
import { CashForecastChart } from "./CashForecastChart";

/** Lists show this many rows until "See all". */
export const CARD_ROW_LIMIT = 6;

/** A small labeled pill on a row (status lights). Always has text, never color alone. */
export type CardBadge = { label: string; tone: "red" | "orange" | "amber" | "green"; title?: string };

export type CardRow = JobTabRow & {
  badges?: CardBadge[];
  /** Matches a key in DashboardCardData.filters, for the filter chips. */
  filterKey?: string;
};

export type CardSection = {
  key: string;
  /** Inner tab label. Only shown when the card has more than one section. */
  label: string;
  rows: CardRow[];
  empty: string;
  /** Red number on the inner tab, for things that need action. */
  alertCount?: number;
  /** Full list page, shown as "Open list" in the footer. */
  href?: string;
  footer?: string;
};

export type DashboardCardData = {
  /** Red number next to the title, for things that need action. */
  alertCount?: number;
  sections: CardSection[];
  /** Cash forecast card: a chart instead of lists. */
  forecast?: CashForecast;
  /** Filter chips above the lists; rows match by filterKey. */
  filters?: { key: string; label: string }[];
};

const BADGE_TONE: Record<CardBadge["tone"], string> = {
  red: "bg-red-100 text-red-700",
  orange: "bg-orange-100 text-orange-700",
  amber: "bg-amber-100 text-amber-700",
  green: "bg-emerald-50 text-emerald-700",
};

/** One dashboard card: title, "i" helper, and one or more lists (inner tabs when more than one). */
export function DashboardCard({ title, info, data, children }: { title: string; info: string; data?: DashboardCardData; children?: React.ReactNode }) {
  const sections = data?.sections ?? [];
  const [active, setActive] = useState(sections[0]?.key);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<string | null>(null);
  const section = sections.find((s) => s.key === active) ?? sections[0];
  const sectionRows = section ? (filter ? section.rows.filter((r) => r.filterKey === filter) : section.rows) : [];
  const showAll = section ? expanded[section.key] || sectionRows.length <= CARD_ROW_LIMIT : true;
  const rows = showAll ? sectionRows : sectionRows.slice(0, CARD_ROW_LIMIT);

  return (
    <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
      <div className="flex items-center gap-2 px-4 pb-1 pt-3">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <InfoTip text={info} wide />
        {!!data?.alertCount && <AlertCount n={data.alertCount} />}
      </div>

      {sections.length > 1 && (
        <div role="tablist" className="flex gap-4 overflow-x-auto border-b border-gray-100 px-4">
          {sections.map((s) => (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={s.key === section?.key}
              onClick={() => setActive(s.key)}
              className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 py-2 text-xs font-medium transition ${
                s.key === section?.key ? "border-gray-900 text-gray-900" : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
            >
              {s.label}
              {!!s.alertCount && <AlertCount n={s.alertCount} />}
            </button>
          ))}
        </div>
      )}

      {!!data?.filters?.length && (
        <div className="flex flex-wrap gap-1.5 px-4 pt-2.5">
          {[{ key: null, label: "All" }, ...data.filters].map((f) => (
            <button
              key={f.key ?? "all"}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition ${
                filter === f.key ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 text-gray-600 hover:border-gray-400"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      <div className="p-2">
        {children}
        {data?.forecast && <CashForecastChart forecast={data.forecast} />}
        {section && (rows.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-gray-400">{section.empty}</p>
        ) : (
          <ul>
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
                      {!!r.badges?.length && (
                        <span className="mt-1 flex flex-wrap gap-1">
                          {r.badges.map((b) => (
                            <span key={b.label} title={b.title} className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${BADGE_TONE[b.tone]}`}>{b.label}</span>
                          ))}
                        </span>
                      )}
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
        ))}
        {section && rows.length > 0 && (sectionRows.length > CARD_ROW_LIMIT || section.href || section.footer) && (
          <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-2 pb-1 pt-2.5 text-xs">
            {sectionRows.length > CARD_ROW_LIMIT ? (
              <button
                type="button"
                onClick={() => setExpanded((e) => ({ ...e, [section.key]: !showAll }))}
                className="font-medium text-gray-500 hover:text-gray-900"
              >
                {showAll ? "Show fewer" : `See all ${sectionRows.length}`}
              </button>
            ) : <span />}
            {section.footer && <span className="text-gray-500">{section.footer}</span>}
            {section.href && <Link href={section.href} className="font-medium text-gray-500 hover:text-gray-900">Open list</Link>}
          </div>
        )}
      </div>
    </div>
  );
}

function AlertCount({ n }: { n: number }) {
  return <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-red-700">{n}</span>;
}
