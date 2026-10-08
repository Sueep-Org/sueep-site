/**
 * Quality check pieces safe to import on the client: the key areas list and
 * the shape of what a visit found (JanitorialQualityCheck.areaResults).
 */

export type AreaRating = "GOOD" | "NEEDS_ATTENTION";

export type AreaResult = {
  area: string;
  /** null = not looked at yet (a saved draft) */
  rating: AreaRating | null;
  note: string;
};

export const MAX_AREAS = 40;
export const MAX_PHOTOS_PER_CHECK = 40;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Lobby, hallways, gym, 3 common bathrooms" into ["Lobby", "Hallways", "Gym", "3 common bathrooms"]. */
export function splitServiceAreas(serviceAreas: string | null): string[] {
  return cleanAreas((serviceAreas ?? "").split(/[,;\n]/).map((s) => cap(s.trim())));
}

/** Trimmed, no blanks, no repeats (ignoring case), at most MAX_AREAS. */
export function cleanAreas(areas: unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of areas) {
    const a = String(raw ?? "").trim().slice(0, 80);
    if (!a || seen.has(a.toLowerCase())) continue;
    seen.add(a.toLowerCase());
    out.push(a);
  }
  return out.slice(0, MAX_AREAS);
}

/** The contract's key areas, or its service areas split up when none are saved yet. */
export function keyAreasFor(contract: { qualityAreas: string[]; serviceAreas: string | null }): string[] {
  return contract.qualityAreas.length ? contract.qualityAreas : splitServiceAreas(contract.serviceAreas);
}

/** Reads stored areaResults, dropping anything malformed. */
export function parseAreaResults(value: unknown): AreaResult[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: AreaResult[] = [];
  for (const r of value) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const area = String(o.area ?? "").trim().slice(0, 80);
    if (!area || seen.has(area.toLowerCase())) continue;
    seen.add(area.toLowerCase());
    const rating = o.rating === "GOOD" || o.rating === "NEEDS_ATTENTION" ? o.rating : null;
    out.push({ area, rating, note: String(o.note ?? "").slice(0, 2000) });
  }
  return out.slice(0, MAX_AREAS);
}

/**
 * Rows for the form: saved results first (keeps areas added on a visit),
 * then any key areas the visit hasn't covered yet.
 */
export function formAreaResults(saved: AreaResult[], keyAreas: string[]): AreaResult[] {
  const have = new Set(saved.map((r) => r.area.toLowerCase()));
  return [...saved, ...keyAreas.filter((a) => !have.has(a.toLowerCase())).map((area) => ({ area, rating: null, note: "" }))];
}

export function needsAttention(results: AreaResult[]): AreaResult[] {
  return results.filter((r) => r.rating === "NEEDS_ATTENTION");
}
