/** Pure text helper, safe to import from client components — no server-only
 * dependencies (prisma, hubspotFetch), unlike the rest of src/lib/hubspot. */

/** The building name is the text before the first "-" in a deal name (e.g.
 * "The Gio Apartments - 2630 W Girard Ave, Philadelphia..." -> "The Gio
 * Apartments"). Falls back to the whole trimmed name if there's no "-". */
export function parseBuildingNameFromDealName(dealName: string): string {
  const idx = dealName.indexOf("-");
  const raw = idx === -1 ? dealName : dealName.slice(0, idx);
  return raw.trim();
}
