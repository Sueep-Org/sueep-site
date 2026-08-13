import type { ResolvedChangeOrderLaborRates } from "@/lib/changeOrderLaborRates";

/**
 * Change order pricing packages — reusable labor formulas (e.g. "Extra prep
 * coat" = 3 cleaner-hrs + 1.5 foreman-hrs per unit) maintained as a shared
 * list (see ChangeOrderPricingPackage in schema.prisma) instead of a
 * project-specific estimate. A package never stores a dollar amount itself;
 * computeChangeOrderPackagePrice resolves the price at the moment it's
 * used, against whichever project's labor rates (src/lib/changeOrderLaborRates.ts)
 * are in effect then.
 */

export type ChangeOrderPricingPackageFormula = {
  cleanerHours: number;
  foremanHours: number;
};

export type ChangeOrderPricingPackageInput = {
  name: string;
  unitLabel: string;
  cleanerHours: number;
  foremanHours: number;
  active: boolean;
};

export type ChangeOrderPackagePriceBreakdown = {
  quantity: number;
  cleanerHours: number;
  foremanHours: number;
  cleanerCents: number;
  foremanCents: number;
  totalCents: number;
};

/** Validates/coerces a create-or-update request body into safe values —
 * throws with a user-facing message on the first thing that's wrong, so API
 * routes can just try/catch and return it as the 400 body. */
export function parseChangeOrderPricingPackageInput(body: Record<string, unknown>): ChangeOrderPricingPackageInput {
  const name = String(body.name ?? "").trim();
  if (!name) throw new Error("Package name is required");

  const unitLabel = String(body.unitLabel ?? "unit").trim() || "unit";

  const cleanerHours = Number(body.cleanerHours);
  if (!Number.isFinite(cleanerHours) || cleanerHours < 0) throw new Error("Cleaner hours must be a number ≥ 0");

  const foremanHours = Number(body.foremanHours);
  if (!Number.isFinite(foremanHours) || foremanHours < 0) throw new Error("Foreman hours must be a number ≥ 0");

  if (cleanerHours === 0 && foremanHours === 0) throw new Error("Package needs at least some cleaner or foreman hours");

  const active = body.active === undefined ? true : Boolean(body.active);

  return { name, unitLabel, cleanerHours, foremanHours, active };
}

/** Prices N units of a package against a resolved rate card (see
 * getChangeOrderLaborRates) — the same math a package's "at default rates"
 * preview and a future "apply to this CO" action both call into. */
export function computeChangeOrderPackagePrice(
  formula: ChangeOrderPricingPackageFormula,
  quantity: number,
  rates: ResolvedChangeOrderLaborRates,
): ChangeOrderPackagePriceBreakdown {
  const qty = Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
  const cleanerHours = formula.cleanerHours * qty;
  const foremanHours = formula.foremanHours * qty;
  const cleanerCents = Math.round(cleanerHours * rates.cleanerHourlyRateCents);
  const foremanCents = Math.round(foremanHours * rates.foremanHourlyRateCents);
  return {
    quantity: qty,
    cleanerHours,
    foremanHours,
    cleanerCents,
    foremanCents,
    totalCents: cleanerCents + foremanCents,
  };
}
