/** USD cents ↔ display helpers for ERP. */

export function dollarsToCents(d: number): number {
  return Math.round(d * 100);
}

export function centsToDollars(c: number | null | undefined): string {
  if (c == null) return "-";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(c / 100);
}

/** Short dollars for tight spots: $950, $41k, $1.2M. Negative as -$41k. */
export function centsToDollarsCompact(c: number): string {
  if (c < 0) return `-${centsToDollarsCompact(-c)}`;
  const d = c / 100;
  if (d >= 1_000_000) return `$${(d / 1_000_000).toFixed(1)}M`;
  if (d >= 1_000) return `$${(d / 1_000).toFixed(d >= 10_000 ? 0 : 1)}k`;
  return `$${d.toFixed(0)}`;
}

export function parseMoneyInput(raw: string): number | null {
  const t = raw.trim().replace(/[$,]/g, "");
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return dollarsToCents(n);
}

/** Form/API value → cents: numbers are dollars; strings parsed as currency. */
export function inputToCents(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return dollarsToCents(v);
  if (typeof v === "string") return parseMoneyInput(v);
  return null;
}
