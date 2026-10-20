/** Reason groups for the Win/Loss loss trend (winLoss.ts). Safe to import on the client. */

/** Reasons with their own color, in stacking order; the rest are "other". Keys are HubSpot values. */
export const LOSS_GROUPS = [
  { key: "GC Not Awarded", label: "GC not awarded" },
  { key: "Price", label: "Price" },
  { key: "No Answer", label: "No answer" },
  { key: "Proyecto en HOLD", label: "Did not move forward" },
  { key: "other", label: "Other reasons" },
  { key: "none", label: "No reason" },
] as const;
export type LossGroup = (typeof LOSS_GROUPS)[number]["key"];
export type LossQuarter = { key: string; total: number; parts: Record<LossGroup, number> };
