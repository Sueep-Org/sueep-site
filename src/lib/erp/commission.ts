import { utcDateKey } from "./dates";
import { valueOn } from "./datedSettings";
import { marginTierOn, recurringRateOn, type PayrollRules } from "./payrollRules";

/**
 * Sales comp plan for one-time project deals. Recurring janitorial
 * contracts use a separate ACV + retention-tail model, see
 * `computeRecurringCommissionCents` below. Commission rate depends on
 * Sueep's margin % on the deal, and is applied against the deal's contract
 * value, not against margin dollars. The tiers, the yearly accelerator
 * threshold and the recurring rates are set on the Settings page
 * (Commission tab) with start dates: each deal uses the rules in effect on
 * the day it finished, each recurring month the rules on its start.
 */

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
 * owning rep's annual cumulative-revenue threshold (Settings), taxing each
 * portion at that deal's own margin-tier base/accelerator rate. Deals (and
 * any `extraRevenue`, e.g. recurring-contract billing, which counts toward
 * the cumulative total but is commissioned separately and so earns $0 here)
 * are walked chronologically per (owner, calendar year) so a single deal
 * that straddles the threshold is split correctly. A deal below the
 * lowest tier earns $0 but its value still counts toward the
 * cumulative total, since the threshold is about revenue closed, not
 * commissionable revenue.
 */
export function computeCommissionCentsByDeal(
  deals: CommissionDealInput[],
  extraRevenue: ExtraRevenueInput[],
  rules: PayrollRules,
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
        const day = utcDateKey(e.date);
        const tier = marginTierOn(rules, day, e.marginPercent);
        const underThresholdCents = Math.max(
          0,
          Math.min(e.contractValueCents, valueOn(rules.acceleratorCents, day) - cumulativeCents)
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
 * Recurring janitorial contract commission (ACV + retention-tail model): a
 * percent of each paid month's amount, one rate for the contract's first 12
 * months (Year 1, acquisition), another for months 13-24 (Year 2, retention
 * tail), then $0 from month 25 on. `monthIndex` is 0-based: 0 is the
 * contract's first billed month. monthlyRateCents is the period's snapshotted
 * rate, not necessarily the contract's current live rate.
 */
export function computeRecurringCommissionCents(monthlyRateCents: number, monthIndex: number, periodStartKey: string, rules: PayrollRules): number {
  return Math.round(monthlyRateCents * recurringRateOn(rules, periodStartKey, monthIndex));
}

type CommissionEligibleEmployee = { id: string; email: string | null; firstName: string; lastName: string };
type CommissionProject = {
  commissionEmployeeId: string | null;
  hubspotOwnerEmail: string | null;
  hubspotOwnerName: string | null;
  createdByEmployeeId: string | null;
};

/**
 * Matches a HubSpot deal owner (by email, then by display name) to an ERP
 * employee — the core lookup shared by resolveCommissionEmployeeId (projects)
 * and the building-level "suggest commission owner from HubSpot deal owner"
 * feature. Email takes priority since names can collide or be formatted
 * differently; falls back to name match when email isn't available/found.
 */
export function matchEmployeeByHubspotOwner(
  ownerEmail: string | null | undefined,
  ownerName: string | null | undefined,
  eligibleEmployees: CommissionEligibleEmployee[]
): CommissionEligibleEmployee | null {
  const byEmail = ownerEmail && eligibleEmployees.find((e) => e.email?.toLowerCase() === ownerEmail.toLowerCase());
  if (byEmail) return byEmail;

  const byName =
    ownerName &&
    eligibleEmployees.find((e) => `${e.firstName} ${e.lastName}`.trim().toLowerCase() === ownerName.toLowerCase());
  if (byName) return byName;

  return null;
}

/**
 * Single source of truth for "who gets commission credit on this project" —
 * used by both the project page (to show/edit the assignment) and the
 * employee page (to decide which projects show up on someone's tab).
 * Priority: explicit override > HubSpot owner email match > HubSpot owner
 * name match > whoever manually created the project (set at creation time
 * for projects made directly in the ERP, rather than synced from HubSpot) >
 * blank. Only commission-eligible employees count at any step: an override
 * naming someone else means nobody earns it, rather than falling through.
 */
export function resolveCommissionEmployeeId(
  project: CommissionProject,
  eligibleEmployees: CommissionEligibleEmployee[]
): string | null {
  if (project.commissionEmployeeId) {
    return eligibleEmployees.some((e) => e.id === project.commissionEmployeeId) ? project.commissionEmployeeId : null;
  }

  const byOwner = matchEmployeeByHubspotOwner(project.hubspotOwnerEmail, project.hubspotOwnerName, eligibleEmployees);
  if (byOwner) return byOwner.id;

  const creator =
    project.createdByEmployeeId && eligibleEmployees.find((e) => e.id === project.createdByEmployeeId);
  if (creator) return creator.id;

  return null;
}
