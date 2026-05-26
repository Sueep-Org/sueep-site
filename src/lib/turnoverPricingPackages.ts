export type TurnoverPricingPackage = {
  cleaningRates: { 1: number; 2: number; 3: number };
  paintingRates: { 1: number; 2: number; 3: number };
  label: string;
};

export const DEFAULT_TURNOVER_PRICING_PACKAGE: TurnoverPricingPackage = {
  label: "Standard turnover pricing",
  cleaningRates: { 1: 185, 2: 255, 3: 385 },
  paintingRates: { 1: 340, 2: 400, 3: 450 },
};

const SONO_GIO_PRICING_PACKAGE: TurnoverPricingPackage = {
  label: "The Block at SONO / The Gio Apartments pricing",
  cleaningRates: { 1: 150, 2: 200, 3: 200 },
  paintingRates: { 1: 500, 2: 600, 3: 600 },
};

const BUILDING_PRICING_PACKAGES = [
  {
    match: ["the block at sono", "sono"],
    package: SONO_GIO_PRICING_PACKAGE,
  },
  {
    match: ["the gio apartments", "the gio"],
    package: SONO_GIO_PRICING_PACKAGE,
  },
] as const;

function normalizeBuildingName(value: string | null | undefined) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizePricingBedrooms(value?: number | null): 1 | 2 | 3 {
  const beds = Number(value ?? 1);
  if (!Number.isFinite(beds) || beds < 1) return 1;
  if (beds >= 3) return 3;
  return beds === 2 ? 2 : 1;
}

export function getTurnoverPricingPackage(buildingName?: string | null): TurnoverPricingPackage {
  const normalized = normalizeBuildingName(buildingName);
  const match = BUILDING_PRICING_PACKAGES.find((entry) =>
    entry.match.some((name) => normalized === name || normalized.includes(name)),
  );
  return match?.package ?? DEFAULT_TURNOVER_PRICING_PACKAGE;
}
