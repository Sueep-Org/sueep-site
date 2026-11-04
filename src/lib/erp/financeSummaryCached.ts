import { unstable_cache } from "next/cache";
import { computeFinanceSummary } from "@/lib/erp/financeSummary";

/** How long a Finance summary is reused, per view and date range. */
const SUMMARY_SECONDS = 300;

/**
 * The whole Finance calculation is the slow part, so the same view is reused
 * for 5 minutes. The Finance tab, Compare with QuickBooks and the QuickBooks
 * pages share it, so opening one warms the others. Only for pages and routes:
 * scripts and crons call computeFinanceSummary directly.
 */
export const cachedFinanceSummary = unstable_cache(computeFinanceSummary, ["finance-tab-summary-v2"], { revalidate: SUMMARY_SECONDS });
