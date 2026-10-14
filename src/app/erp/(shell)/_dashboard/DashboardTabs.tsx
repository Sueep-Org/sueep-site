import Link from "next/link";
import { CARD_TAB_LABELS, type CardTab } from "@/lib/erp/dashboardCards";

/** The original tabs, plus the card tabs from dashboardCards.ts. */
export type DashboardTab = "overview" | "operations" | "finance" | "team" | CardTab;

export const DASHBOARD_TAB_LABELS: Record<DashboardTab, string> = {
  overview: "Overview",
  operations: "Operations",
  finance: "Finance",
  team: "Team",
  ...CARD_TAB_LABELS,
};

/** Picks the requested tab if this role has it, then the person's chosen
 * start tab if they still have it, otherwise the role's first tab. */
export function resolveDashboardTab(requested: string | undefined, allowed: DashboardTab[], preferred?: string | null): DashboardTab {
  if (allowed.includes(requested as DashboardTab)) return requested as DashboardTab;
  if (allowed.includes(preferred as DashboardTab)) return preferred as DashboardTab;
  return allowed[0];
}

/** Underlined tab row under the dashboard greeting. Plain links (?tab=), so
 * each tab is a server render that only loads its own data. `home` is the
 * tab plain /erp opens on (the person's start tab, else the first tab).
 * `alerts` puts a red count on a tab that has something needing action. */
export function DashboardTabs({
  tabs,
  active,
  home,
  alerts,
  trailing,
}: {
  tabs: DashboardTab[];
  active: DashboardTab | null;
  home?: DashboardTab | null;
  alerts?: Partial<Record<DashboardTab, number>>;
  /** Shown at the right end of the row (the Customize button), even when there are too few tabs for a row. */
  trailing?: React.ReactNode;
}) {
  if (tabs.length < 2) return trailing ? <div className="flex justify-end">{trailing}</div> : null;
  const homeTab = home && tabs.includes(home) ? home : tabs[0];
  return (
    <div className="flex items-end gap-3">
      <nav className="-mx-1 flex min-w-0 flex-1 gap-1 overflow-x-auto border-b border-gray-200" aria-label="Dashboard sections">
        {tabs.map((t) => (
          <Link
            key={t}
            href={t === homeTab ? "/erp" : `/erp?tab=${t}`}
            aria-current={t === active ? "page" : undefined}
            className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition ${
              t === active ? "border-pink-600 text-pink-600" : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-800"
            }`}
          >
            {DASHBOARD_TAB_LABELS[t]}
            {!!alerts?.[t] && (
              <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-red-700">{alerts[t]}</span>
            )}
          </Link>
        ))}
      </nav>
      {trailing && <div className="border-b border-gray-200 pb-2.5">{trailing}</div>}
    </div>
  );
}
