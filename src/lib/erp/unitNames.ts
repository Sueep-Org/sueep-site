/**
 * Unit names are typed by hand, so one unit ends up written several ways
 * ("632" and "Unit 632", "716 - B and C" and "Unit 716 B & C"). That splits
 * its history and breaks invoice matching. New turns reuse the spelling the
 * building already has whenever the two only differ in how they're written.
 *
 * Only writing differences count: a "Unit" prefix, "#", "and" vs "&",
 * dashes, brackets and spacing. Anything that changes the meaning stays
 * apart: "10A" vs "10B", "1110 - B" vs "1110 B & C", "Unit 226" vs
 * "Unit 226 (Water Heater Leak)".
 */

/** Two names with the same key are the same unit written differently. */
export function unitNameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/^\s*unit\s*/, "")
    .replace(/#/g, "")
    .replace(/\band\b/g, "&")
    .replace(/[-–—,()/+]/g, " ")
    .replace(/\s*&\s*/g, " & ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The spelling this building already uses for the unit, else the name as typed. */
export function matchUnitName(typed: string, existing: string[]): string {
  const key = unitNameKey(typed);
  if (!key) return typed;
  // Most-used spelling wins, so a building settles on one name over time.
  const counts = new Map<string, number>();
  for (const name of existing) if (unitNameKey(name) === key) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? typed;
}
