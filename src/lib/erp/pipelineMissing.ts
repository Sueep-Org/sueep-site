/** Fields a pipeline deal can be missing for its stage (pipelineBoard.ts). Safe to import on the client. */
export const MISSING_FIELDS = ["owner", "company", "bidDate", "amount", "sqft"] as const;
export type MissingField = (typeof MISSING_FIELDS)[number];
export const MISSING_LABELS: Record<MissingField, string> = { owner: "Owner", company: "GC", bidDate: "Bid Date", amount: "Amount", sqft: "Sq ft" };
