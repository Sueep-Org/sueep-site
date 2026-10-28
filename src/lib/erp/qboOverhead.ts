/**
 * Which QuickBooks P&L accounts become "Other overhead" on the Finance
 * dashboard, and which are skipped because the ERP already counts them
 * (QUICKBOOKS_PLAN.md Phase 2). Plain data, so the Finance tab can show the
 * labels too.
 *
 * Accounts are matched by name, the account's own and its group's (so
 * "Payroll Tax: Fica" is skipped with payroll). Anything not matched lands in
 * Other, so no cost is ever dropped by accident.
 */

export const QBO_GROUPS = [
  "RENT",
  "VEHICLES",
  "OFFICE",
  "SUPPLIES",
  "MARKETING",
  "RECRUITING",
  "PROFESSIONAL",
  "TAXES",
  "BANK",
  "OTHER",
] as const;
export type QboGroup = (typeof QBO_GROUPS)[number];

export const QBO_GROUP_LABELS: Record<QboGroup, { label: string; hint: string }> = {
  RENT: { label: "Rent", hint: "Office and warehouse rent and leases" },
  VEHICLES: { label: "Vehicles and travel", hint: "Car and truck, fuel, parking, tolls, rides and business travel" },
  OFFICE: { label: "Office and software", hint: "Software subscriptions, office supplies, utilities, phones, postage and repairs" },
  SUPPLIES: { label: "Supplies not on jobs", hint: "QuickBooks job supplies, minus the materials already logged on ERP jobs that month" },
  MARKETING: { label: "Marketing", hint: "Ads and marketing" },
  RECRUITING: { label: "Recruiting", hint: "QuickBooks HR recruiting, minus the job ads already counted under Hiring ads that month" },
  PROFESSIONAL: { label: "Professional fees", hint: "Legal, accounting and other professional services, certifications" },
  TAXES: { label: "Taxes and licenses", hint: "Business taxes, licenses and permits (not payroll taxes)" },
  BANK: { label: "Bank fees and interest", hint: "Bank and card fees, PayPal fees, loan and card interest" },
  OTHER: { label: "Other", hint: "Meals, donations and anything else in QuickBooks not listed above" },
};

/** P&L sections that are costs. Income is never overhead. */
export const QBO_COST_SECTIONS = ["COGS", "EXPENSE", "OTHER_EXPENSE"] as const;

/** First match wins, so payroll and insurance are skipped before "tax" or "auto" could catch them. */
const RULES: [RegExp, QboGroup | "SKIP"][] = [
  // The ERP counts these itself: payroll and its taxes, offshore, health, insurance, subs.
  [/payroll|wage|salary|officer|\bfica\b|\bfuta\b|\bsuta\b|offshore/i, "SKIP"],
  [/insurance|health benefit/i, "SKIP"],
  [/contractor|subcontract/i, "SKIP"],
  [/recruit|background check|hiring/i, "RECRUITING"],
  [/rent|lease/i, "RENT"],
  [/car &|car and|truck|auto|vehicle|fuel|\bgas\b|transport|parking|toll|travel|uber|lyft/i, "VEHICLES"],
  [/software|office|postage|shipping|utilit|phone|internet|repair|maintenance/i, "OFFICE"],
  [/supplies|material|cost of goods/i, "SUPPLIES"],
  [/advertis|marketing/i, "MARKETING"],
  [/legal|professional|accounting|bookkeep|certification/i, "PROFESSIONAL"],
  [/tax|licen|permit/i, "TAXES"],
  [/bank|fee|interest|paypal/i, "BANK"],
];

/** The dashboard group for a QuickBooks cost account, or SKIP when the ERP already counts it. */
export function qboGroupFor(account: string, parent: string): QboGroup | "SKIP" {
  for (const name of [parent, account]) {
    if (!name) continue;
    for (const [re, group] of RULES) if (re.test(name)) return group;
  }
  return "OTHER";
}

/** AppSetting holding the last month QuickBooks is finished for ("YYYY-MM"), set on the QuickBooks page (qboClose.ts). */
export const QBO_BOOKED_THROUGH_KEY = "qboBookedThrough";

export type QboGroupCents = Record<QboGroup, number>;

export function emptyQboGroups(): QboGroupCents {
  return Object.fromEntries(QBO_GROUPS.map((g) => [g, 0])) as QboGroupCents;
}
