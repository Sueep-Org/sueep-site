export type TurnoverPricingPackage = {
  cleaningRates: { 1: number; 2: number; 3: number };
  paintingRates: { 1: number; 2: number; 3: number };
  cleaningLayoutRates?: Partial<Record<TurnoverUnitLayout, number>>;
  paintingLayoutRates?: Partial<Record<TurnoverUnitLayout, number>>;
  touchUpPaintLayoutRates?: Partial<Record<TurnoverUnitLayout, number>>;
  carpetCleaningLayoutRates?: Partial<Record<TurnoverUnitLayout, number>>;
  additionalMaterialsLayoutRates?: Partial<Record<TurnoverUnitLayout, number>>;
  ceilingPaintLayoutRates?: Partial<Record<TurnoverUnitLayout, number>>;
  label: string;
};

export type TurnoverUnitLayout = "studio" | "1/1" | "2/1" | "2/2" | "3/1" | "3/2" | "3/3" | "common-area";

export const TURNOVER_UNIT_LAYOUTS: TurnoverUnitLayout[] = ["studio", "1/1", "2/1", "2/2", "3/1", "3/2", "3/3", "common-area"];

export const DEFAULT_TURNOVER_PRICING_PACKAGE: TurnoverPricingPackage = {
  label: "Standard turnover pricing",
  cleaningRates: { 1: 185, 2: 255, 3: 385 },
  paintingRates: { 1: 340, 2: 400, 3: 450 },
  cleaningLayoutRates: {
    "studio": 150,
    "1/1": 185,
    "2/1": 255,
    "2/2": 255,
    "3/1": 385,
    "3/2": 385,
    "3/3": 385,
    "common-area": 0,
  },
  paintingLayoutRates: {
    "studio": 280,
    "1/1": 340,
    "2/1": 400,
    "2/2": 400,
    "3/1": 450,
    "3/2": 450,
    "3/3": 450,
    "common-area": 0,
  },
  touchUpPaintLayoutRates: {
    "studio": 125,
    "1/1": 125,
    "2/1": 125,
    "2/2": 125,
    "3/1": 125,
    "3/2": 125,
    "3/3": 125,
    "common-area": 0,
  },
  carpetCleaningLayoutRates: {
    "studio": 100,
    "1/1": 100,
    "2/1": 100,
    "2/2": 100,
    "3/1": 100,
    "3/2": 100,
    "3/3": 100,
    "common-area": 0,
  },
  additionalMaterialsLayoutRates: {
    "studio": 85,
    "1/1": 85,
    "2/1": 85,
    "2/2": 85,
    "3/1": 85,
    "3/2": 85,
    "3/3": 85,
    "common-area": 0,
  },
  ceilingPaintLayoutRates: {
    "studio": 75,
    "1/1": 75,
    "2/1": 75,
    "2/2": 75,
    "3/1": 75,
    "3/2": 75,
    "3/3": 75,
    "common-area": 0,
  },
};

export const REAL_ESTATE_PRICING_PACKAGE: TurnoverPricingPackage = {
  label: "Real estate pricing (2× standard)",
  cleaningRates: { 1: 370, 2: 510, 3: 770 },
  paintingRates: { 1: 680, 2: 800, 3: 900 },
  cleaningLayoutRates: {
    "studio": 300,
    "1/1": 370,
    "2/1": 510,
    "2/2": 510,
    "3/1": 770,
    "3/2": 770,
    "3/3": 770,
    "common-area": 0,
  },
  paintingLayoutRates: {
    "studio": 560,
    "1/1": 680,
    "2/1": 800,
    "2/2": 800,
    "3/1": 900,
    "3/2": 900,
    "3/3": 900,
    "common-area": 0,
  },
  carpetCleaningLayoutRates: {
    "studio": 200,
    "1/1": 200,
    "2/1": 200,
    "2/2": 200,
    "3/1": 200,
    "3/2": 200,
    "3/3": 200,
    "common-area": 0,
  },
};

const SONO_GIO_PRICING_PACKAGE: TurnoverPricingPackage = {
  label: "The Block at SONO / The Gio Apartments pricing",
  cleaningRates: { 1: 150, 2: 200, 3: 200 },
  paintingRates: { 1: 500, 2: 600, 3: 600 },
  cleaningLayoutRates: {
    "studio": 120,
    "1/1": 150,
    "2/1": 200,
    "2/2": 200,
    "3/1": 200,
    "3/2": 200,
    "3/3": 200,
    "common-area": 0,
  },
  paintingLayoutRates: {
    "studio": 400,
    "1/1": 500,
    "2/1": 600,
    "2/2": 600,
    "3/1": 600,
    "3/2": 600,
    "3/3": 600,
    "common-area": 0,
  },
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

function readNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
}

function readLayoutRates(value: unknown): Partial<Record<TurnoverUnitLayout, number>> {
  if (!value || typeof value !== "object") return {};
  const raw = value as Record<string, unknown>;
  return Object.fromEntries(
    TURNOVER_UNIT_LAYOUTS.flatMap((layout) => {
      const rate = readNumber(raw[layout]);
      return rate == null ? [] : [[layout, rate]];
    })
  ) as Partial<Record<TurnoverUnitLayout, number>>;
}

export function sanitizeTurnoverPricingPackage(
  value: unknown,
  fallback: TurnoverPricingPackage = DEFAULT_TURNOVER_PRICING_PACKAGE
): TurnoverPricingPackage {
  if (!value || typeof value !== "object") return fallback;
  const raw = value as Record<string, unknown>;
  const cleaningLayoutRates = { ...fallback.cleaningLayoutRates, ...readLayoutRates(raw.cleaningLayoutRates) };
  const paintingLayoutRates = { ...fallback.paintingLayoutRates, ...readLayoutRates(raw.paintingLayoutRates) };
  const touchUpPaintLayoutRates = { ...fallback.touchUpPaintLayoutRates, ...readLayoutRates(raw.touchUpPaintLayoutRates) };
  const carpetCleaningLayoutRates = { ...fallback.carpetCleaningLayoutRates, ...readLayoutRates(raw.carpetCleaningLayoutRates) };
  const additionalMaterialsLayoutRates = { ...fallback.additionalMaterialsLayoutRates, ...readLayoutRates(raw.additionalMaterialsLayoutRates) };
  const ceilingPaintLayoutRates = { ...fallback.ceilingPaintLayoutRates, ...readLayoutRates(raw.ceilingPaintLayoutRates) };

  return {
    label: String(raw.label || fallback.label).trim() || fallback.label,
    cleaningRates: {
      1: cleaningLayoutRates["1/1"] ?? fallback.cleaningRates[1],
      2: cleaningLayoutRates["2/2"] ?? cleaningLayoutRates["2/1"] ?? fallback.cleaningRates[2],
      3: cleaningLayoutRates["3/3"] ?? cleaningLayoutRates["3/2"] ?? cleaningLayoutRates["3/1"] ?? fallback.cleaningRates[3],
    },
    paintingRates: {
      1: paintingLayoutRates["1/1"] ?? fallback.paintingRates[1],
      2: paintingLayoutRates["2/2"] ?? paintingLayoutRates["2/1"] ?? fallback.paintingRates[2],
      3: paintingLayoutRates["3/3"] ?? paintingLayoutRates["3/2"] ?? paintingLayoutRates["3/1"] ?? fallback.paintingRates[3],
    },
    cleaningLayoutRates,
    paintingLayoutRates,
    touchUpPaintLayoutRates,
    carpetCleaningLayoutRates,
    additionalMaterialsLayoutRates,
    ceilingPaintLayoutRates,
  };
}

export function normalizePricingBedrooms(value?: number | null): 1 | 2 | 3 {
  const beds = Number(value ?? 1);
  if (!Number.isFinite(beds) || beds < 1) return 1;
  if (beds >= 3) return 3;
  return beds === 2 ? 2 : 1;
}

export function getTurnoverUnitLayout(
  bedrooms?: number | null,
  bathrooms?: number | null,
  isCommonArea?: boolean
): TurnoverUnitLayout {
  if (isCommonArea) return "common-area";
  const rawBeds = Number(bedrooms ?? 1);
  if (rawBeds <= 0) return "studio";
  const beds = normalizePricingBedrooms(bedrooms);
  const baths = Number(bathrooms ?? (beds === 1 ? 1 : beds === 2 ? 2 : 2));

  if (beds === 1) return "1/1";
  if (beds === 2) return baths <= 1 ? "2/1" : "2/2";
  if (baths <= 1) return "3/1";
  if (baths === 2) return "3/2";
  return "3/3";
}

export function getTurnoverCleaningRate(
  pricingPackage: TurnoverPricingPackage,
  bedrooms?: number | null,
  bathrooms?: number | null,
  isCommonArea?: boolean
) {
  const layout = getTurnoverUnitLayout(bedrooms, bathrooms, isCommonArea);
  const beds = normalizePricingBedrooms(bedrooms);
  return {
    layout,
    dollars: pricingPackage.cleaningLayoutRates?.[layout] ?? pricingPackage.cleaningRates[beds],
  };
}

export function getTurnoverPaintingRate(
  pricingPackage: TurnoverPricingPackage,
  bedrooms?: number | null,
  bathrooms?: number | null,
  isCommonArea?: boolean
) {
  const layout = getTurnoverUnitLayout(bedrooms, bathrooms, isCommonArea);
  const beds = normalizePricingBedrooms(bedrooms);
  return {
    layout,
    dollars: pricingPackage.paintingLayoutRates?.[layout] ?? pricingPackage.paintingRates[beds],
  };
}

export function getTurnoverTouchUpPaintRate(
  pricingPackage: TurnoverPricingPackage,
  bedrooms?: number | null,
  bathrooms?: number | null,
  isCommonArea?: boolean
) {
  const layout = getTurnoverUnitLayout(bedrooms, bathrooms, isCommonArea);
  return {
    layout,
    dollars: pricingPackage.touchUpPaintLayoutRates?.[layout] ?? (isCommonArea ? 0 : 125),
  };
}

export function getTurnoverCarpetCleaningRate(
  pricingPackage: TurnoverPricingPackage,
  bedrooms?: number | null,
  bathrooms?: number | null,
  isCommonArea?: boolean
) {
  const layout = getTurnoverUnitLayout(bedrooms, bathrooms, isCommonArea);
  return {
    layout,
    dollars: pricingPackage.carpetCleaningLayoutRates?.[layout] ?? (isCommonArea ? 0 : 100),
  };
}

export function getTurnoverAdditionalMaterialsRate(
  pricingPackage: TurnoverPricingPackage,
  bedrooms?: number | null,
  bathrooms?: number | null,
  isCommonArea?: boolean
) {
  const layout = getTurnoverUnitLayout(bedrooms, bathrooms, isCommonArea);
  return {
    layout,
    dollars: pricingPackage.additionalMaterialsLayoutRates?.[layout] ?? (isCommonArea ? 0 : 85),
  };
}

export function getTurnoverCeilingPaintRate(
  pricingPackage: TurnoverPricingPackage,
  bedrooms?: number | null,
  bathrooms?: number | null,
  isCommonArea?: boolean
) {
  const layout = getTurnoverUnitLayout(bedrooms, bathrooms, isCommonArea);
  return {
    layout,
    dollars: pricingPackage.ceilingPaintLayoutRates?.[layout] ?? (isCommonArea ? 0 : 75),
  };
}

export function getTurnoverPricingPackage(
  buildingName?: string | null,
  storedPackage?: unknown
): TurnoverPricingPackage {
  if (storedPackage) return sanitizeTurnoverPricingPackage(storedPackage);
  const normalized = normalizeBuildingName(buildingName);
  const match = BUILDING_PRICING_PACKAGES.find((entry) =>
    entry.match.some((name) => normalized === name || normalized.includes(name)),
  );
  return match?.package ?? DEFAULT_TURNOVER_PRICING_PACKAGE;
}
