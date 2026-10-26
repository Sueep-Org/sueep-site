/**
 * The company's share of payroll taxes on W2 pay (what ADP lists as
 * Employer Liability): Social Security, Medicare, federal unemployment
 * (FUTA) and PA unemployment (SUI). Employee withholding is not here, it
 * already comes out of gross pay.
 *
 * Only people paid through ADP as W2 (Employee.onAdpPayroll, on for every
 * employee but offshore) are taxed. 1099 contractors, offshore pay and
 * non-taxable reimbursements carry none.
 *
 * Three of the taxes stop once a person's W2 pay for the calendar year
 * passes a cap, so each calculation takes what they were already paid
 * earlier that year (counted from ERP payroll, see employerTaxRows.ts). Rates and caps live in AppSetting "employerTaxRates"
 * and are edited on the Payroll page; defaults match ADP's 10/14/2026 run.
 */

export const EMPLOYER_TAX_SETTING_KEY = "employerTaxRates";

export type EmployerTaxRates = {
  /** Percent, e.g. 6.2 */
  socialSecurityPct: number;
  /** Yearly pay cap in cents */
  socialSecurityCapCents: number;
  medicarePct: number;
  futaPct: number;
  futaCapCents: number;
  paSuiPct: number;
  paSuiCapCents: number;
};

export const DEFAULT_EMPLOYER_TAX_RATES: EmployerTaxRates = {
  socialSecurityPct: 6.2,
  socialSecurityCapCents: 18_450_000,
  medicarePct: 1.45,
  futaPct: 0.6,
  futaCapCents: 700_000,
  paSuiPct: 1.419,
  paSuiCapCents: 1_000_000,
};

export type EmployerTax = {
  socialSecurityCents: number;
  medicareCents: number;
  futaCents: number;
  paSuiCents: number;
  totalCents: number;
};

/** The part of this pay that still falls under a yearly cap. */
function underCap(payCents: number, paidBeforeCents: number, capCents: number): number {
  return Math.max(0, Math.min(payCents, capCents - paidBeforeCents));
}

function pctOf(cents: number, pct: number): number {
  return Math.round((cents * pct) / 100);
}

/**
 * Employer tax on one check. payCents is W2 taxable pay on the check
 * (wages, overtime, salary, commission; not reimbursements).
 * paidBeforeCents is the person's W2 pay earlier in the same calendar year.
 */
export function employerTaxOn(payCents: number, paidBeforeCents: number, rates: EmployerTaxRates): EmployerTax {
  const pay = Math.max(0, Math.round(payCents));
  const before = Math.max(0, Math.round(paidBeforeCents));
  const socialSecurityCents = pctOf(underCap(pay, before, rates.socialSecurityCapCents), rates.socialSecurityPct);
  const medicareCents = pctOf(pay, rates.medicarePct);
  const futaCents = pctOf(underCap(pay, before, rates.futaCapCents), rates.futaPct);
  const paSuiCents = pctOf(underCap(pay, before, rates.paSuiCapCents), rates.paSuiPct);
  return {
    socialSecurityCents, medicareCents, futaCents, paSuiCents,
    totalCents: socialSecurityCents + medicareCents + futaCents + paSuiCents,
  };
}

/** Saved rates merged over the defaults, so a missing or bad field falls back. */
export function parseEmployerTaxRates(raw: string | null | undefined): EmployerTaxRates {
  if (!raw) return DEFAULT_EMPLOYER_TAX_RATES;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out = { ...DEFAULT_EMPLOYER_TAX_RATES };
    for (const key of Object.keys(out) as (keyof EmployerTaxRates)[]) {
      const v = Number(parsed[key]);
      if (Number.isFinite(v) && v >= 0) out[key] = v;
    }
    return out;
  } catch {
    return DEFAULT_EMPLOYER_TAX_RATES;
  }
}

/** Checks rates sent from the Payroll page. Percents 0 to 20, caps $0 to $1M. */
export function validateEmployerTaxRates(body: unknown): { rates: EmployerTaxRates } | { error: string } {
  if (!body || typeof body !== "object") return { error: "Invalid rates" };
  const b = body as Record<string, unknown>;
  const out = { ...DEFAULT_EMPLOYER_TAX_RATES };
  for (const key of Object.keys(out) as (keyof EmployerTaxRates)[]) {
    const v = Number(b[key]);
    const isCap = key.endsWith("CapCents");
    if (!Number.isFinite(v) || v < 0 || (isCap ? v > 100_000_000 : v > 20)) {
      return { error: isCap ? "Caps must be $0 to $1,000,000" : "Rates must be 0 to 20%" };
    }
    out[key] = isCap ? Math.round(v) : v;
  }
  return { rates: out };
}
