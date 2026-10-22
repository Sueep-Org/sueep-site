import type { ErpRole } from "@/lib/erpSession";
import { inputToCents } from "@/lib/erp/money";

/** Sub bids on a project's Proposals tab (SubBid). Plain helpers, no server imports. */

export const SUB_BID_STATUSES = ["RECEIVED", "AWARDED", "DECLINED", "WITHDRAWN"] as const;
export type SubBidStatus = (typeof SUB_BID_STATUSES)[number];

export const SUB_BID_STATUS_LABELS: Record<SubBidStatus, string> = {
  RECEIVED: "Received",
  AWARDED: "Awarded",
  DECLINED: "Declined",
  WITHDRAWN: "Withdrawn",
};

/** Same people as the project's Financials tabs: everyone but Employees and Supervisors. */
export function canSeeProposals(role: ErpRole | null | undefined): boolean {
  return !!role && role !== "EMPLOYEE" && role !== "SUPERVISOR";
}

export type SubBidRow = {
  id: string;
  contractorId: string | null;
  contractorName: string | null;
  bidderName: string | null;
  bidderCompany: string | null;
  bidderEmail: string | null;
  bidderPhone: string | null;
  amountCents: number;
  receivedOn: string | null;
  status: SubBidStatus;
  notes: string | null;
  createdBy: string | null;
  sovItemIds: string[];
};

/** Who bid, for display: the profile name, else the company, else the person typed in. */
export function bidderLabel(row: Pick<SubBidRow, "contractorName" | "bidderName" | "bidderCompany">): string {
  return row.contractorName ?? row.bidderCompany ?? row.bidderName ?? "Unnamed sub";
}

/**
 * Which no-profile bids are the same sub: the same email (any case), or with
 * no email, the same company + name. Null when there's nothing to go on.
 */
export function bidderKey(b: { bidderEmail: string | null; bidderCompany: string | null; bidderName: string | null }): string | null {
  const n = (v: string | null) => (v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const key = n(b.bidderEmail) || `${n(b.bidderCompany)}|${n(b.bidderName)}`;
  return key === "|" ? null : key;
}

/** Our price for what the bid covers: its SOV lines, or the contract value when it's the whole job. */
export function bidOurPriceCents(
  sovItemIds: string[],
  sovValues: Map<string, number>,
  contractValueCents: number | null,
): number | null {
  if (sovItemIds.length === 0) return contractValueCents;
  return sovItemIds.reduce((sum, id) => sum + (sovValues.get(id) ?? 0), 0);
}

/** Bids on the exact same lines are compared with each other. */
export function bidScopeKey(sovItemIds: string[]): string {
  return sovItemIds.length === 0 ? "whole" : [...sovItemIds].sort().join(",");
}

type BidInput = {
  contractorId: string | null;
  bidderName: string | null;
  bidderCompany: string | null;
  bidderEmail: string | null;
  bidderPhone: string | null;
  amountCents: number;
  receivedOn: Date | null;
  status: SubBidStatus;
  notes: string | null;
  sovItemIds: string[];
};

function text(v: unknown): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  return t || null;
}

/** Validates a create/edit body. Fields left out of a partial (edit) body come back undefined. */
export function parseSubBidBody(
  body: Record<string, unknown>,
  partial: boolean,
): { data: Partial<BidInput> } | { error: string } {
  const data: Partial<BidInput> = {};
  const has = (k: string) => k in body;

  if (has("contractorId")) data.contractorId = text(body.contractorId);
  for (const k of ["bidderName", "bidderCompany", "bidderPhone", "notes"] as const) {
    if (has(k)) data[k] = text(body[k]);
  }
  if (has("bidderEmail")) data.bidderEmail = text(body.bidderEmail)?.toLowerCase() ?? null;

  if (has("amount") || !partial) {
    const cents = inputToCents(body.amount);
    if (cents == null || cents <= 0) return { error: "Enter the bid amount" };
    data.amountCents = cents;
  }
  if (has("receivedOn")) {
    const raw = text(body.receivedOn);
    if (raw && !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { error: "Bad received date" };
    data.receivedOn = raw ? new Date(`${raw}T00:00:00.000Z`) : null;
  }
  if (has("status")) {
    const s = String(body.status);
    if (!(SUB_BID_STATUSES as readonly string[]).includes(s)) return { error: "Bad status" };
    data.status = s as SubBidStatus;
  }
  if (has("sovItemIds")) {
    data.sovItemIds = Array.isArray(body.sovItemIds) ? [...new Set(body.sovItemIds.map((v) => String(v).trim()).filter(Boolean))] : [];
  }

  if (!partial && !data.contractorId && !data.bidderName && !data.bidderCompany) {
    return { error: "Pick a contractor or type the sub's name or company" };
  }
  return { data };
}
