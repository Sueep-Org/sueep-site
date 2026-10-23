/**
 * Details a person can pick for their Deals board cards (up to 3), saved per
 * pipeline in BoardPreference. The card always shows the deal name, its one
 * flag and its menu; a late or due-this-week next step always shows too.
 * Plain data, no server imports.
 */

export type CardField = "gc" | "amount" | "owner" | "bidDate" | "awardDate" | "sqft" | "daysInStage" | "nextStep";

export const CARD_FIELDS: { value: CardField; label: string; postConOnly?: boolean }[] = [
  { value: "gc", label: "GC / company" },
  { value: "amount", label: "Amount" },
  { value: "owner", label: "Owner" },
  { value: "bidDate", label: "Bid date", postConOnly: true },
  { value: "awardDate", label: "Award date", postConOnly: true },
  { value: "sqft", label: "Sq ft" },
  { value: "daysInStage", label: "Days in stage" },
  { value: "nextStep", label: "Next step" },
];

/** Today's card. */
export const DEFAULT_CARD_FIELDS: CardField[] = ["gc", "amount", "owner"];
export const MAX_CARD_FIELDS = 3;

/** Known fields only, no repeats, at most 3. Falls back to the default when nothing is left. */
export function cleanCardFields(input: unknown): CardField[] {
  const known = new Set(CARD_FIELDS.map((f) => f.value));
  const list = (Array.isArray(input) ? input : []).filter((v): v is CardField => typeof v === "string" && known.has(v as CardField));
  const unique = [...new Set(list)].slice(0, MAX_CARD_FIELDS);
  return unique.length ? unique : DEFAULT_CARD_FIELDS;
}
