/** Returns the unit number as it should be displayed.
 *  Purely numeric entries (e.g. "1", "101") get "Unit " prepended.
 *  Anything else (e.g. "Unit 1", "2000-2037: C3") is returned unchanged.
 */
export function formatUnitDisplay(unitNumber: string | null | undefined): string {
  if (!unitNumber) return "—";
  if (/^\d+$/.test(unitNumber.trim())) return `Unit ${unitNumber.trim()}`;
  return unitNumber;
}
