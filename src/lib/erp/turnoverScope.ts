/** Standard janitorial/turnover work categories — same vocabulary as the
 * fullClean/fullPaint/etc. flags on TurnoverRequest (see UnitScopeCard), but
 * exposed as a flat list so a day assignment can flag which of them a
 * particular scheduled day is covering. */
export const TURNOVER_SCOPE_OPTIONS = [
  { value: "CLEAN", label: "Clean" },
  { value: "PAINT", label: "Paint" },
  { value: "TOUCH_UP_PAINT", label: "Touch-up paint" },
  { value: "CARPET", label: "Carpet cleaning" },
  { value: "CEILING_PAINT", label: "Ceiling painting" },
  { value: "MATERIALS", label: "Materials" },
  { value: "COMPOUNDING", label: "Compounding" },
  { value: "OTHER", label: "Other" },
] as const;

export type TurnoverScopeValue = (typeof TURNOVER_SCOPE_OPTIONS)[number]["value"];

const TURNOVER_SCOPE_VALUES = new Set<string>(TURNOVER_SCOPE_OPTIONS.map((o) => o.value));

export function isTurnoverScopeValue(value: string): value is TurnoverScopeValue {
  return TURNOVER_SCOPE_VALUES.has(value);
}

export function turnoverScopeLabel(value: string): string {
  return TURNOVER_SCOPE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

/** Parses TurnoverRequest.completedScopeItems (a raw Json column) down to the
 * subset of values that are actually valid scope categories, same defensive
 * pattern as Employee.requiredDocuments. */
export function parseCompletedScopeItems(value: unknown): TurnoverScopeValue[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is TurnoverScopeValue => typeof v === "string" && isTurnoverScopeValue(v));
}

/** Maps a TurnoverRequest's contracted-scope flags to the subset of
 * TURNOVER_SCOPE_OPTIONS values actually selected for that unit — e.g. a
 * unit with only fullClean and fullPaint checked returns ["CLEAN", "PAINT"].
 * Used to restrict the day-assignment scope picker to what the unit was
 * actually contracted for, instead of the full fixed category list. */
export function contractedTurnoverScope(flags: {
  fullClean: boolean;
  fullPaint: boolean;
  touchUpPaint: number | null;
  carpetCleaning: boolean;
  ceilingPaint: boolean;
  materialsAdditional: boolean;
  compounding?: number | null;
  otherWork: boolean;
}): TurnoverScopeValue[] {
  const values: TurnoverScopeValue[] = [];
  if (flags.fullClean) values.push("CLEAN");
  if (flags.fullPaint) values.push("PAINT");
  if (flags.touchUpPaint) values.push("TOUCH_UP_PAINT");
  if (flags.carpetCleaning) values.push("CARPET");
  if (flags.ceilingPaint) values.push("CEILING_PAINT");
  if (flags.materialsAdditional) values.push("MATERIALS");
  if (flags.compounding) values.push("COMPOUNDING");
  if (flags.otherWork) values.push("OTHER");
  return values;
}
