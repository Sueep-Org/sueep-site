"use client";

import { inputClass, labelClass } from "@/app/erp/components/ui";
import { centsToDollars } from "@/lib/erp/money";
import {
  computeChangeOrderLaborEstimate,
  ACTUAL_CHANGE_ORDER_LABOR_COST_RATES,
  CHANGE_ORDER_ESTIMATE_DAY_HOURS,
  type ResolvedChangeOrderLaborRates,
} from "@/lib/changeOrderLaborRates";

const input = inputClass.md;
const label = labelClass.default;

type Props = {
  /** Billing rate (project's Labor rates, falls back to
   * DEFAULT_CHANGE_ORDER_LABOR_RATES) — drives the price/contract value
   * calculation. Null while unknown (e.g. no project picked yet). */
  pricingRates: ResolvedChangeOrderLaborRates | null;
  cleanerCount: string;
  onCleanerCountChange: (v: string) => void;
  supervisorCount: string;
  onSupervisorCountChange: (v: string) => void;
  contractValue: string;
  onContractValueChange: (v: string) => void;
  estLabor: string;
  onEstLaborChange: (v: string) => void;
  disabled?: boolean;
};

/** "# cleaners / # supervisors" (hours are never entered — every estimate
 * assumes a flat CHANGE_ORDER_ESTIMATE_DAY_HOURS-hour day per person, see
 * that constant) → two different calculated numbers: a price (this
 * project's billing rate, has margin built in) and a labor cost
 * (ACTUAL_CHANGE_ORDER_LABOR_COST_RATES, the real wage we pay) — plus the
 * manual price fields either can fill, which stay editable on their own so
 * a calculated number is always just a starting point, never a lock-in.
 * Used on both change order create forms and the CO detail page's Costs
 * tab, so the math and the fields stay identical everywhere a CO gets
 * priced. */
export function ChangeOrderLaborEstimator({
  pricingRates,
  cleanerCount,
  onCleanerCountChange,
  supervisorCount,
  onSupervisorCountChange,
  contractValue,
  onContractValueChange,
  estLabor,
  onEstLaborChange,
  disabled,
}: Props) {
  const counts = {
    cleanerCount: Number(cleanerCount) || 0,
    supervisorCount: Number(supervisorCount) || 0,
    hours: CHANGE_ORDER_ESTIMATE_DAY_HOURS,
  };
  const priceEstimate = pricingRates ? computeChangeOrderLaborEstimate(counts, pricingRates) : null;
  const costEstimate = computeChangeOrderLaborEstimate(counts, ACTUAL_CHANGE_ORDER_LABOR_COST_RATES);

  function useCalculatedNumbers() {
    if (priceEstimate) onContractValueChange((priceEstimate.totalCents / 100).toFixed(2));
    onEstLaborChange((costEstimate.totalCents / 100).toFixed(2));
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Pricing</h3>
      <p className="mt-1 text-xs text-gray-500">
        Enter the crew to calculate a price (this project&apos;s Labor rates) and a labor cost (actual pay), assuming
        a flat {CHANGE_ORDER_ESTIMATE_DAY_HOURS}-hour day per person — or skip straight to entering your own numbers
        below.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="co-est-cleaner-count"># of cleaners</label>
          <input
            id="co-est-cleaner-count"
            type="number"
            min={0}
            step={1}
            className={input}
            placeholder="0"
            value={cleanerCount}
            disabled={disabled}
            onChange={(e) => onCleanerCountChange(e.target.value)}
          />
        </div>
        <div>
          <label className={label} htmlFor="co-est-supervisor-count"># of supervisors</label>
          <input
            id="co-est-supervisor-count"
            type="number"
            min={0}
            step={1}
            className={input}
            placeholder="0"
            value={supervisorCount}
            disabled={disabled}
            onChange={(e) => onSupervisorCountChange(e.target.value)}
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md bg-gray-50 px-3 py-2">
        <div className="text-sm text-gray-700">
          <div>
            Price: <span className="font-semibold text-gray-900">{priceEstimate ? centsToDollars(priceEstimate.totalCents) : "—"}</span>
            {pricingRates ? (
              <span className="ml-1 text-xs text-gray-400">
                ({centsToDollars(pricingRates.cleanerHourlyRateCents)}/hr cleaner, {centsToDollars(pricingRates.foremanHourlyRateCents)}/hr
                supervisor)
              </span>
            ) : (
              <span className="ml-1 text-xs text-gray-400">(select a project to calculate)</span>
            )}
          </div>
          <div>
            Labor cost: <span className="font-semibold text-gray-900">{centsToDollars(costEstimate.totalCents)}</span>
            <span className="ml-1 text-xs text-gray-400">
              ({centsToDollars(ACTUAL_CHANGE_ORDER_LABOR_COST_RATES.cleanerHourlyRateCents)}/hr cleaner,{" "}
              {centsToDollars(ACTUAL_CHANGE_ORDER_LABOR_COST_RATES.foremanHourlyRateCents)}/hr supervisor — actual pay)
            </span>
          </div>
        </div>
        <button
          type="button"
          disabled={disabled || (!priceEstimate && costEstimate.totalCents === 0)}
          onClick={useCalculatedNumbers}
          className="rounded-md border border-pink-300 bg-white px-2.5 py-1 text-xs font-semibold text-pink-700 hover:bg-pink-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Use these numbers
        </button>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="co-contract-value">Price / contract value ($)</label>
          <input
            id="co-contract-value"
            type="number"
            min={0}
            step="0.01"
            className={input}
            placeholder="0.00"
            value={contractValue}
            disabled={disabled}
            onChange={(e) => onContractValueChange(e.target.value)}
          />
        </div>
        <div>
          <label className={label} htmlFor="co-est-labor">Est. labor ($)</label>
          <input
            id="co-est-labor"
            type="number"
            min={0}
            step="0.01"
            className={input}
            placeholder="0.00"
            value={estLabor}
            disabled={disabled}
            onChange={(e) => onEstLaborChange(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
