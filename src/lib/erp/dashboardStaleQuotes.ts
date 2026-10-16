import type { DashboardCardData } from "@/app/erp/(shell)/_dashboard/DashboardCard";
import { centsToDollars, centsToDollarsCompact } from "./money";
import { STALE_DAYS, loadDealBundle, staleQuotes } from "./winLoss";

const SHOWN = 15;

/** Sales tab: quotes nobody has touched in STALE_DAYS (Win/loss page has the full list). */
export async function loadStaleQuotes(): Promise<DashboardCardData> {
  const stale = staleQuotes(await loadDealBundle());
  return {
    sections: [
      {
        key: "stale",
        label: "Stale quotes",
        rows: stale.slice(0, SHOWN).map((s) => ({
          id: s.id,
          href: s.url ?? "/erp/win-loss",
          title: s.name,
          note: `${s.stage}${s.owner ? `, ${s.owner}` : ""}, ${s.daysQuiet} days quiet`,
          value: s.cents ? centsToDollarsCompact(s.cents) : "",
          valueTitle: s.cents ? centsToDollars(s.cents) : undefined,
        })),
        empty: `No quotes quiet for ${STALE_DAYS}+ days.`,
        href: "/erp/win-loss",
        footer: stale.length > SHOWN ? `Biggest ${SHOWN} of ${stale.length}.` : undefined,
      },
    ],
  };
}
