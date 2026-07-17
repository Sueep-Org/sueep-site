/**
 * Heuristic instant quote for residential painting (planning range only).
 * Final price always confirmed by Sueep after site review.
 */

export type SqFtBand = "under_1200" | "1200_2000" | "2000_3500" | "over_3500";
export type PaintScope = "refresh_same" | "color_change";
export type CeilingScope = "no" | "some" | "all";
export type WallCondition = "good" | "minor" | "significant";
export type Occupancy = "empty" | "occupied";
export type Timeline = "asap" | "2_4_weeks" | "flexible";

export type PaintingQuoteInput = {
  /** From initial step, e.g. "Interior Painting" */
  serviceType: string;
  roomCount: number;
  sqFtBand: SqFtBand;
  scope: PaintScope;
  ceilings: CeilingScope;
  wallCondition: WallCondition;
  occupancy: Occupancy;
  timeline: Timeline;
};

export type PaintingQuoteResult = {
  lowCents: number;
  highCents: number;
  depositCents: number;
  breakdown: string[];
  disclaimer: string;
};

const DISCLAIMER =
  "This range is generated automatically from your answers and is for planning only. A Sueep estimator will confirm measurements, surfaces, and final pricing (including any repairs) before work is scheduled.";

function roundToNearest50Dollars(cents: number): number {
  const dollars = cents / 100;
  const rounded = Math.round(dollars / 50) * 50;
  return Math.max(0, rounded * 100);
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function sqFtBandLabel(band: SqFtBand): string {
  switch (band) {
    case "under_1200":
      return "under 1,200 sq ft";
    case "1200_2000":
      return "1,200–2,000 sq ft";
    case "2000_3500":
      return "2,000–3,500 sq ft";
    case "over_3500":
      return "over 3,500 sq ft";
    default:
      return band;
  }
}

function isInterior(serviceType: string): boolean {
  return /interior/i.test(serviceType) && !/exterior/i.test(serviceType);
}

function isExterior(serviceType: string): boolean {
  return /exterior/i.test(serviceType);
}

function isTrim(serviceType: string): boolean {
  return /trim/i.test(serviceType) || /doors/i.test(serviceType);
}

export function computePaintingQuote(input: PaintingQuoteInput): PaintingQuoteResult {
  const breakdown: string[] = [];

  let baseMin = 950;
  let baseMax = 1500;

  if (isExterior(input.serviceType)) {
    baseMin = 1800;
    baseMax = 2800;
    breakdown.push("Base range for exterior repaint (prep + siding/trim scope typical of metro homes).");
  } else if (isTrim(input.serviceType)) {
    baseMin = 550;
    baseMax = 1200;
    breakdown.push("Base range for trim & doors package (varies with linear footage and layers).");
  } else if (isInterior(input.serviceType) || /other/i.test(input.serviceType)) {
    baseMin = 900;
    baseMax = 1550;
    breakdown.push("Base range for interior repaint (typical room mix).");
  } else {
    breakdown.push("General painting scope — blended interior/exterior assumptions.");
  }

  const sqMult: Record<SqFtBand, number> = {
    under_1200: 0.92,
    "1200_2000": 1,
    "2000_3500": 1.22,
    over_3500: 1.45,
  };
  const m = sqMult[input.sqFtBand] ?? 1;
  baseMin *= m;
  baseMax *= m;
  breakdown.push(`Home size factor (${sqFtBandLabel(input.sqFtBand)}): ×${m.toFixed(2)}`);

  const rooms = clamp(Math.round(input.roomCount), 1, 20);
  if (isInterior(input.serviceType) || /other/i.test(input.serviceType)) {
    const extra = Math.max(0, rooms - 1);
    baseMin += extra * 240;
    baseMax += extra * 420;
    breakdown.push(`${rooms} primary room(s) / areas included in scope.`);
  }

  if (input.scope === "color_change") {
    baseMin *= 1.12;
    baseMax *= 1.2;
    breakdown.push("Color change (extra coats / cut-in): +12–20%");
  } else {
    breakdown.push("Same-color refresh assumed where possible.");
  }

  if (input.ceilings === "some") {
    baseMin += 280;
    baseMax += 520;
    breakdown.push("Ceilings (partial): added labor & materials.");
  } else if (input.ceilings === "all") {
    baseMin += 520;
    baseMax += 980;
    breakdown.push("Ceilings (full scope): added labor & materials.");
  }

  if (input.wallCondition === "minor") {
    baseMin *= 1.06;
    baseMax *= 1.1;
    breakdown.push("Minor wall prep (nail holes, light patching).");
  } else if (input.wallCondition === "significant") {
    baseMin *= 1.18;
    baseMax *= 1.28;
    breakdown.push("Significant prep (repairs, texture blend, more sanding/fill).");
  }

  if (input.occupancy === "occupied") {
    baseMin *= 1.05;
    baseMax *= 1.08;
    breakdown.push("Occupied home (furniture/move coverage): modest schedule factor.");
  }

  if (input.timeline === "asap") {
    baseMin *= 1.08;
    baseMax *= 1.12;
    breakdown.push("Sooner start requested: priority scheduling factor.");
  }

  const lowCents = roundToNearest50Dollars(baseMin * 100);
  const highCents = Math.max(lowCents + 50_00, roundToNearest50Dollars(baseMax * 100));

  const mid = (lowCents + highCents) / 2;
  /** 50% of midpoint of the planning range — secures scheduling and paint / material ordering; balance per contract. */
  const depositRaw = Math.round(mid * 0.5);
  const depositCents = Math.max(50_00, roundToNearest50Dollars(depositRaw));

  breakdown.push(
    `Deposit (${formatUsd(depositCents)}): 50% of the midpoint of your planning range — reserves your schedule and allows us to order paint and materials. Remaining balance per your written agreement with Sueep.`
  );

  return {
    lowCents,
    highCents,
    depositCents,
    breakdown,
    disclaimer: DISCLAIMER,
  };
}

export function formatUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
    cents / 100
  );
}

/** Shared validation for quote + checkout APIs. */
export function parsePaintingQuotePayload(body: unknown): PaintingQuoteInput | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const serviceType = String(o.serviceType || "").trim();
  const roomCount = Number(o.roomCount);
  const sqFtBand = String(o.sqFtBand || "") as SqFtBand;
  const scope = String(o.scope || "") as PaintScope;
  const ceilings = String(o.ceilings || "") as CeilingScope;
  const wallCondition = String(o.wallCondition || "") as WallCondition;
  const occupancy = String(o.occupancy || "") as Occupancy;
  const timeline = String(o.timeline || "") as Timeline;

  const validSq: SqFtBand[] = ["under_1200", "1200_2000", "2000_3500", "over_3500"];
  const validScope: PaintScope[] = ["refresh_same", "color_change"];
  const validCeil: CeilingScope[] = ["no", "some", "all"];
  const validWall: WallCondition[] = ["good", "minor", "significant"];
  const validOcc: Occupancy[] = ["empty", "occupied"];
  const validTime: Timeline[] = ["asap", "2_4_weeks", "flexible"];

  if (!serviceType) return null;
  if (!Number.isFinite(roomCount) || roomCount < 1 || roomCount > 25) return null;
  if (!validSq.includes(sqFtBand)) return null;
  if (!validScope.includes(scope)) return null;
  if (!validCeil.includes(ceilings)) return null;
  if (!validWall.includes(wallCondition)) return null;
  if (!validOcc.includes(occupancy)) return null;
  if (!validTime.includes(timeline)) return null;

  return {
    serviceType,
    roomCount,
    sqFtBand,
    scope,
    ceilings,
    wallCondition,
    occupancy,
    timeline,
  };
}
