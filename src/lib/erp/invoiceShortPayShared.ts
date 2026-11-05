/** Why a client paid less than the invoice (INVOICE_TRACKING_PLAN.md Phase 6). Safe to import on the client. */
export const SHORT_PAY_REASONS = ["RETAINAGE", "DISPUTED", "BACK_CHARGE", "OTHER"] as const;
export type ShortPayReason = (typeof SHORT_PAY_REASONS)[number];

export const SHORT_PAY_LABELS: Record<ShortPayReason, string> = {
  RETAINAGE: "Retainage held",
  DISPUTED: "Disputed line",
  BACK_CHARGE: "Back charge",
  OTHER: "Other",
};

export function isShortPayReason(v: unknown): v is ShortPayReason {
  return typeof v === "string" && (SHORT_PAY_REASONS as readonly string[]).includes(v);
}

/** The saved reason on a short-paid invoice. */
export type ShortPayInfo = {
  reason: ShortPayReason;
  label: string;
  /** Null means the whole balance */
  amountCents: number | null;
  note: string | null;
  by: string;
  /** "YYYY-MM-DD", Eastern, when it was last saved */
  day: string;
  at: string;
};
