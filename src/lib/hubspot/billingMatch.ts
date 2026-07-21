/**
 * Pure text-matching helpers for the HubSpot invoice → ERP billing status
 * automation. No DB/HTTP here by design — these are easy to reason about
 * and exercise in isolation.
 *
 * The core problem: a HubSpot invoice line item's `name`/`description` text
 * describing what it's for is inconsistent — sometimes the service and the
 * floor/unit are split across the two fields, sometimes combined in one;
 * ordinal phrasing varies ("6th floor" in HubSpot vs. "Floor 6" in the ERP).
 * Every comparison here works on a normalized bag-of-words basis so word
 * order and field placement never matter, only which significant words are
 * present.
 */

const ORDINAL_SUFFIX_RE = /^(\d+)(st|nd|rd|th)$/i;

// Small on purpose — these are short service/location phrases, not prose.
const STOPWORDS = new Set(["the", "a", "an", "of", "for", "and", "on", "in", "at", "to", "with"]);

/** Lowercase, strip punctuation, strip ordinal suffixes off number-only
 * tokens (6th -> 6), collapse whitespace. */
export function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      const m = token.match(ORDINAL_SUFFIX_RE);
      return m ? m[1] : token;
    })
    .join(" ");
}

/** Joins a HubSpot line item's name + description into one normalized
 * haystack — handles the "split across two fields" vs. "combined in one"
 * inconsistency identically, since both just become word tokens. */
export function combinedLineItemText(name: string, description?: string | null): string {
  return normalizeText(`${name} ${description ?? ""}`);
}

function significantTokens(normalized: string): string[] {
  return normalized.split(/\s+/).filter((t) => t.length > 0 && !STOPWORDS.has(t));
}

// Plain equality misses common suffix variants that show up constantly in
// this data ("Clean" vs "Cleaning", "Paint" vs "Painting") — a shared prefix
// of at least 4 characters is treated as the same word without pulling in a
// full stemming library. Short words are excluded from this so e.g. "in"
// doesn't spuriously match "inn".
const MIN_FUZZY_PREFIX = 4;
function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < MIN_FUZZY_PREFIX || b.length < MIN_FUZZY_PREFIX) return false;
  return a.startsWith(b) || b.startsWith(a);
}

/** Fraction of the candidate description's significant words found in the
 * haystack. Word order never matters — this is bag-of-words overlap, not
 * sequence/substring matching — and word endings are matched loosely (see
 * tokensMatch) to absorb "Clean"/"Cleaning"-style suffix variance. */
export function scoreSovMatch(haystackNormalized: string, candidateDescriptionRaw: string): number {
  const candidateTokens = significantTokens(normalizeText(candidateDescriptionRaw));
  if (candidateTokens.length === 0) return 0;
  const haystackTokens = haystackNormalized.split(/\s+/).filter(Boolean);
  const matched = candidateTokens.filter((ct) => haystackTokens.some((ht) => tokensMatch(ct, ht))).length;
  return matched / candidateTokens.length;
}

export type MatchResult<T> =
  | { kind: "match"; candidate: T; score: number }
  | { kind: "ambiguous"; candidates: { candidate: T; score: number }[] }
  | { kind: "none" };

const DEFAULT_SOV_THRESHOLD = 0.8;
// If the top two scores are within this margin of each other, treat it as a
// tie rather than confidently picking the higher one — better to ask a human
// than to guess between two close candidates.
const TIE_MARGIN = 0.05;

/** Best-scoring SOV item candidate above `threshold`; ties/near-ties between
 * the top two candidates are reported as ambiguous rather than picking one. */
export function matchSovItem<T extends { description: string }>(
  haystackNormalized: string,
  candidates: T[],
  threshold: number = DEFAULT_SOV_THRESHOLD,
): MatchResult<T> {
  const scored = candidates
    .map((candidate) => ({ candidate, score: scoreSovMatch(haystackNormalized, candidate.description) }))
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0 || scored[0]!.score < threshold) return { kind: "none" };

  const top = scored[0]!;
  const runnerUp = scored[1];
  if (runnerUp && runnerUp.score >= threshold && top.score - runnerUp.score < TIE_MARGIN) {
    return { kind: "ambiguous", candidates: scored.filter((s) => s.score >= threshold) };
  }

  return { kind: "match", candidate: top.candidate, score: top.score };
}

/** Literal whole-word match against a known list of unit numbers — not a
 * generic digit regex, since that risks false hits like "6th floor" against
 * a building that happens to have a real unit "6". Both the haystack and the
 * known unit numbers are normalized the same way before comparing. */
export function matchUnitNumber(haystackNormalized: string, knownUnitNumbers: string[]): MatchResult<string> {
  const haystackTokens = new Set(haystackNormalized.split(/\s+/).filter(Boolean));
  const found = knownUnitNumbers.filter((unit) => haystackTokens.has(normalizeText(unit)));

  if (found.length === 0) return { kind: "none" };
  if (found.length > 1) {
    return { kind: "ambiguous", candidates: found.map((unit) => ({ candidate: unit, score: 1 })) };
  }
  return { kind: "match", candidate: found[0]!, score: 1 };
}

/** Shared amount-consistency gate — applies even to alias-matched line
 * items, not just scored ones, since a confidently-matched (or aliased) line
 * item whose amount doesn't fit the target's expected value is exactly the
 * kind of false positive this system exists to prevent. */
export function amountReconciles(sumCents: number, expectedCents: number, toleranceCents: number = 0): boolean {
  return Math.abs(sumCents - expectedCents) <= toleranceCents;
}
