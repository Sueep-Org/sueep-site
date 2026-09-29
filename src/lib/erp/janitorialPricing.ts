/**
 * Janitorial contract pricing calculator, based on the Excel proposal
 * templates (Proposal Template / Domus Proposal Breakdown). Pure, so the
 * form, the API, and tests share one set of math.
 *
 * Per role line: people x hours/week x rate, turned monthly as
 * weekly x 52 / 12. Payroll adds a W2 + health burden (default 19%).
 * Optional overtime (premium half of pay rate) and holiday costs. Sales tax
 * is a % of the monthly price. Any line's price, or the total, can be
 * overridden by hand.
 */

export const WEEKS_PER_MONTH = 52 / 12;
export const DEFAULT_BURDEN_PCT = 19;
export const DEFAULT_SALES_TAX_PCT = 6;
export const ROLE_SUGGESTIONS = ["Janitorial", "Cleaner", "Porter", "Foreman", "Supervisor", "Concierge", "Patrol"];

export type PricingLine = {
  id: string;
  role: string;
  people: number;
  hoursPerWeek: number;
  /** What we charge the client, $/hour. */
  billRate: number;
  /** What we pay the worker, $/hour. */
  payRate: number;
  /** Hand-set monthly price for this line, in cents (null = calculated). */
  monthlyOverrideCents: number | null;
};

export type ContractPricing = {
  lines: PricingLine[];
  burdenPct: number;
  salesTaxPct: number;
  /** Extra overtime hours each week, paid at half the pay rate on top of regular pay. */
  overtime: { people: number; hoursPerWeek: number; payRate: number } | null;
  /** Paid holidays per year. */
  holidays: { days: number; hoursPerDay: number; people: number; payRate: number } | null;
  /** Hand-set total monthly price, in cents (null = sum of lines). */
  totalOverrideCents: number | null;
};

export type LineResult = { id: string; calculatedCents: number; priceCents: number; payrollCents: number };

export type PricingResult = {
  lines: LineResult[];
  /** Sum of line prices (with any line overrides). */
  calculatedMonthlyCents: number;
  /** What the client is billed each month: total override, or calculated. */
  monthlyPriceCents: number;
  payrollCents: number;
  overtimeCents: number;
  holidaysCents: number;
  salesTaxCents: number;
  /** Monthly price minus tax, payroll, overtime, and holidays. */
  profitCents: number;
  /** Profit as a share of the monthly price (0.25 = 25%), null when price is 0. */
  marginPct: number | null;
  weeklyHours: number;
};

export function emptyPricing(): ContractPricing {
  return {
    lines: [newLine("Janitorial")],
    burdenPct: DEFAULT_BURDEN_PCT,
    salesTaxPct: DEFAULT_SALES_TAX_PCT,
    overtime: null,
    holidays: null,
    totalOverrideCents: null,
  };
}

export function newLine(role = ""): PricingLine {
  return {
    id: Math.random().toString(36).slice(2, 10),
    role,
    people: 1,
    hoursPerWeek: 40,
    billRate: 0,
    payRate: 0,
    monthlyOverrideCents: null,
  };
}

const cents = (dollars: number) => Math.round(dollars * 100);

export function calculatePricing(p: ContractPricing): PricingResult {
  const burden = 1 + (p.burdenPct || 0) / 100;
  const lines = p.lines.map((l) => {
    const calculatedCents = cents(l.people * l.hoursPerWeek * l.billRate * WEEKS_PER_MONTH);
    return {
      id: l.id,
      calculatedCents,
      priceCents: l.monthlyOverrideCents ?? calculatedCents,
      payrollCents: cents(l.people * l.hoursPerWeek * l.payRate * burden * WEEKS_PER_MONTH),
    };
  });
  const calculatedMonthlyCents = lines.reduce((s, l) => s + l.priceCents, 0);
  const monthlyPriceCents = p.totalOverrideCents ?? calculatedMonthlyCents;
  const payrollCents = lines.reduce((s, l) => s + l.payrollCents, 0);
  const overtimeCents = p.overtime
    ? cents(p.overtime.people * p.overtime.hoursPerWeek * p.overtime.payRate * 0.5 * burden * WEEKS_PER_MONTH)
    : 0;
  const holidaysCents = p.holidays
    ? cents((p.holidays.days * p.holidays.hoursPerDay * p.holidays.people * p.holidays.payRate * burden) / 12)
    : 0;
  const salesTaxCents = cents((monthlyPriceCents / 100) * ((p.salesTaxPct || 0) / 100));
  const profitCents = monthlyPriceCents - salesTaxCents - payrollCents - overtimeCents - holidaysCents;
  return {
    lines,
    calculatedMonthlyCents,
    monthlyPriceCents,
    payrollCents,
    overtimeCents,
    holidaysCents,
    salesTaxCents,
    profitCents,
    marginPct: monthlyPriceCents > 0 ? profitCents / monthlyPriceCents : null,
    weeklyHours: p.lines.reduce((s, l) => s + l.people * l.hoursPerWeek, 0),
  };
}

// ---------------------------------------------------------------------------
// Validation (API side): never trust the client's numbers or totals.
// ---------------------------------------------------------------------------

function num(v: unknown, min: number, max: number): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

function optCents(v: unknown): number | null | undefined {
  if (v === null || v === undefined || v === "") return null;
  const n = num(v, 0, 100_000_000_00);
  return n === null ? undefined : Math.round(n);
}

/** Checks a pricing object from a request. Returns an error message or the cleaned pricing. */
export function parsePricing(raw: unknown): { pricing: ContractPricing } | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "Pricing is required" };
  const r = raw as Record<string, unknown>;
  const rawLines = Array.isArray(r.lines) ? r.lines : [];
  if (rawLines.length > 30) return { error: "Too many pricing lines" };

  const lines: PricingLine[] = [];
  for (const [i, item] of rawLines.entries()) {
    const l = (item ?? {}) as Record<string, unknown>;
    const role = String(l.role ?? "").trim().slice(0, 60);
    const people = num(l.people, 0, 500);
    const hoursPerWeek = num(l.hoursPerWeek, 0, 168);
    const billRate = num(l.billRate, 0, 10_000);
    const payRate = num(l.payRate, 0, 10_000);
    const monthlyOverrideCents = optCents(l.monthlyOverrideCents);
    if (!role) return { error: `Line ${i + 1}: add a role` };
    if (people === null || hoursPerWeek === null || billRate === null || payRate === null || monthlyOverrideCents === undefined) {
      return { error: `${role}: check people, hours, and rates` };
    }
    lines.push({ id: String(l.id ?? i).slice(0, 20), role, people, hoursPerWeek, billRate, payRate, monthlyOverrideCents });
  }

  const burdenPct = num(r.burdenPct, 0, 100);
  const salesTaxPct = num(r.salesTaxPct, 0, 25);
  const totalOverrideCents = optCents(r.totalOverrideCents);
  if (burdenPct === null) return { error: "Payroll add-on must be 0 to 100%" };
  if (salesTaxPct === null) return { error: "Sales tax must be 0 to 25%" };
  if (totalOverrideCents === undefined) return { error: "Check the monthly price override" };

  let overtime: ContractPricing["overtime"] = null;
  if (r.overtime) {
    const o = r.overtime as Record<string, unknown>;
    const people = num(o.people, 0, 500);
    const hoursPerWeek = num(o.hoursPerWeek, 0, 100);
    const payRate = num(o.payRate, 0, 10_000);
    if (people === null || hoursPerWeek === null || payRate === null) return { error: "Check the overtime numbers" };
    overtime = { people, hoursPerWeek, payRate };
  }

  let holidays: ContractPricing["holidays"] = null;
  if (r.holidays) {
    const h = r.holidays as Record<string, unknown>;
    const days = num(h.days, 0, 60);
    const hoursPerDay = num(h.hoursPerDay, 0, 24);
    const people = num(h.people, 0, 500);
    const payRate = num(h.payRate, 0, 10_000);
    if (days === null || hoursPerDay === null || people === null || payRate === null) return { error: "Check the holiday numbers" };
    holidays = { days, hoursPerDay, people, payRate };
  }

  const pricing: ContractPricing = { lines, burdenPct, salesTaxPct, overtime, holidays, totalOverrideCents };
  if (calculatePricing(pricing).monthlyPriceCents <= 0) {
    return { error: "The monthly price is $0. Add a line with a bill rate or set the monthly price by hand." };
  }
  return { pricing };
}
