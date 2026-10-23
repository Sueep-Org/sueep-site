/**
 * Commission tables for offer letters: earnings ladder, accelerators, margin
 * tiers and a worked example, all calculated from a few numbers so the math
 * is always right (the hand-typed 2026 estimator letter had $1.5M = $79.5K,
 * which should be $78.5K). Stored on the template (commissionDefaults) and
 * copied onto each letter (commission). Plain data, no server imports.
 */

export type CommissionPlan = {
  ratePct: number;
  marginPct: number;
  ladder: { show: boolean; fromCents: number; toCents: number; stepCents: number };
  accelerators: { show: boolean; heading: string; note: string; rows: { fromCents: number; ratePct: number }[] };
  tiers: { show: boolean; heading: string; note: string; rows: { minPct: number; ratePct: number; note: string }[] };
  example: { show: boolean; projectCents: number; marginsPct: number[] };
};

const M = 100_000_000; // $1M in cents
const ACCEL_NOTE = "accelerators will be adjusted in congruence with the base commission";

/** Sueep's 2026 estimator plan: 3% of profit at 30% assumed margin. */
export const DEFAULT_COMMISSION: CommissionPlan = {
  ratePct: 3,
  marginPct: 30,
  ladder: { show: true, fromCents: 1 * M, toCents: 3 * M, stepCents: 25_000_000 },
  accelerators: {
    show: true,
    heading: "Accelerators",
    note: ACCEL_NOTE,
    rows: [
      { fromCents: 1 * M, ratePct: 3 },
      { fromCents: 3 * M, ratePct: 3.5 },
      { fromCents: 4 * M, ratePct: 4 },
      { fromCents: 5 * M, ratePct: 4.5 },
    ],
  },
  tiers: {
    show: true,
    heading: "Commission Tiers",
    note: `Commission adjustment based on the company's final margin - ${ACCEL_NOTE}`,
    rows: [
      { minPct: 30, ratePct: 3, note: "Full commission" },
      { minPct: 25, ratePct: 2, note: "Reduced commission" },
      { minPct: 20, ratePct: 1, note: "Minimum commission tier" },
      { minPct: 0, ratePct: 0, note: "No commission" },
    ],
  },
  example: { show: true, projectCents: 10_000_000, marginsPct: [35, 30, 27, 22, 18] },
};

const num = (v: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const str = (v: unknown, fallback: string, maxLen = 300) => (typeof v === "string" ? v.slice(0, maxLen) : fallback);
const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

/** Cleans a plan from the editor or the DB; anything missing falls back to the defaults. */
export function parseCommission(input: unknown): CommissionPlan {
  const r = obj(input);
  const d = DEFAULT_COMMISSION;
  const l = obj(r.ladder);
  const a = obj(r.accelerators);
  const t = obj(r.tiers);
  const e = obj(r.example);
  const step = Math.round(num(l.stepCents, d.ladder.stepCents, 100_00, 100 * M));
  const from = Math.round(num(l.fromCents, d.ladder.fromCents, 0, 1000 * M));
  return {
    ratePct: num(r.ratePct, d.ratePct, 0, 100),
    marginPct: num(r.marginPct, d.marginPct, 0, 100),
    ladder: {
      show: l.show !== false,
      fromCents: from,
      // At most 30 rows.
      toCents: Math.round(Math.min(num(l.toCents, d.ladder.toCents, 0, 1000 * M), from + step * 29)),
      stepCents: step,
    },
    accelerators: {
      show: a.show !== false,
      heading: str(a.heading, d.accelerators.heading),
      note: str(a.note, d.accelerators.note),
      rows: (Array.isArray(a.rows) ? a.rows : d.accelerators.rows).slice(0, 12).map((row) => {
        const x = obj(row);
        return { fromCents: Math.round(num(x.fromCents, 0, 0, 1000 * M)), ratePct: num(x.ratePct, 0, 0, 100) };
      }),
    },
    tiers: {
      show: t.show !== false,
      heading: str(t.heading, d.tiers.heading),
      note: str(t.note, d.tiers.note),
      rows: (Array.isArray(t.rows) ? t.rows : d.tiers.rows).slice(0, 12).map((row) => {
        const x = obj(row);
        return { minPct: num(x.minPct, 0, 0, 100), ratePct: num(x.ratePct, 0, 0, 100), note: str(x.note, "", 120) };
      }),
    },
    example: {
      show: e.show !== false,
      projectCents: Math.round(num(e.projectCents, d.example.projectCents, 0, 1000 * M)),
      marginsPct: (Array.isArray(e.marginsPct) ? e.marginsPct : d.example.marginsPct)
        .slice(0, 12)
        .map((m) => num(m, 0, 0, 100)),
    },
  };
}

/** "$65,000", "65000", "65k", "$65K a year" -> cents. Null when there's no number. */
export function parseMoneyCents(text: string | undefined): number | null {
  const m = /(\d[\d,]*(?:\.\d+)?)\s*([kKmM])?/.exec(text ?? "");
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  const mult = m[2]?.toLowerCase() === "k" ? 1_000 : m[2]?.toLowerCase() === "m" ? 1_000_000 : 1;
  return Math.round(n * mult * 100);
}

const trimNum = (n: number, maxDecimals: number) => Number(n.toFixed(maxDecimals)).toString();

/** 3 -> "3.0%", 3.5 -> "3.5%", 2.25 -> "2.25%". */
export function formatRate(pct: number): string {
  const s = trimNum(pct, 2);
  return `${s.includes(".") ? s : `${s}.0`}%`;
}

/** Whole-ish percent for margins: 30 -> "30%", 29.99 -> "29.99%". */
const formatPct = (pct: number) => `${trimNum(pct, 2)}%`;

/** $1M -> "$1.0M" (ladder style) or "$1M" (compact), $250K -> "$250K". */
export function formatMillions(cents: number, compact = false): string {
  const d = cents / 100;
  if (d >= 1_000_000) {
    const s = trimNum(d / 1_000_000, 2);
    return `$${!compact && !s.includes(".") ? `${s}.0` : s}M`;
  }
  return `$${trimNum(d / 1_000, 2)}K`;
}

/** 9000 dollars -> "$9K", 11250 -> "$11.25K". */
const formatK = (cents: number) => `$${trimNum(cents / 100 / 1_000, 2)}K`;
const formatDollars = (cents: number) => `$${Math.round(cents / 100).toLocaleString("en-US")}`;

export type CommissionTable = { heading?: string; note?: string; columns: string[]; rows: string[][] };

/**
 * The tables as printed. `baseCents` comes from the letter's salary; without
 * it the ladder's total column shows a dash. `title` is the job title used in
 * column names ("Estimator Commission ...").
 */
export function commissionTables(plan: CommissionPlan, baseCents: number | null, title: string): CommissionTable[] {
  const who = title.trim() ? `${title.trim()} ` : "";
  const tables: CommissionTable[] = [];

  if (plan.ladder.show && plan.ladder.stepCents > 0 && plan.ladder.toCents >= plan.ladder.fromCents) {
    const rows: string[][] = [];
    for (let r = plan.ladder.fromCents; r <= plan.ladder.toCents && rows.length < 30; r += plan.ladder.stepCents) {
      const commission = Math.round((r * plan.marginPct * plan.ratePct) / 10_000);
      rows.push([formatMillions(r), formatK(commission), baseCents != null ? formatK(baseCents + commission) : "-"]);
    }
    if (rows.length) rows[rows.length - 1][0] += "+";
    tables.push({
      columns: ["Annual Revenue Closed", `${who}Commission @${formatPct(plan.marginPct)} assumed margin`, "Total Earnings (Base + Commission)"],
      rows,
    });
  }

  if (plan.accelerators.show && plan.accelerators.rows.length) {
    const sorted = [...plan.accelerators.rows].sort((a, b) => a.fromCents - b.fromCents);
    tables.push({
      heading: plan.accelerators.heading || undefined,
      note: plan.accelerators.note || undefined,
      columns: ["Annual Project Revenue", "Commission on Gross Profit"],
      rows: sorted.map((row, i) => [
        sorted[i + 1] ? `${formatMillions(row.fromCents, true)} - ${formatMillions(sorted[i + 1].fromCents, true)}` : `Above ${formatMillions(row.fromCents, true)}`,
        formatRate(row.ratePct),
      ]),
    });
  }

  const tiers = [...plan.tiers.rows].sort((a, b) => b.minPct - a.minPct);
  if (plan.tiers.show && tiers.length) {
    tables.push({
      heading: plan.tiers.heading || undefined,
      note: plan.tiers.note || undefined,
      columns: ["Actual Project Gross Margin", `${who}Commission on Gross Profit`, "Rationale"],
      rows: tiers.map((row, i) => {
        const upper = i > 0 ? tiers[i - 1].minPct : null;
        const label =
          upper == null ? `${formatPct(row.minPct)} or higher` : row.minPct === 0 ? `Below ${formatPct(upper)}` : `${formatPct(row.minPct)} - ${formatPct(upper - 0.01)}`;
        const rate = row.ratePct === plan.ratePct ? `${formatRate(row.ratePct)} (base rate)` : row.ratePct === 0 ? "0%" : formatRate(row.ratePct);
        return [label, rate, row.note];
      }),
    });
  }

  if (plan.example.show && plan.example.marginsPct.length) {
    tables.push({
      heading: `Example on ${formatK(plan.example.projectCents)} project`,
      columns: ["Actual Margin", "Gross Profit", "Commission Rate", `${who}Payout`],
      rows: plan.example.marginsPct.map((m) => {
        const profit = Math.round((plan.example.projectCents * m) / 100);
        const rate = tiers.find((t) => m >= t.minPct)?.ratePct ?? 0;
        return [formatPct(m), formatDollars(profit), rate === 0 ? "0%" : formatRate(rate), formatDollars(Math.round((profit * rate) / 100))];
      }),
    });
  }

  return tables;
}
