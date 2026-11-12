/**
 * Two different Cleaner/Foreman $/hr concepts for change order labor, kept
 * deliberately separate:
 *
 *  - PricingSettings.coPriceRates (+ a project's own Project.laborRateCard
 *    override, via getChangeOrderLaborRates) — the BILLING rate. Has margin
 *    built in above wage cost. Drives the CO's price / contract value, and
 *    is what a pricing package (the "Extra prep coat"-style templates)
 *    resolves its $/hr against.
 *  - PricingSettings.coCostRates, the real payroll wage, company-
 *    wide, not project-overridable. Drives the CO's Est. Labor $ (what the
 *    work actually costs us), so that figure stays a true cost estimate
 *    instead of quietly matching the marked-up price.
 *
 * Both are distinct from Project.pricingPackage / Building.pricingPackage
 * (REAL_ESTATE and janitorial-turnover per-unit pricing — unrelated
 * concepts, despite the similar name).
 */
import { nextDayCountInRange, nextDayUpchargeCents } from "@/lib/nextDayUpcharge";

/** We don't ask anyone to type an hours estimate for a change order — crews
 * are assumed to work a flat day per person (PricingSettings.coDayHours, set
 * on the Settings page). This is the default until someone saves another. */
export const DEFAULT_CO_DAY_HOURS = 8;

/** Work days in a change order's planned range (YYYY-MM-DD), both ends
 * counted. 1 when there's no range yet, so the price is one day's work. */
export function changeOrderDayCount(startKey: string, endKey: string): number {
  if (!startKey || !endKey || endKey < startKey) return 1;
  const ms = new Date(`${endKey}T00:00:00Z`).getTime() - new Date(`${startKey}T00:00:00Z`).getTime();
  return Math.round(ms / 86_400_000) + 1;
}

export type ChangeOrderLaborRole = "CLEANER" | "FOREMAN";

export type ChangeOrderLaborRateCard = {
  cleanerHourlyRateCents?: number;
  foremanHourlyRateCents?: number;
};

export type ResolvedChangeOrderLaborRates = Required<ChangeOrderLaborRateCard>;

/** Starting company-wide BILLING rate (PricingSettings.coPriceRates, set on
 * the Settings page) for any project without its own Project.laborRateCard
 * override — feeds the CO's price / contract value. Deliberately above the
 * cost rate below; the difference is margin. */
export const DEFAULT_CO_PRICE_RATES: ResolvedChangeOrderLaborRates = {
  cleanerHourlyRateCents: 2000, // $20.00/hr
  foremanHourlyRateCents: 2884, // $28.84/hr
};

/** Starting wage we actually pay per hour (PricingSettings.coCostRates, set
 * on the Settings page) — feeds the CO's Est. Labor $ only. Company-wide:
 * unlike the billing rate above, this isn't something a project negotiates,
 * so there's no per-project override for it. */
export const DEFAULT_CO_COST_RATES: ResolvedChangeOrderLaborRates = {
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

/** Resolves a project's actual Cleaner/Foreman $/hr, filling in the company
 * rate (PricingSettings.coPriceRates) for any role the project hasn't overridden. */
export function getChangeOrderLaborRates(rateCard: unknown, companyRates: ResolvedChangeOrderLaborRates): ResolvedChangeOrderLaborRates {
  const sanitized = sanitizeChangeOrderLaborRateCard(rateCard);
  return {
    cleanerHourlyRateCents: sanitized.cleanerHourlyRateCents ?? companyRates.cleanerHourlyRateCents,
    foremanHourlyRateCents: sanitized.foremanHourlyRateCents ?? companyRates.foremanHourlyRateCents,
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
 * running on the company rate. Used to decide whether the
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

/**
 * Price of a change order a client requests online over a start-end range
 * (YYYY-MM-DD; no end means one day). Every day costs one day of labor, and
 * only the days that fall today or tomorrow (Eastern) get the next day
 * upcharge: tomorrow through Saturday upcharges tomorrow only. Same math as
 * the ERP's own change order form (ChangeOrderLaborEstimator).
 */
export function clientChangeOrderPrice(
  counts: { cleanerCount: number; supervisorCount: number },
  rates: ResolvedChangeOrderLaborRates,
  range: { startKey: string | null | undefined; endKey: string | null | undefined; coDayHours: number; nextDayPct: number },
  now: Date = new Date(),
): { days: number; upchargeDays: number; subtotalCents: number; upchargeCents: number; totalCents: number } {
  const start = range.startKey?.slice(0, 10) ?? "";
  const days = changeOrderDayCount(start, range.endKey?.slice(0, 10) || start);
  const subtotalCents = computeChangeOrderLaborEstimate({ ...counts, hours: range.coDayHours * days }, rates).totalCents;
  const upchargeDays = Math.min(days, nextDayCountInRange(start, range.endKey, now));
  const upchargeCents = upchargeDays > 0 ? Math.round((nextDayUpchargeCents(subtotalCents, range.nextDayPct) * upchargeDays) / days) : 0;
  return { days, upchargeDays, subtotalCents, upchargeCents, totalCents: subtotalCents + upchargeCents };
}
