import {
  getTurnoverCleaningRate,
  getTurnoverPaintingRate,
  getTurnoverPricingPackage,
} from "@/lib/turnoverPricingPackages";

export type TurnoverPricingInput = {
  requestType: "TURNOVER" | "REGULAR";
  buildingName?: string | null;
  pricingPackage?: unknown;
  bedrooms?: number | null;
  bathrooms?: number | null;
  fullPaint: boolean;
  touchUpPaint: number;
  fullClean: boolean;
  carpetCleaning: boolean;
  materialsAdditional: boolean;
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
  const services: string[] = [];
  const breakdown: string[] = [];
  let priceCents = 0;

  if (input.fullClean) {
    const cleaningRate = getTurnoverCleaningRate(pricingPackage, input.bedrooms, input.bathrooms);
    const cleaningPrice = cleaningRate.dollars * 100;
    services.push("Full cleaning");
    priceCents += cleaningPrice;
    breakdown.push(`Cleaning price for ${cleaningRate.layout}: ${formatUsd(cleaningPrice)}`);
  }

  if (input.fullPaint) {
    const paintingRate = getTurnoverPaintingRate(pricingPackage, input.bedrooms, input.bathrooms);
    const paintingPrice = paintingRate.dollars * 100;
    services.push("Full painting");
    priceCents += paintingPrice;
    breakdown.push(`Painting price for ${paintingRate.layout}: ${formatUsd(paintingPrice)}`);
  }

  if (input.touchUpPaint > 0 && !input.fullPaint) {
    const touchUpPrice = input.touchUpPaint * 12500;
    services.push(`${input.touchUpPaint} touch-up paint item${input.touchUpPaint === 1 ? "" : "s"}`);
    priceCents += touchUpPrice;
    breakdown.push(`Touch-up paint: ${formatUsd(touchUpPrice)}`);
  }

  if (input.carpetCleaning) {
    const carpetPrice = input.fullClean ? 8000 : 12500;
    services.push("Carpet cleaning");
    priceCents += carpetPrice;
    breakdown.push(`Carpet cleaning: ${formatUsd(carpetPrice)}`);
  }

  if (input.materialsAdditional) {
    const materialsPrice = 8500;
    services.push("Additional materials");
    priceCents += materialsPrice;
    breakdown.push(`Additional materials: ${formatUsd(materialsPrice)}`);
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
