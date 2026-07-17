export type BidBonusTier = { minBids: number; bonusCents: number };

/**
 * Weekly verified-bid bonus schedule for Business Development Callers, per
 * the BD Caller offer letter's performance ladder. Checked highest-first;
 * the first tier whose minBids the week's verified-bid count meets or
 * exceeds wins. Below 10 bids, no bonus.
 */
export const BID_BONUS_TIERS: BidBonusTier[] = [
  { minBids: 40, bonusCents: 1_000_00 },
  { minBids: 30, bonusCents: 600_00 },
  { minBids: 20, bonusCents: 300_00 },
  { minBids: 10, bonusCents: 100_00 },
  { minBids: 0, bonusCents: 0 },
];

/**
 * A weekly verified-bid bonus entry, flattened for display (one row per
 * employee per week). No stored id — the row is keyed by (employeeId,
 * weekStart), since verifiedBids is derived live by counting sent bids
 * rather than stored, and a paid-status record may not exist yet.
 */
export type BidBonusRow = {
  employeeId: string;
  employeeName: string;
  weekStart: string;
  verifiedBids: number;
  bonusCents: number;
  paidAt: string | null;
};

export function bidBonusRowKey(employeeId: string, weekStart: string): string {
  return `${employeeId}::${weekStart}`;
}

export function bidBonusCentsForCount(verifiedBids: number): number {
  const bids = Math.max(0, verifiedBids);
  return BID_BONUS_TIERS.find((t) => bids >= t.minBids)!.bonusCents;
}

/** Normalizes any date to the Monday of its week (UTC), as an ISO date string (YYYY-MM-DD). */
export function mondayOf(d: Date): string {
  const date = new Date(d);
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString().slice(0, 10);
}
