/**
 * The one set of billing status words, used by projects, change orders, SOV
 * items, turnover requests and janitorial contract months alike:
 * NOT_BILLED -> BILLED -> PAID.
 *
 * Projects and change orders used to be saved with other spellings
 * (BILLING, INVOICE_PAID, INACTIVE, or empty). Until the one-time data
 * update (prisma/data-migrations/unify-billing-status.sql) has run, old
 * rows can still hold those, so every read goes through
 * normalizeBillingStatus and every database filter uses the *_VALUES lists
 * below, which include both spellings. Everything written uses only the
 * three standard words.
 */

export const BILLING_STATUSES = ["NOT_BILLED", "BILLED", "PAID"] as const;
export type BillingStatus = (typeof BILLING_STATUSES)[number];

export const BILLING_STATUS_OPTIONS: { value: BillingStatus; label: string }[] = [
  { value: "NOT_BILLED", label: "Not billed" },
  { value: "BILLED", label: "Billed" },
  { value: "PAID", label: "Paid" },
];

/** Every spelling that means billed-but-not-paid, for database filters. */
export const BILLED_VALUES = ["BILLED", "BILLING"];
/** Every spelling that means paid, for database filters. */
export const PAID_VALUES = ["PAID", "INVOICE_PAID"];

/** Any old or new spelling (or empty) as one of the three standard statuses. */
export function normalizeBillingStatus(raw: string | null | undefined): BillingStatus {
  const v = (raw ?? "").trim().toUpperCase();
  if (PAID_VALUES.includes(v)) return "PAID";
  if (BILLED_VALUES.includes(v) || v === "INVOICED") return "BILLED";
  return "NOT_BILLED";
}

/** For API input: the standard status, or null when the value isn't one we recognize. */
export function parseBillingStatus(raw: unknown): BillingStatus | null {
  const v = String(raw ?? "").trim().toUpperCase();
  if (v === "" || v === "NOT_BILLED" || v === "INACTIVE") return "NOT_BILLED";
  if (PAID_VALUES.includes(v)) return "PAID";
  if (BILLED_VALUES.includes(v)) return "BILLED";
  return null;
}

export function isPaidStatus(raw: string | null | undefined): boolean {
  return normalizeBillingStatus(raw) === "PAID";
}

export function isBilledStatus(raw: string | null | undefined): boolean {
  return normalizeBillingStatus(raw) === "BILLED";
}

export function billingStatusLabel(raw: string | null | undefined): string {
  const s = normalizeBillingStatus(raw);
  return BILLING_STATUS_OPTIONS.find((o) => o.value === s)!.label;
}
