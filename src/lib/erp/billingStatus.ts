/**
 * The one set of billing status words, used by projects, change orders, SOV
 * items, turnover requests and janitorial contract months alike:
 * NOT_BILLED -> BILLED -> PAID, or VOIDED (won't be billed or paid, with a
 * voidReason saying why). Voided work leaves Not billed and every to-bill
 * list, and counts as $0 revenue on the Finance tab.
 *
 * Projects and change orders used to be saved with other spellings
 * (BILLING, INVOICE_PAID, INACTIVE, or empty). Until the one-time data
 * update (prisma/data-migrations/unify-billing-status.sql) has run, old
 * rows can still hold those, so every read goes through
 * normalizeBillingStatus and every database filter uses the *_VALUES lists
 * below, which include both spellings. Everything written uses only the
 * standard words.
 */

export const BILLING_STATUSES = ["NOT_BILLED", "BILLED", "PAID", "VOIDED"] as const;
export type BillingStatus = (typeof BILLING_STATUSES)[number];

export const BILLING_STATUS_OPTIONS: { value: BillingStatus; label: string }[] = [
  { value: "NOT_BILLED", label: "Not billed" },
  { value: "BILLED", label: "Billed" },
  { value: "PAID", label: "Paid" },
  { value: "VOIDED", label: "Voided" },
];

/** Every spelling that means billed-but-not-paid, for database filters. */
export const BILLED_VALUES = ["BILLED", "BILLING"];
/** Every spelling that means paid, for database filters. */
export const PAID_VALUES = ["PAID", "INVOICE_PAID"];

/** Any old or new spelling (or empty) as one of the standard statuses. */
export function normalizeBillingStatus(raw: string | null | undefined): BillingStatus {
  const v = (raw ?? "").trim().toUpperCase();
  if (v === "VOIDED") return "VOIDED";
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
  if (v === "VOIDED") return "VOIDED";
  return null;
}

export function isVoidedStatus(raw: string | null | undefined): boolean {
  return normalizeBillingStatus(raw) === "VOIDED";
}

/** Still owed to us: not paid yet and not voided. */
export function isOwedStatus(raw: string | null | undefined): boolean {
  const s = normalizeBillingStatus(raw);
  return s === "NOT_BILLED" || s === "BILLED";
}

/**
 * The voidReason to save with a billing status change: the trimmed reason
 * when it becomes VOIDED (an error when there's none), null when it moves to
 * anything else. Pass the body's voidReason as sent.
 */
export function voidReasonFor(status: BillingStatus, raw: unknown): { voidReason: string | null } | { error: string } {
  if (status !== "VOIDED") return { voidReason: null };
  const reason = typeof raw === "string" ? raw.trim().slice(0, 500) : "";
  return reason ? { voidReason: reason } : { error: "Add a reason to void it." };
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

/** Segments the Billing page's Janitorial tab lists (unless the project came from the post-construction pipeline). */
export const JANITORIAL_BILLING_SEGMENTS = ["JANITORIAL_TURNOVER_REQUESTS", "COMMERCIAL_CLEANING"];

/** The Billing page on one tab, searched for one project or building. */
export function billingPageHref(tab: "post-construction" | "janitorial" | "recurring", q: string): string {
  return `/erp/billing?tab=${tab}&q=${encodeURIComponent(q)}`;
}

/**
 * Where this project's billing status is changed: the Billing page, filtered
 * to it, when the Billing page lists it. Null for projects the Billing page
 * doesn't list, which keep their own status control.
 */
export function projectBillingHref(p: { jobTitle: string; segment: string; isPostConstruction: boolean; hasSovItems: boolean }): string | null {
  if (p.isPostConstruction) return p.hasSovItems ? billingPageHref("post-construction", p.jobTitle) : null;
  if (JANITORIAL_BILLING_SEGMENTS.includes(p.segment)) return billingPageHref("janitorial", p.jobTitle);
  return null;
}
