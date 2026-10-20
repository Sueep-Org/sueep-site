/**
 * Shared look for the pipeline board, deal panel and Win/Loss: one set of
 * chart colors and one set of formats, so the same thing never shows two ways.
 * Safe to import on the client.
 *
 * Colors were checked together with the dataviz palette validator (light
 * surface). Every colored mark also has a text label, so color is never the
 * only cue.
 */

export const CHART = {
  /** Outcomes: same everywhere (user decision 2026-10-20: green means won). */
  won: "#1baf7a",
  lost: "#eb6834",
  open: "#e5e7eb",
  /** Moved forward a stage (This week bar), and other "progress" marks. */
  moved: "#2a78d6",
  /** Lost because of price: price chart row and loss trend. */
  price: "#4a3aa7",
  noAnswer: "#eda100",
  didNotMoveForward: "#e87ba4",
  /** Neutral, not categories. */
  otherReasons: "#9ca3af",
  noReason: "#e5e7eb",
  ink: "#374151",
  muted: "#d1d5db",
  grid: "#e5e7eb",
} as const;

/** Chance to win: card stripe, panel meter. */
export const BAND_COLOR: Record<string, string> = { Strong: CHART.won, Fair: "#9ca3af", "Long shot": CHART.muted };
export const BAND_TEXT: Record<string, string> = { Strong: "text-emerald-700", Fair: "text-gray-700", "Long shot": "text-gray-500" };

export const pct = (x: number | null | undefined): string => (x == null ? "-" : `${Math.round(x * 100)}%`);

/** $ per sq ft and other small prices: "$0.41". */
export const money2 = (v: number): string => `$${v.toFixed(2)}`;

/** "2026-10-22" to "Oct 22", without a time zone shift. */
export function shortDay(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** "YYYY-MM-DD" plus n days. */
export function addDays(dayKey: string, n: number): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + n)).toISOString().slice(0, 10);
}

/** A timestamp as "Oct 22, 2026" in Eastern time. */
export function fullDate(iso: string): string {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" }) : "";
}

/** Today in Eastern time, "YYYY-MM-DD". */
export function todayKey(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}
