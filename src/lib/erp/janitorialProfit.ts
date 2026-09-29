/**
 * Janitorial contract profit: labor cost per building from the same resolved
 * hours payroll pays (clocked, corrected, or scheduled fallback, after the
 * unpaid break), priced with the shared labor cost rule (see laborCost.ts):
 * each janitor's hourly pay on that day from their pay history, plus overtime
 * the same way payroll pays it.
 */

import { costJanitorialByContract } from "@/lib/erp/laborCost";

export type ContractLabor = {
  hours: number;
  costCents: number;
  /** Janitors who worked here with no hourly rate set, so their hours cost $0 here. */
  missingRateNames: string[];
};

/** Labor per contract for [start, end] (UTC-midnight labels, inclusive, up to 31 days). */
export async function laborCostByContract(start: Date, end: Date): Promise<Map<string, ContractLabor>> {
  return costJanitorialByContract(start, end);
}

/** First and last day (UTC-midnight labels) of the month containing `d`. */
export function monthBounds(d: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return { start, end };
}
