export type MarginTier = { minMarginPercent: number; baseRate: number; acceleratorRate: number };

/**
 * Sales comp plan (one-time project deals only — janitorial/recurring
 * contracts use a separate ACV + retention-tail model, not implemented
 * here). Commission rate depends on Sueep's margin % on the deal, and is
 * applied against the deal's contract value — not against margin dollars.
 * Checked highest-first; the first tier whose minMarginPercent the deal's
 * margin meets or exceeds wins. Below 10% margin, no commission at all.
 */
export const MARGIN_TIERS: MarginTier[] = [
  { minMarginPercent: 30, baseRate: 0.05, acceleratorRate: 0.1 },
  { minMarginPercent: 20, baseRate: 0.03, acceleratorRate: 0.07 },
  { minMarginPercent: 10, baseRate: 0.01, acceleratorRate: 0.03 },
  { minMarginPercent: -Infinity, baseRate: 0, acceleratorRate: 0 },
];

export function marginTierFor(marginPercent: number): MarginTier {
  return MARGIN_TIERS.find((t) => marginPercent >= t.minMarginPercent)!;
}

/** Once a rep's cumulative revenue closed in a calendar year passes this, the accelerator rate applies to the excess. */
export const ANNUAL_ACCELERATOR_THRESHOLD_CENTS = 1_500_000_00;

export type CommissionDealInput = {
  id: string;
  contractValueCents: number;
  marginPercent: number;
  ownerId: string | null;
  /** Only used to bucket a deal into a calendar year and to order deals within it. */
  date: Date;
};

/**
 * Splits each deal's contract value into the portion under vs. over the
 * owning rep's $1.5M annual cumulative-revenue threshold, taxing each
 * portion at that deal's own margin-tier base/accelerator rate. Deals are
 * walked chronologically per (owner, calendar year) so a single deal that
 * straddles the threshold is split correctly. A deal below the 10%-margin
 * cutoff earns $0 but its value still counts toward the cumulative total,
 * since the threshold is about revenue closed, not commissionable revenue.
 */
export function computeCommissionCentsByDeal(deals: CommissionDealInput[]): Map<string, number> {
  const result = new Map<string, number>();
  const byOwnerYear = new Map<string, CommissionDealInput[]>();
  for (const d of deals) {
    if (!d.ownerId) continue;
    const key = `${d.ownerId}::${d.date.getUTCFullYear()}`;
    const list = byOwnerYear.get(key) ?? [];
    list.push(d);
    byOwnerYear.set(key, list);
  }

  for (const list of byOwnerYear.values()) {
    list.sort((a, b) => a.date.getTime() - b.date.getTime());
    let cumulativeCents = 0;
    for (const d of list) {
      const tier = marginTierFor(d.marginPercent);
      const underThresholdCents = Math.max(
        0,
        Math.min(d.contractValueCents, ANNUAL_ACCELERATOR_THRESHOLD_CENTS - cumulativeCents)
      );
      const overThresholdCents = d.contractValueCents - underThresholdCents;
      const commissionForDeal = Math.round(underThresholdCents * tier.baseRate + overThresholdCents * tier.acceleratorRate);
      result.set(d.id, commissionForDeal);
      cumulativeCents += d.contractValueCents;
    }
  }
  return result;
}

/** Deals with no resolvable HubSpot owner default here rather than going uncredited. */
export const DEFAULT_COMMISSION_OWNER_EMAIL = "nick@sueep.com";

type CommissionEligibleEmployee = { id: string; email: string | null; firstName: string; lastName: string };
type CommissionProject = {
  commissionEmployeeId: string | null;
  hubspotOwnerEmail: string | null;
  hubspotOwnerName: string | null;
};

/**
 * Single source of truth for "who gets commission credit on this project" —
 * used by both the project page (to show/edit the assignment) and the
 * employee page (to decide which projects show up on someone's tab).
 * Priority: explicit override > HubSpot owner email match > HubSpot owner
 * name match > the default owner (only employees with an ERP login are
 * eligible at any step).
 */
export function resolveCommissionEmployeeId(
  project: CommissionProject,
  eligibleEmployees: CommissionEligibleEmployee[]
): string | null {
  if (project.commissionEmployeeId) return project.commissionEmployeeId;

  const byEmail =
    project.hubspotOwnerEmail &&
    eligibleEmployees.find((e) => e.email?.toLowerCase() === project.hubspotOwnerEmail!.toLowerCase());
  if (byEmail) return byEmail.id;

  const byName =
    project.hubspotOwnerName &&
    eligibleEmployees.find(
      (e) => `${e.firstName} ${e.lastName}`.trim().toLowerCase() === project.hubspotOwnerName!.toLowerCase()
    );
  if (byName) return byName.id;

  const defaultOwner = eligibleEmployees.find((e) => e.email?.toLowerCase() === DEFAULT_COMMISSION_OWNER_EMAIL);
  return defaultOwner?.id ?? null;
}
