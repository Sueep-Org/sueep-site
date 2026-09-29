import Link from "next/link";

export type DashboardTab = "overview" | "operations" | "finance" | "team";

export const DASHBOARD_TAB_LABELS: Record<DashboardTab, string> = {
  overview: "Overview",
  operations: "Operations",
  finance: "Finance",
  team: "Team",
};

/** Picks the requested tab if this role has it, otherwise the role's first tab. */
export function resolveDashboardTab(requested: string | undefined, allowed: DashboardTab[]): DashboardTab {
  return allowed.includes(requested as DashboardTab) ? (requested as DashboardTab) : allowed[0];
}

/** Underlined tab row under the dashboard greeting. Plain links (?tab=), so
 * each tab is a server render that only loads its own data. */
export function DashboardTabs({ tabs, active }: { tabs: DashboardTab[]; active: DashboardTab }) {
  if (tabs.length < 2) return null;
  return (
    <nav className="-mx-1 flex gap-1 overflow-x-auto border-b border-gray-200" aria-label="Dashboard sections">
      {tabs.map((t) => (
        <Link
          key={t}
          href={t === tabs[0] ? "/erp" : `/erp?tab=${t}`}
          aria-current={t === active ? "page" : undefined}
          className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition ${
            t === active ? "border-pink-600 text-pink-600" : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-800"
          }`}
        >
          {DASHBOARD_TAB_LABELS[t]}
        </Link>
      ))}
    </nav>
  );
}
