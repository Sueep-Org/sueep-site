import {
  getTurnoverCleaningRate,
  getTurnoverPaintingRate,
  getTurnoverTouchUpPaintRate,
  getTurnoverCarpetCleaningRate,
  getTurnoverAdditionalMaterialsRate,
  getTurnoverCeilingPaintRate,
  getTurnoverCompoundingRate,
  getTurnoverCustomLineItem,
  getTurnoverPricingPackage,
  type TurnoverUnitLayout,
} from "@/lib/turnoverPricingPackages";

export type TurnoverPricingInput = {
  requestType: "TURNOVER" | "REGULAR";
  buildingName?: string | null;
  pricingPackage?: unknown;
  bedrooms?: number | null;
  bathrooms?: number | null;
  isCommonArea?: boolean;
  fullPaint: boolean;
  touchUpPaint: number;
  fullClean: boolean;
  carpetCleaning: boolean;
  materialsAdditional: boolean;
  ceilingPaint: boolean;
  /** Count of spots/walls needing drywall compounding, same shape as
   * touchUpPaint above — 0 means not priced. */
  compounding: number;
  /** Unit's real bedrooms/bathrooms above are unchanged; when set with
   * partialTurnLayout, every priced service uses that smaller layout's rate
   * instead (e.g. a 3/3 priced as a 2/2 because only 2 bed/baths are in
   * scope), instead of the layout bedrooms/bathrooms would normally derive. */
  isPartialTurn?: boolean;
  partialTurnLayout?: string | null;
  /** IDs into the building's pricingPackage.customLineItems — see
   * turnoverPricingPackages.ts. Unlike the flags above, these reference
   * items that only exist on buildings that defined them. */
  selectedCustomLineItemIds?: string[];
};

export type TurnoverPricingResult = {
  priceCents: number;
  priceLabel: string;
  services: string[];
  breakdown: string[];
};

function formatUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
    cents / 100
  );
}

export function computeTurnoverPricing(input: TurnoverPricingInput): TurnoverPricingResult {
  const pricingPackage = getTurnoverPricingPackage(input.buildingName, input.pricingPackage);
  const layoutOverride: TurnoverUnitLayout | null =
    input.isPartialTurn && input.partialTurnLayout ? (input.partialTurnLayout as TurnoverUnitLayout) : null;
  const partialTurnSuffix = layoutOverride ? " (partial turn)" : "";
  const services: string[] = [];
  const breakdown: string[] = [];
  let priceCents = 0;

  // Computed unconditionally (not just when fullClean/fullPaint are checked)
  // since percentOfCleaning/percentOfPainting custom line items below need a
  // reference price to take their percentage of either way.
  const cleaningPrice = getTurnoverCleaningRate(pricingPackage, input.bedrooms, input.bathrooms, input.isCommonArea, layoutOverride).dollars * 100;
  const paintingRate = getTurnoverPaintingRate(pricingPackage, input.bedrooms, input.bathrooms, input.isCommonArea, layoutOverride);
  const paintingPrice = paintingRate.dollars * 100;

  if (input.fullClean) {
    const cleaningRate = getTurnoverCleaningRate(pricingPackage, input.bedrooms, input.bathrooms, input.isCommonArea, layoutOverride);
    services.push("Full cleaning");
    priceCents += cleaningPrice;
    breakdown.push(`Cleaning price for ${cleaningRate.layout}${partialTurnSuffix}: ${formatUsd(cleaningPrice)}`);
  }

  if (input.fullPaint) {
    services.push("Full painting");
    priceCents += paintingPrice;
    breakdown.push(`Painting price for ${paintingRate.layout}${partialTurnSuffix}: ${formatUsd(paintingPrice)}`);
  }

  if (input.touchUpPaint > 0 && !input.fullPaint) {
    const touchUpRate = getTurnoverTouchUpPaintRate(pricingPackage, input.bedrooms, input.bathrooms, input.isCommonArea, layoutOverride);
    const touchUpPrice = input.touchUpPaint * touchUpRate.dollars * 100;
    services.push(`${input.touchUpPaint} touch-up paint item${input.touchUpPaint === 1 ? "" : "s"}`);
    priceCents += touchUpPrice;
    breakdown.push(`Touch-up paint${partialTurnSuffix} (${input.touchUpPaint}x ${formatUsd(touchUpRate.dollars * 100)}): ${formatUsd(touchUpPrice)}`);
  }

  if (input.carpetCleaning) {
    const carpetRate = getTurnoverCarpetCleaningRate(pricingPackage, input.bedrooms, input.bathrooms, input.isCommonArea, layoutOverride);
    const carpetPrice = carpetRate.dollars * 100;
    services.push("Carpet cleaning");
    priceCents += carpetPrice;
    breakdown.push(`Carpet cleaning${partialTurnSuffix}: ${formatUsd(carpetPrice)}`);
  }

  if (input.materialsAdditional) {
    const materialsRate = getTurnoverAdditionalMaterialsRate(pricingPackage, input.bedrooms, input.bathrooms, input.isCommonArea, layoutOverride);
    const materialsPrice = materialsRate.dollars * 100;
    services.push("Additional materials");
    priceCents += materialsPrice;
    breakdown.push(`Additional materials${partialTurnSuffix}: ${formatUsd(materialsPrice)}`);
  }

  if (input.ceilingPaint) {
    const ceilingPaintRate = getTurnoverCeilingPaintRate(pricingPackage, input.bedrooms, input.bathrooms, input.isCommonArea, layoutOverride);
    const ceilingPaintPrice = ceilingPaintRate.dollars * 100;
    services.push("Ceiling painting");
    priceCents += ceilingPaintPrice;
    breakdown.push(`Ceiling painting${partialTurnSuffix}: ${formatUsd(ceilingPaintPrice)}`);
  }

  // Independent of fullPaint/touchUpPaint — drywall repair, not painting.
  if (input.compounding > 0) {
    const compoundingRate = getTurnoverCompoundingRate(pricingPackage, input.bedrooms, input.bathrooms, input.isCommonArea, layoutOverride);
    const compoundingPrice = input.compounding * compoundingRate.dollars * 100;
    services.push(`${input.compounding} compounding item${input.compounding === 1 ? "" : "s"}`);
    priceCents += compoundingPrice;
    breakdown.push(`Compounding${partialTurnSuffix} (${input.compounding}x ${formatUsd(compoundingRate.dollars * 100)}): ${formatUsd(compoundingPrice)}`);
  }

  // Building-specific extras (den surcharge, occupied-unit fee, etc.) — see
  // CustomLineItem. Silently skips any id the building no longer defines
  // (e.g. removed from the package after this unit selected it).
  for (const id of input.selectedCustomLineItemIds ?? []) {
    const item = getTurnoverCustomLineItem(pricingPackage, id);
    if (!item) continue;
    const itemPrice =
      item.type === "flat"
        ? item.amount * 100
        : item.type === "percentOfPainting"
          ? Math.round((paintingPrice * item.amount) / 100)
          : Math.round((cleaningPrice * item.amount) / 100);
    services.push(item.label);
    priceCents += itemPrice;
    breakdown.push(`${item.label}: ${formatUsd(itemPrice)}`);
  }

  if (services.length === 0) {
    services.push("No services selected");
    breakdown.push("No priced service lines were selected for this request.");
  }

  return {
    priceCents,
    priceLabel: formatUsd(priceCents),
    services,
    breakdown,
  };
}
