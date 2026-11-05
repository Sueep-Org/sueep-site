/**
 * Settings that change pay or commission keep every value with the day it
 * started, so a change can apply from a chosen date (older pay periods and
 * deals keep the old number) or to everything. Stored in AppSetting as JSON
 * [{ from, value }], oldest first; the first entry's `from` is null (since
 * always). Client-safe.
 */

export type DatedEntry<T> = { from: string | null; value: T };
export type Dated<T> = DatedEntry<T>[];

/** How a dated setting change applies: from a day on, or to every past and future day. */
export type DatedMode = { from: string } | "all";

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** The value in effect on a "YYYY-MM-DD" day. */
export function valueOn<T>(dated: Dated<T>, dateKey: string): T {
  let value = dated[0]!.value;
  for (const e of dated) if (e.from == null || e.from <= dateKey) value = e.value;
  return value;
}

/** Reads stored text. Bad or missing data gives just the default. A plain
 * (non-JSON-array) value is read as "since always", for values saved before
 * the setting kept dates. */
export function parseDated<T>(raw: string | null | undefined, read: (v: unknown) => T | null, fallback: T): Dated<T> {
  if (raw == null || raw.trim() === "") return [{ from: null, value: fallback }];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = raw;
  }
  if (!Array.isArray(parsed)) {
    const v = read(parsed);
    return [{ from: null, value: v ?? fallback }];
  }
  const entries: Dated<T> = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const { from, value } = item as { from?: unknown; value?: unknown };
    const v = read(value);
    if (v == null) continue;
    if (from != null && (typeof from !== "string" || !DATE_KEY.test(from))) continue;
    entries.push({ from: (from as string | null) ?? null, value: v });
  }
  if (!entries.length) return [{ from: null, value: fallback }];
  entries.sort((a, b) => (a.from ?? "").localeCompare(b.from ?? ""));
  entries[0] = { ...entries[0]!, from: null };
  return entries;
}

/** The history after a change. "all" replaces it; a date keeps what came before that day. */
export function applyDatedChange<T>(dated: Dated<T>, value: T, mode: DatedMode): Dated<T> {
  if (mode === "all") return [{ from: null, value }];
  const kept = dated.filter((e) => e.from == null || e.from < mode.from);
  if (!kept.length) return [{ from: null, value }];
  return [...kept, { from: mode.from, value }];
}

export function isDateKey(v: unknown): v is string {
  return typeof v === "string" && DATE_KEY.test(v) && !isNaN(new Date(`${v}T00:00:00Z`).getTime());
}
