/**
 * Two different Cleaner/Foreman $/hr concepts for change order labor, kept
 * deliberately separate:
 *
 *  - DEFAULT_CHANGE_ORDER_LABOR_RATES (+ a project's own Project.laborRateCard
 *    override, via getChangeOrderLaborRates) — the BILLING rate. Has margin
 *    built in above wage cost. Drives the CO's price / contract value, and
 *    is what a pricing package (the "Extra prep coat"-style templates)
 *    resolves its $/hr against.
 *  - ACTUAL_CHANGE_ORDER_LABOR_COST_RATES — the real payroll wage, company-
 *    wide, not project-overridable. Drives the CO's Est. Labor $ (what the
 *    work actually costs us), so that figure stays a true cost estimate
 *    instead of quietly matching the marked-up price.
 *
 * Both are distinct from Project.pricingPackage / Building.pricingPackage
 * (REAL_ESTATE and janitorial-turnover per-unit pricing — unrelated
 * concepts, despite the similar name).
 */

/** We don't ask anyone to type an hours estimate for a change order — crews
 * are assumed to work a flat 8-hour day per person, full stop. Used by
 * ChangeOrderLaborEstimator (and its hand-rolled equivalent on the CO detail
 * page) as the fixed `hours` input to computeChangeOrderLaborEstimate. */
export const CHANGE_ORDER_ESTIMATE_DAY_HOURS = 8;

export type ChangeOrderLaborRole = "CLEANER" | "FOREMAN";

export type ChangeOrderLaborRateCard = {
  cleanerHourlyRateCents?: number;
  foremanHourlyRateCents?: number;
};

export type ResolvedChangeOrderLaborRates = Required<ChangeOrderLaborRateCard>;

/** Company-wide fallback BILLING rate for any project without its own
 * Project.laborRateCard override — feeds the CO's price / contract value.
 * Deliberately above ACTUAL_CHANGE_ORDER_LABOR_COST_RATES; the difference
 * is margin. */
export const DEFAULT_CHANGE_ORDER_LABOR_RATES: ResolvedChangeOrderLaborRates = {
  cleanerHourlyRateCents: 2000, // $20.00/hr
  foremanHourlyRateCents: 2884, // $28.84/hr
};

/** What we actually pay per hour, cleaner and supervisor — feeds the CO's
 * Est. Labor $ only. Fixed and company-wide: unlike the billing rate above,
 * this isn't something a project negotiates, so there's no per-project
 * override for it. */
export const ACTUAL_CHANGE_ORDER_LABOR_COST_RATES: ResolvedChangeOrderLaborRates = {
  cleanerHourlyRateCents: 1800, // $18.00/hr
  foremanHourlyRateCents: 2000, // $20.00/hr (supervisor)
};

function readCents(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n);
}

/** Strips an untrusted (e.g. request-body) value down to only the fields
 * this rate card understands, for safe storage in Project.laborRateCard. */
export function sanitizeChangeOrderLaborRateCard(input: unknown): ChangeOrderLaborRateCard {
  if (!input || typeof input !== "object") return {};
  const obj = input as Record<string, unknown>;
  const card: ChangeOrderLaborRateCard = {};
  const cleaner = readCents(obj.cleanerHourlyRateCents);
  const foreman = readCents(obj.foremanHourlyRateCents);
  if (cleaner !== undefined) card.cleanerHourlyRateCents = cleaner;
  if (foreman !== undefined) card.foremanHourlyRateCents = foreman;
  return card;
}

/** Resolves a project's actual Cleaner/Foreman $/hr, filling in the default
 * for any role the project hasn't overridden. */
export function getChangeOrderLaborRates(rateCard: unknown): ResolvedChangeOrderLaborRates {
  const sanitized = sanitizeChangeOrderLaborRateCard(rateCard);
  return {
    cleanerHourlyRateCents: sanitized.cleanerHourlyRateCents ?? DEFAULT_CHANGE_ORDER_LABOR_RATES.cleanerHourlyRateCents,
    foremanHourlyRateCents: sanitized.foremanHourlyRateCents ?? DEFAULT_CHANGE_ORDER_LABOR_RATES.foremanHourlyRateCents,
  };
}

/** A crew always needs a supervisor present — 1 for crews of 10 or fewer
 * cleaners, 2 for anything larger. Returns 0 when no cleaners are requested
 * at all (nothing to supervise). Drives the supervisor count on every change
 * order crew estimate: fixed (not user-enterable) on the public project
 * portal, auto-filled but still editable in the ERP. */
export function deriveChangeOrderSupervisorCount(cleanerCount: number): number {
  const cleaners = Math.max(0, Math.round(cleanerCount || 0));
  if (cleaners <= 0) return 0;
  return cleaners > 10 ? 2 : 1;
}

/** True once someone has explicitly set at least one of this project's
 * Cleaner/Foreman rates (via LaborRateCardEditor) — as opposed to silently
 * running on DEFAULT_CHANGE_ORDER_LABOR_RATES. Used to decide whether the
 * public change-order request form is allowed to show a price at all: a
 * project nobody has priced yet shouldn't surface the internal default rate
 * as if it were a real, reviewed number. */
export function hasCustomChangeOrderLaborRate(rateCard: unknown): boolean {
  const sanitized = sanitizeChangeOrderLaborRateCard(rateCard);
  return sanitized.cleanerHourlyRateCents !== undefined || sanitized.foremanHourlyRateCents !== undefined;
}

export type ChangeOrderLaborEstimateInput = {
  cleanerCount: number;
  supervisorCount: number;
  hours: number;
};

export type ChangeOrderLaborEstimate = {
  cleanerCents: number;
  supervisorCents: number;
  totalCents: number;
};

/** Ad hoc "# cleaners / # supervisors / hours" pricing for a change order —
 * same rate resolution as a package (getChangeOrderLaborRates), but a
 * one-off headcount instead of a reusable named formula. Every person on
 * the crew is assumed to work the same estimated hours (matches the single
 * ProjectChangeOrder.estHours field this feeds — see ChangeOrderDetailEditor
 * and the change order create forms). */
export function computeChangeOrderLaborEstimate(
  input: ChangeOrderLaborEstimateInput,
  rates: ResolvedChangeOrderLaborRates,
): ChangeOrderLaborEstimate {
  const cleanerCount = Math.max(0, input.cleanerCount || 0);
  const supervisorCount = Math.max(0, input.supervisorCount || 0);
  const hours = Math.max(0, input.hours || 0);
  const cleanerCents = Math.round(cleanerCount * hours * rates.cleanerHourlyRateCents);
  const supervisorCents = Math.round(supervisorCount * hours * rates.foremanHourlyRateCents);
  return { cleanerCents, supervisorCents, totalCents: cleanerCents + supervisorCents };
}
