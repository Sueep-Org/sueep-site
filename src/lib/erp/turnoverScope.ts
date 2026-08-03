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
