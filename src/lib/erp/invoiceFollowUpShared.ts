/** Follow-ups on unpaid invoices (INVOICE_TRACKING_PLAN.md Phase 4). Safe to import on the client. */
export const FOLLOW_UP_METHODS = ["EMAIL", "PHONE", "PORTAL", "IN_PERSON", "OTHER"] as const;
export type FollowUpMethod = (typeof FOLLOW_UP_METHODS)[number];

export const FOLLOW_UP_METHOD_LABELS: Record<FollowUpMethod, string> = {
  EMAIL: "Email",
  PHONE: "Phone",
  PORTAL: "Portal message",
  IN_PERSON: "In person",
  OTHER: "Other",
};

export function isFollowUpMethod(v: unknown): v is FollowUpMethod {
  return typeof v === "string" && (FOLLOW_UP_METHODS as readonly string[]).includes(v);
}

/** Follow-ups are saved by invoice number, upper case and trimmed. */
export function followUpNumber(n: string | null | undefined): string | null {
  return (n ?? "").trim().toUpperCase() || null;
}

/** The latest follow-up on an invoice and its promise, for the Overdue tab and the Invoices list. */
export type FollowUpSummary = {
  lastDay: string;
  lastMethod: string;
  lastBy: string;
  /** "YYYY-MM-DD" from the latest follow-up that set one */
  promisedDay: string | null;
  /** The promise day has passed and the invoice is still unpaid */
  promiseMissed: boolean;
};
