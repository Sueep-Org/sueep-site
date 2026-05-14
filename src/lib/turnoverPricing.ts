export type TurnoverPricingInput = {
  requestType: "TURNOVER" | "REGULAR";
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

const CLEANING_RATES = { 1: 185, 2: 255, 3: 385 } as const;
const PAINTING_RATES = { 1: 340, 2: 400, 3: 450 } as const;

function normalizeBeds(value?: number | null): 1 | 2 | 3 {
  const beds = Number(value ?? 1);
  if (!Number.isFinite(beds) || beds < 1) return 1;
  if (beds >= 3) return 3;
  return beds === 2 ? 2 : 1;
}

function formatUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
    cents / 100
  );
}

export function computeTurnoverPricing(input: TurnoverPricingInput): TurnoverPricingResult {
  const beds = normalizeBeds(input.bedrooms);
  const services: string[] = [];
  const breakdown: string[] = [];
  let priceCents = 0;

  if (input.fullClean) {
    const cleaningPrice = CLEANING_RATES[beds] * 100;
    services.push("Full cleaning");
    priceCents += cleaningPrice;
    breakdown.push(`Cleaning price for ${beds}-bed unit: ${formatUsd(cleaningPrice)}`);
  }

  if (input.fullPaint) {
    const paintingPrice = PAINTING_RATES[beds] * 100;
    services.push("Full painting");
    priceCents += paintingPrice;
    breakdown.push(`Painting price for ${beds}-bed unit: ${formatUsd(paintingPrice)}`);
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
