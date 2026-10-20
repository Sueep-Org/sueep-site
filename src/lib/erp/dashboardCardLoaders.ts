import type { ErpRole } from "../erpSession";
import type { DashboardCardData } from "@/app/erp/(shell)/_dashboard/DashboardCard";
import { countWaitingOnMeAlerts, loadEstimateAccuracy, loadPricingCheck, loadWaitingOnMe } from "./dashboardEstimation";
import { loadWins } from "./dashboardWins";
import { countRenewalAlerts, loadContractRenewals, loadMyCommission } from "./dashboardSales";
import { countNeedsActionAlerts, loadChecks, loadNeedsAction } from "./dashboardMoney";
import { loadCashForecast } from "./dashboardCashForecast";
import { countBidsDueAlerts, countPriceCheckAlerts, loadBidsDue, loadPipelineWeek, loadPriceCheck, loadSalesBids } from "./dashboardBids";
import { countRedJobs, loadJobStatusBoard } from "./dashboardJobs";
import { countCrewConflicts, loadCrewConflicts, loadWaitingOnOthers } from "./dashboardJobsWaiting";

/**
 * Server-side data for each dashboard card in dashboardCards.ts, keyed by
 * card id. `load` runs only when the card's tab is open. `alertCount` is a
 * cheap count for the red number on the tab label, so tabs that aren't
 * open don't have to load their full lists. Counts are cached for 5 minutes
 * per role (CardTabPanel.tsx), so an alertCount must not depend on who is
 * looking (ctx.email is empty there).
 */
export type CardContext = { role: ErpRole; email: string };

export type CardLoader = {
  load: (ctx: CardContext) => Promise<DashboardCardData>;
  alertCount?: (ctx: CardContext) => Promise<number>;
};

export const CARD_LOADERS: Record<string, CardLoader> = {
  "waiting-on-me": { load: loadWaitingOnMe, alertCount: countWaitingOnMeAlerts },
  "estimate-accuracy": { load: loadEstimateAccuracy },
  "pricing-check": { load: loadPricingCheck },
  "win-rate": { load: loadWins },
  "contract-renewals": { load: loadContractRenewals, alertCount: countRenewalAlerts },
  "my-commission": { load: (ctx) => loadMyCommission(ctx.email) },
  // Card id kept from when it was only stale quotes, so saved layouts still find it.
  "stale-quotes": { load: loadSalesBids, alertCount: countBidsDueAlerts },
  "bids-due": { load: loadBidsDue, alertCount: countBidsDueAlerts },
  "pipeline-week": { load: loadPipelineWeek },
  "quote-price-check": { load: loadPriceCheck, alertCount: countPriceCheckAlerts },
  "needs-action": { load: (ctx) => loadNeedsAction(ctx.role), alertCount: (ctx) => countNeedsActionAlerts(ctx.role) },
  "cash-forecast": { load: async (ctx) => ({ sections: [], forecast: await loadCashForecast(ctx.role) }) },
  checks: { load: loadChecks },
  "job-status-board": { load: loadJobStatusBoard, alertCount: countRedJobs },
  "waiting-on-others": { load: loadWaitingOnOthers },
  "crew-conflicts": { load: loadCrewConflicts, alertCount: countCrewConflicts },
};
