export type MarginTier = { minMarginPercent: number; baseRate: number; acceleratorRate: number };

/**
 * Sales comp plan for one-time project deals. Recurring janitorial
 * contracts use a separate ACV + retention-tail model — see
 * `recurringCommissionRateForMonth` below. Commission rate depends on
 * Sueep's margin % on the deal, and is applied against the deal's contract
 * value — not against margin dollars. Checked highest-first; the first tier
 * whose minMarginPercent the deal's margin meets or exceeds wins. Below 10%
 * margin, no commission at all.
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

/** Revenue that counts toward a rep's cumulative annual threshold but is commissioned on its own separate schedule (e.g. recurring contracts) rather than a margin tier. */
export type ExtraRevenueInput = {
  contractValueCents: number;
  ownerId: string | null;
  date: Date;
};

type RevenueEvent =
  | (CommissionDealInput & { kind: "deal" })
  | (ExtraRevenueInput & { kind: "extra" });

/**
 * Splits each deal's contract value into the portion under vs. over the
 * owning rep's $1.5M annual cumulative-revenue threshold, taxing each
 * portion at that deal's own margin-tier base/accelerator rate. Deals (and
 * any `extraRevenue`, e.g. recurring-contract billing, which counts toward
 * the cumulative total but is commissioned separately and so earns $0 here)
 * are walked chronologically per (owner, calendar year) so a single deal
 * that straddles the threshold is split correctly. A deal below the
 * 10%-margin cutoff earns $0 but its value still counts toward the
 * cumulative total, since the threshold is about revenue closed, not
 * commissionable revenue.
 */
export function computeCommissionCentsByDeal(
  deals: CommissionDealInput[],
  extraRevenue: ExtraRevenueInput[] = []
): Map<string, number> {
  const result = new Map<string, number>();
  const events: RevenueEvent[] = [
    ...deals.map((d) => ({ ...d, kind: "deal" as const })),
    ...extraRevenue.map((r) => ({ ...r, kind: "extra" as const })),
  ];

  const byOwnerYear = new Map<string, RevenueEvent[]>();
  for (const e of events) {
    if (!e.ownerId) continue;
    const key = `${e.ownerId}::${e.date.getUTCFullYear()}`;
    const list = byOwnerYear.get(key) ?? [];
    list.push(e);
    byOwnerYear.set(key, list);
  }

  for (const list of byOwnerYear.values()) {
    list.sort((a, b) => a.date.getTime() - b.date.getTime());
    let cumulativeCents = 0;
    for (const e of list) {
      if (e.kind === "deal") {
        const tier = marginTierFor(e.marginPercent);
        const underThresholdCents = Math.max(
          0,
          Math.min(e.contractValueCents, ANNUAL_ACCELERATOR_THRESHOLD_CENTS - cumulativeCents)
        );
        const overThresholdCents = e.contractValueCents - underThresholdCents;
        const commissionForDeal = Math.round(underThresholdCents * tier.baseRate + overThresholdCents * tier.acceleratorRate);
        result.set(e.id, commissionForDeal);
      }
      cumulativeCents += e.contractValueCents;
    }
  }
  return result;
}

/**
 * Recurring janitorial contract commission (ACV + retention-tail model):
 * 5% of ACV — i.e. 5% of the monthly rate — paid monthly for the contract's
 * first 12 months (Year 1, acquisition), 2% for months 13-24 (Year 2,
 * retention tail), then $0 from month 25 on (Year 3+, fully transitioned to
 * Operations). `monthIndex` is 0-based: 0 is the contract's first billed month.
 */
export function recurringCommissionRateForMonth(monthIndex: number): number {
  if (monthIndex < 12) return 0.05;
  if (monthIndex < 24) return 0.02;
  return 0;
}

/** monthlyRateCents is the specific period's snapshotted rate (a billing project's contractValueCents), not necessarily the contract's current live rate. */
export function computeRecurringCommissionCents(monthlyRateCents: number, monthIndex: number): number {
  return Math.round(monthlyRateCents * recurringCommissionRateForMonth(monthIndex));
}

type CommissionEligibleEmployee = { id: string; email: string | null; firstName: string; lastName: string };
type CommissionProject = {
  commissionEmployeeId: string | null;
  hubspotOwnerEmail: string | null;
  hubspotOwnerName: string | null;
  createdByEmployeeId: string | null;
};

/**
 * Single source of truth for "who gets commission credit on this project" —
 * used by both the project page (to show/edit the assignment) and the
 * employee page (to decide which projects show up on someone's tab).
 * Priority: explicit override > HubSpot owner email match > HubSpot owner
 * name match > whoever manually created the project (set at creation time
 * for projects made directly in the ERP, rather than synced from HubSpot) >
 * blank (only employees with an ERP login are eligible at any step).
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

  const creator =
    project.createdByEmployeeId && eligibleEmployees.find((e) => e.id === project.createdByEmployeeId);
  if (creator) return creator.id;

  return null;
}
