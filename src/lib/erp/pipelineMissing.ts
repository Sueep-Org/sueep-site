/**
 * Fields a pipeline deal can be required to have for its stage: the card's
 * Missing flag (pipelineBoard.ts) and the stage rules checked before a move
 * (dealStageRules.ts, PIPELINE_EXTRAS_PLAN Phase 4). Safe to import on the client.
 */
export const MISSING_FIELDS = ["owner", "company", "bidDate", "walkDate", "awardDate", "amount", "sqft"] as const;
export type MissingField = (typeof MISSING_FIELDS)[number];
export const MISSING_LABELS: Record<MissingField, string> = {
  owner: "Owner",
  company: "GC",
  bidDate: "Bid Date",
  walkDate: "Job Walk Date",
  awardDate: "Award Date",
  amount: "Amount",
  sqft: "Sq ft",
};

/** Bid and award dates are post-construction only. */
export function fieldsFor(pipeline: "post-con" | "janitorial"): MissingField[] {
  return pipeline === "janitorial" ? MISSING_FIELDS.filter((f) => f !== "bidDate" && f !== "awardDate") : [...MISSING_FIELDS];
}

/** What the rules look at on a deal. */
export type DealFacts = {
  /** Has an owner who's active in HubSpot */
  ownerOk: boolean;
  hasCompany: boolean;
  bidDate: string | null;
  walkDate: string | null;
  awardDate: string | null;
  cents: number;
  sqft: number | null;
};

/** The required fields this deal doesn't have, in list order. */
export function missingFrom(required: readonly MissingField[], f: DealFacts): MissingField[] {
  const has: Record<MissingField, boolean> = {
    owner: f.ownerOk,
    company: f.hasCompany,
    bidDate: !!f.bidDate,
    walkDate: !!f.walkDate,
    awardDate: !!f.awardDate,
    amount: f.cents > 0,
    sqft: !!f.sqft && f.sqft > 0,
  };
  return MISSING_FIELDS.filter((m) => required.includes(m) && !has[m]);
}
