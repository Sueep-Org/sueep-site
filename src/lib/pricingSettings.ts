/**
 * Company prices set on the Settings page (Pricing tab), as one object the
 * price math takes. Client-safe. Servers read it with loadPricingSettings
 * (pricingSettingsServer.ts); ERP pages in the browser with usePricingSettings.
 */

import { DEFAULT_NEXT_DAY_UPCHARGE_PERCENT } from "@/lib/nextDayUpcharge";
import { DEFAULT_CO_COST_RATES, DEFAULT_CO_DAY_HOURS, DEFAULT_CO_PRICE_RATES, type ResolvedChangeOrderLaborRates } from "@/lib/changeOrderLaborRates";
import { DEFAULT_SALES_TAX_PCT } from "@/lib/erp/janitorialPricing";
import { DEFAULT_TURNOVER_PRICING_PACKAGE, type TurnoverPricingPackage } from "@/lib/turnoverPricingPackages";
import { DEFAULT_CO_PRICING_PACKAGE, type CoPricingPackage } from "@/lib/coPricingPackage";

export type PricingSettings = {
  nextDayPct: number;
  /** What we charge per hour on change orders, for projects without their own rate */
  coPriceRates: ResolvedChangeOrderLaborRates;
  /** What we pay per hour, for a change order's Est. Labor $ */
  coCostRates: ResolvedChangeOrderLaborRates;
  coDayHours: number;
  janitorialSalesTaxPct: number;
  /** Standard turnover prices for buildings without their own */
  turnoverPackage: TurnoverPricingPackage;
  /** Standard sub change order issues for buildings without their own */
  coPackage: CoPricingPackage;
};

export const DEFAULT_PRICING_SETTINGS: PricingSettings = {
  nextDayPct: DEFAULT_NEXT_DAY_UPCHARGE_PERCENT,
  coPriceRates: DEFAULT_CO_PRICE_RATES,
  coCostRates: DEFAULT_CO_COST_RATES,
  coDayHours: DEFAULT_CO_DAY_HOURS,
  janitorialSalesTaxPct: DEFAULT_SALES_TAX_PCT,
  turnoverPackage: DEFAULT_TURNOVER_PRICING_PACKAGE,
  coPackage: DEFAULT_CO_PRICING_PACKAGE,
};
