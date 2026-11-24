/**
 * Plain data for the invoice cleanup page (/erp/invoices/cleanup), safe to
 * import in the browser.
 */

export const DISMISS_REASONS = ["ALREADY_PAID", "NOT_IN_ERP", "OTHER"] as const;
export type DismissReason = (typeof DISMISS_REASONS)[number];

export const DISMISS_REASON_LABELS: Record<DismissReason, { label: string; hint: string }> = {
  ALREADY_PAID: { label: "Already paid in the ERP", hint: "The work was marked Paid by hand, so nothing needs linking" },
  NOT_IN_ERP: { label: "Work isn't in the ERP", hint: "The job, unit or month was never entered in the ERP" },
  OTHER: { label: "Other", hint: "Write why in the note" },
};

export function isDismissReason(v: unknown): v is DismissReason {
  return typeof v === "string" && (DISMISS_REASONS as readonly string[]).includes(v);
}

/** What the ERP holds for the job an unlinked invoice's HubSpot deal points at. */
export type CleanupWorkState = "ALL_PAID" | "HAS_UNPAID" | "NO_JOB";

export type CleanupInvoice = {
  hubspotInvoiceId: string;
  number: string | null;
  status: string | null;
  invoiceDateKey: string | null;
  amountCents: number;
  /** The invoice's line descriptions, as the sync saw them */
  lines: { text: string; cents: number }[];
  title: string;
  href: string;
  linkTarget: { scope: "project" | "building"; id: string; title: string } | null;
  workState: CleanupWorkState;
  /** Unpaid work on that job, a few names */
  unpaid: string[];
  unpaidCount: number;
};

export type DismissedInvoice = {
  hubspotInvoiceId: string;
  number: string | null;
  invoiceDateKey: string | null;
  amountCents: number;
  title: string;
  href: string;
  reason: DismissReason;
  note: string | null;
  byName: string | null;
  atKey: string | null;
};

export type OldUnpaidKind = "SOV" | "CO" | "TURN" | "MONTH" | "PROJECT";

export const OLD_UNPAID_KIND_LABELS: Record<OldUnpaidKind, string> = {
  SOV: "SOV line",
  CO: "Change order",
  TURN: "Unit turn",
  MONTH: "Janitorial month",
  PROJECT: "Project",
};

export type OldUnpaidRow = {
  /** "sov:<id>", "co:<id>", "turn:<id>", "month:<id>" or "project:<id>", what the paid / void actions take */
  key: string;
  kind: OldUnpaidKind;
  /** The job (project or building) the line belongs to, for grouping */
  groupKey: string;
  groupHref: string;
  title: string;
  /** The line, unit or month within the job */
  detail: string;
  status: "NOT_BILLED" | "BILLED";
  /** When the work was finished (or the month), YYYY-MM-DD */
  doneKey: string;
  cents: number | null;
  billingHref: string;
  /** A paid invoice on this job's HubSpot deal is waiting on the Paid, not linked tab */
  waitingInvoice: boolean;
};

export type InvoiceCleanup = {
  unlinked: CleanupInvoice[];
  dismissed: DismissedInvoice[];
  oldUnpaid: OldUnpaidRow[];
  /** Open HubSpot invoices in the ERP that QuickBooks doesn't have */
  notInQuickBooks: number;
  quickBooksSynced: boolean;
};

/** Work finished this many days ago with no invoice shows on the Old unpaid work tab. */
export const OLD_UNPAID_DAYS = 45;
