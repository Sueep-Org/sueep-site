/**
 * Where an invoice uploaded to a client portal (Procore, Coupa...) stands
 * after upload (INVOICE_TRACKING_PLAN.md Phase 2). Set by hand; paid still
 * comes from QuickBooks. Safe to import on the client.
 */
import type { Prisma } from "@prisma/client";

export const PORTAL_STATUSES = ["SUBMITTED", "UNDER_REVIEW", "APPROVED", "SENT_BACK", "RESUBMITTED"] as const;
export type PortalStatus = (typeof PORTAL_STATUSES)[number];

export const PORTAL_STATUS_LABELS: Record<PortalStatus, string> = {
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under review",
  APPROVED: "Approved",
  SENT_BACK: "Sent back",
  RESUBMITTED: "Resubmitted",
};

/** Statuses someone can pick from the Invoices page. Submitted and Resubmitted come from Mark uploaded and Resubmit. */
export const PORTAL_PICKABLE: readonly PortalStatus[] = ["UNDER_REVIEW", "APPROVED", "SENT_BACK"];

/** On Ready to send's Needs sending: not with the client yet, or sent back by the client to fix and resubmit. */
export const DELIVERY_WAITING_WHERE = {
  OR: [{ status: { in: ["NEEDS_UPLOAD", "NEEDS_SENDING"] } }, { portalStatus: "SENT_BACK" }],
} satisfies Prisma.InvoiceDeliveryWhereInput;

export function isPortalStatus(v: unknown): v is PortalStatus {
  return typeof v === "string" && (PORTAL_STATUSES as readonly string[]).includes(v);
}
