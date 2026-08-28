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

/** The address is usually the segment right after the building name (e.g.
 * "The Gio Apartments - 2630 W Girard Ave, Philadelphia, PA 19130 - Cushman
 * & Wakefield" -> "2630 W Girard Ave, Philadelphia, PA 19130"). When the
 * deal name only has one "-" (name - management company, no address), that
 * second segment is only treated as an address if it looks like one
 * (contains a digit, as street addresses do) — otherwise it's almost
 * certainly a company name, not an address, and this returns "". */
export function parseAddressFromDealName(dealName: string): string {
  const parts = dealName.split("-").map((p) => p.trim());
  if (parts.length >= 3) return parts[1] ?? "";
  if (parts.length === 2 && /\d/.test(parts[1] ?? "")) return parts[1]!;
  return "";
}
