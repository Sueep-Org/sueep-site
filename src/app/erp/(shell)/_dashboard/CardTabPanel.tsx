import { unstable_cache } from "next/cache";
import type { ErpRole } from "@/lib/erpSession";
import { cardsForTab, CARD_TABS, type CardTab, type DashboardLayoutPrefs } from "@/lib/erp/dashboardCards";
import { CARD_LOADERS, type CardContext } from "@/lib/erp/dashboardCardLoaders";
import { Suspense, type ComponentProps } from "react";
import { DashboardCard, type DashboardCardData } from "./DashboardCard";
import { DashboardTabs } from "./DashboardTabs";

const FAILED: DashboardCardData = { sections: [{ key: "error", label: "", rows: [], empty: "Couldn't load this card. Try refreshing." }] };

/**
 * The cards on one card tab. Each card loads on its own behind a
 * placeholder, so the page shows right away and a quick card doesn't wait
 * for a slow one. One failing card doesn't take the others down.
 */
export function CardTabPanel({ tab, role, email, prefs }: { tab: CardTab; role: ErpRole; email: string; prefs: DashboardLayoutPrefs }) {
  const cards = cardsForTab(role, tab, prefs);
  if (!cards.length) return <p className="py-12 text-center text-sm text-gray-400">Nothing on this tab. Use Customize to show cards again.</p>;
  const ctx: CardContext = { role, email };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {cards.map((card) => (
        <div key={card.id} className={card.wide ? "lg:col-span-2" : undefined}>
          <Suspense fallback={<CardPlaceholder title={card.title} tall={!!card.wide} />}>
            <LoadedCard id={card.id} title={card.title} info={card.info} ctx={ctx} />
          </Suspense>
        </div>
      ))}
    </div>
  );
}

async function LoadedCard({ id, title, info, ctx }: { id: string; title: string; info: string; ctx: CardContext }) {
  let data = FAILED;
  const loader = CARD_LOADERS[id];
  if (loader) {
    try {
      data = await loader.load(ctx);
    } catch (err) {
      console.error(`Dashboard card ${id} failed`, err);
    }
  }
  return <DashboardCard title={title} info={info} data={data} />;
}

/** Grey stand-in with the card's real title, shown while its data loads. */
export function CardPlaceholder({ title, tall }: { title: string; tall: boolean }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white shadow-sm" aria-busy="true" aria-label={`${title} loading`}>
      <div className="px-4 pb-1 pt-3">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      </div>
      <div className="animate-pulse space-y-3 p-4">
        {Array.from({ length: tall ? 6 : 4 }, (_, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <div className="h-3 flex-1 rounded bg-gray-100" style={{ maxWidth: `${70 - (i % 3) * 12}%` }} />
            <div className="h-3 w-12 rounded bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The tab row, drawn right away without red counts, then again with them
 * once they're ready (cached 5 minutes, so usually instant).
 */
export function DashboardTabsWithAlerts({ role, prefs, ...tabProps }: TabRowProps & { role: ErpRole; prefs: DashboardLayoutPrefs }) {
  return (
    <Suspense fallback={<DashboardTabs {...tabProps} />}>
      <TabsAfterCounts role={role} prefs={prefs} {...tabProps} />
    </Suspense>
  );
}

async function TabsAfterCounts({ role, prefs, ...tabProps }: TabRowProps & { role: ErpRole; prefs: DashboardLayoutPrefs }) {
  const alerts = await cardTabAlertCounts(role, prefs);
  return <DashboardTabs {...tabProps} alerts={alerts} />;
}

type TabRowProps = Omit<ComponentProps<typeof DashboardTabs>, "alerts">;

/** How long tab red counts are reused. A count can be this stale; the tab's own cards are always live. */
const RED_COUNT_SECONDS = 300;

/** Thrown when a count failed, so a partial result (failed cards as 0) is shown but never cached. */
class PartialCounts extends Error {
  constructor(public counts: Partial<Record<CardTab, number>>) {
    super("Some dashboard red counts failed");
  }
}

/**
 * The counts for one role and set of visible cards. One card at a time:
 * all at once they can use up the connection pool. Counts are company-wide
 * (they never depend on who's looking, only on the role), so everyone with
 * the same role and cards shares one cached result.
 */
async function computeTabAlertCounts(role: ErpRole, cardIdsByTab: [CardTab, string[]][]): Promise<Partial<Record<CardTab, number>>> {
  const ctx: CardContext = { role, email: "" };
  const out: Partial<Record<CardTab, number>> = {};
  let failed = false;
  for (const [tab, ids] of cardIdsByTab) {
    let total = 0;
    for (const id of ids) {
      const count = CARD_LOADERS[id]?.alertCount;
      if (!count) continue;
      total += await count(ctx).catch((err) => {
        console.error(`Dashboard red count ${id} failed`, err);
        failed = true;
        return 0;
      });
    }
    if (total > 0) out[tab] = total;
  }
  if (failed) throw new PartialCounts(out);
  return out;
}

const cachedTabAlertCounts = unstable_cache(computeTabAlertCounts, ["dashboard-tab-red-counts-v1"], { revalidate: RED_COUNT_SECONDS });

/** Red numbers for card tab labels: the sum of each visible card's alert count, reused for 5 minutes. */
export async function cardTabAlertCounts(role: ErpRole, prefs: DashboardLayoutPrefs): Promise<Partial<Record<CardTab, number>>> {
  const cardIdsByTab = CARD_TABS.map((tab): [CardTab, string[]] => [tab, cardsForTab(role, tab, prefs).map((c) => c.id)]).filter(([, ids]) => ids.length > 0);
  try {
    return await cachedTabAlertCounts(role, cardIdsByTab);
  } catch (err) {
    if (err instanceof PartialCounts) return err.counts;
    throw err;
  }
}
