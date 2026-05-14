/** Pricing logic for simple cleaning and painting quotes based on bedroom count. */
export type ServicePricingService = "cleaning" | "painting";

export type ServicePricingInput = {
  service: ServicePricingService;
  beds: number;
};

export type ServicePricingResult = {
  service: ServicePricingService;
  beds: number;
  bedLabel: string;
  priceCents: number;
  priceLabel: string;
  description: string;
};

const PRICE_TABLE: Record<ServicePricingService, Record<1 | 2 | 3, number>> = {
  cleaning: {
    1: 185,
    2: 255,
    3: 385,
  },
  painting: {
    1: 340,
    2: 400,
    3: 450,
  },
};

const SERVICE_DESCRIPTIONS: Record<ServicePricingService, string> = {
  cleaning: "Cleaning only pricing for residential bedroom counts.",
  painting: "Painting only pricing for residential bedroom counts.",
};

function normalizeBedCount(beds: number): 1 | 2 | 3 {
  if (!Number.isFinite(beds) || beds < 1) return 1;
  if (beds >= 3) return 3;
  return beds === 2 ? 2 : 1;
}

function bedLabel(beds: 1 | 2 | 3): string {
  if (beds === 3) return "3 bed / townhome";
  return `${beds} bed`;
}

function formatUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function computeServicePricing(input: ServicePricingInput): ServicePricingResult {
  const beds = normalizeBedCount(Math.round(input.beds));
  const dollars = PRICE_TABLE[input.service][beds];
  const priceCents = Math.round(dollars * 100);

  return {
    service: input.service,
    beds,
    bedLabel: bedLabel(beds),
    priceCents,
    priceLabel: formatUsd(priceCents),
    description: SERVICE_DESCRIPTIONS[input.service],
  };
}

export function parseServicePricingPayload(body: unknown): ServicePricingInput | null {
  if (!body || typeof body !== "object") return null;
  const payload = body as Record<string, unknown>;
  const serviceRaw = String(payload.service || "").trim().toLowerCase();
  const bedsRaw = payload.beds;
  const beds = bedsRaw === undefined ? NaN : Number(bedsRaw);

  if (serviceRaw !== "cleaning" && serviceRaw !== "painting") return null;
  if (!Number.isFinite(beds) || beds < 1) return null;

  return {
    service: serviceRaw as ServicePricingService,
    beds,
  };
}
