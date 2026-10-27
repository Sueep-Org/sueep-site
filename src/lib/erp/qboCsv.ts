/**
 * Readers for QuickBooks Online report exports (CSV), used by the QuickBooks
 * upload page until the API connection fills the same tables
 * (QUICKBOOKS_PLAN.md Phase U). Plain functions, no database, so they can be
 * checked against real export files.
 *
 * The export layout: a few title rows (company, report name, dates), a blank
 * row, a header row whose first cell is empty, then one row per account or
 * customer. A group shows as its own row, its members, then "Total for
 * <group>". Amounts are quoted with commas and sometimes a $ sign. A
 * timestamp row (with "Cash Basis" or "Accrual Basis" on reports that have
 * one) comes last.
 */

/** RFC 4180 rows: quoted cells can hold commas, quotes ("") and line breaks. */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** "1,234.56", "$1,234.56", "-652.48", "(1,234.56)" to cents. Blank is 0. Null when it isn't a number. */
export function parseAmountCents(raw: string | undefined): number | null {
  const s = (raw ?? "").trim();
  if (s === "") return 0;
  const negative = /^\(.*\)$/.test(s) || s.startsWith("-");
  const digits = s.replace(/[()$,\s-]/g, "");
  if (!/^\d+(\.\d+)?$/.test(digits)) return null;
  const cents = Math.round(Number(digits) * 100);
  return negative ? -cents : cents;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "Jan 2026" or "Oct 1-27 2026" to "2026-01" / "2026-10". Null for anything else ("Total"). */
export function monthKeyFromHeader(label: string): string | null {
  const m = label.trim().match(/^([A-Za-z]{3})[A-Za-z]*\.?(?:\s+\d{1,2}\s*-\s*\d{1,2},?)?\s+(\d{4})$/);
  if (!m) return null;
  const idx = MONTHS.indexOf(m[1].toLowerCase());
  return idx < 0 ? null : `${m[2]}-${String(idx + 1).padStart(2, "0")}`;
}

const MONTH_NAMES: Record<string, number> = Object.fromEntries(
  ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"].map((n, i) => [n, i + 1]),
);

/** "October 27, 2026" or "Oct 27, 2026" to "2026-10-27". */
function dateKeyFromText(text: string): string | null {
  const m = text.trim().match(/([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (!m) return null;
  const name = m[1].toLowerCase();
  const month = MONTH_NAMES[name] ?? (MONTHS.indexOf(name.slice(0, 3)) + 1 || 0);
  if (!month) return null;
  return `${m[3]}-${String(month).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

/** "January 1-October 27, 2026" or "January 1, 2026-October 27, 2026" to its first and last day. */
function periodFromText(text: string): { from: string; to: string } | null {
  const t = text.trim();
  const year = t.match(/(\d{4})\s*$/)?.[1];
  const [a, b] = t.split(/\s*-\s*(?=[A-Za-z])/);
  if (!year || !a || !b) return null;
  const from = dateKeyFromText(/\d{4}/.test(a) ? a : `${a}, ${year}`);
  const to = dateKeyFromText(b);
  return from && to ? { from, to } : null;
}

function basisOf(rows: string[][]): "CASH" | "ACCRUAL" | null {
  for (const r of rows.slice(-5)) {
    const text = r.join(" ");
    if (/cash basis/i.test(text)) return "CASH";
    if (/accrual basis/i.test(text)) return "ACCRUAL";
  }
  return null;
}

function isBlank(r: string[]): boolean {
  return r.every((c) => c.trim() === "");
}

/** Index of the header row: first cell empty, at least two named columns after it. */
function headerIndex(rows: string[][]): number {
  return rows.findIndex((r) => r[0]?.trim() === "" && r.slice(1).filter((c) => c.trim() !== "").length >= 2);
}

/**
 * Gives each row its group: when "Total for X" is reached, every row since
 * X's own row that has no group yet belongs to X. Inner groups close first,
 * so their members already point at them and only the inner group's own row
 * gets X. Returns the rows with `parent` set, minus the "Total for" rows.
 */
function assignGroups<T extends { name: string; parent: string }>(items: (T | { totalFor: string })[]): T[] {
  const out: T[] = [];
  const open: { name: string; start: number }[] = [];
  for (const item of items) {
    if ("totalFor" in item) {
      const at = open.map((o) => o.name).lastIndexOf(item.totalFor);
      if (at >= 0) {
        const { start } = open[at];
        for (let i = start + 1; i < out.length; i++) if (!out[i].parent) out[i].parent = item.totalFor;
        open.splice(at);
      }
      continue;
    }
    open.push({ name: item.name, start: out.length });
    out.push(item);
  }
  return out;
}

// ── Profit and Loss ────────────────────────────────────────────────────────

export type PnlSection = "INCOME" | "COGS" | "EXPENSE" | "OTHER_INCOME" | "OTHER_EXPENSE";

export type PnlLine = {
  /** "YYYY-MM" */
  month: string;
  account: string;
  /** The group it sits under ("Insurance" for "Van Insurance"), "" at the top level */
  parent: string;
  section: PnlSection;
  /** The account's own amount, not including its members */
  amountCents: number;
};

export type PnlCheck = { month: string; label: string; fileCents: number; linesCents: number };

export type PnlParse = {
  periodFrom: string | null;
  periodTo: string | null;
  basis: "CASH" | "ACCRUAL" | null;
  months: string[];
  lines: PnlLine[];
  /** The file's own section totals next to the sum of the lines read, per month */
  checks: PnlCheck[];
};

const SECTION_HEADERS: Record<string, PnlSection> = {
  income: "INCOME",
  "cost of goods sold": "COGS",
  expenses: "EXPENSE",
  "other income": "OTHER_INCOME",
  "other expenses": "OTHER_EXPENSE",
};
const SECTION_TOTALS: Record<string, PnlSection> = {
  "total income": "INCOME",
  "total cost of goods sold": "COGS",
  "total expenses": "EXPENSE",
  "total other income": "OTHER_INCOME",
  "total other expenses": "OTHER_EXPENSE",
};
/** Summary rows that aren't accounts. */
const SUMMARY_ROW = /^(gross profit|net operating income|net other income|net income)$/i;

export function parseProfitAndLoss(text: string): PnlParse | { error: string } {
  const rows = parseCsvRows(text);
  if (!rows.slice(0, 4).some((r) => /profit and loss/i.test(r[0] ?? ""))) return { error: "This doesn't look like a Profit and Loss export." };
  const h = headerIndex(rows);
  if (h < 0) return { error: "Couldn't find the column headers." };
  const header = rows[h];
  const monthCols = header.map((label, i) => ({ i, month: i === 0 ? null : monthKeyFromHeader(label) })).filter((c): c is { i: number; month: string } => !!c.month);
  if (monthCols.length === 0) return { error: 'No month columns. Run the report with "Display columns by" set to Months.' };
  if (new Set(monthCols.map((c) => c.month)).size !== monthCols.length) return { error: "The same month appears twice in the columns." };

  const periodRow = rows.slice(0, h).find((r) => periodFromText(r[0] ?? ""));
  const period = periodRow ? periodFromText(periodRow[0]) : null;

  type Item = { name: string; parent: string; section: PnlSection; amounts: number[] };
  const items: (Item | { totalFor: string })[] = [];
  const fileTotals = new Map<PnlSection, number[]>();
  let section: PnlSection | null = null;
  for (const r of rows.slice(h + 1)) {
    if (isBlank(r)) continue;
    const name = (r[0] ?? "").trim();
    const lower = name.toLowerCase();
    if (lower in SECTION_HEADERS) {
      section = SECTION_HEADERS[lower];
      continue;
    }
    const amounts = monthCols.map((c) => parseAmountCents(r[c.i]));
    if (lower in SECTION_TOTALS) {
      fileTotals.set(SECTION_TOTALS[lower], amounts.map((a) => a ?? 0));
      continue;
    }
    if (SUMMARY_ROW.test(name)) continue;
    if (lower.startsWith("total for ")) {
      items.push({ totalFor: name.slice("total for ".length).trim() });
      continue;
    }
    // The timestamp row at the bottom, or anything else that isn't an account row.
    if (!section || amounts.some((a) => a === null)) continue;
    items.push({ name, parent: "", section, amounts: amounts as number[] });
  }

  const accounts = assignGroups(items);
  const lines: PnlLine[] = [];
  for (const a of accounts) {
    monthCols.forEach((c, k) => {
      if (a.amounts[k] !== 0) lines.push({ month: c.month, account: a.name, parent: a.parent, section: a.section, amountCents: a.amounts[k] });
    });
  }

  const checks: PnlCheck[] = [];
  for (const [sec, totals] of fileTotals) {
    monthCols.forEach((c, k) => {
      const linesCents = lines.filter((l) => l.month === c.month && l.section === sec).reduce((s, l) => s + l.amountCents, 0);
      checks.push({ month: c.month, label: sec, fileCents: totals[k], linesCents });
    });
  }

  return { periodFrom: period?.from ?? null, periodTo: period?.to ?? null, basis: basisOf(rows), months: monthCols.map((c) => c.month), lines, checks };
}

// ── A/R Aging Summary ──────────────────────────────────────────────────────

export type ArRow = {
  customer: string;
  /** The parent customer for a sub-customer, "" otherwise */
  parent: string;
  currentCents: number;
  days1to30Cents: number;
  days31to60Cents: number;
  days61to90Cents: number;
  over90Cents: number;
  totalCents: number;
};

export type ArParse = {
  /** "YYYY-MM-DD" */
  asOf: string;
  rows: ArRow[];
  fileTotalCents: number | null;
  rowsTotalCents: number;
};

const AR_COLUMNS: [keyof Omit<ArRow, "customer" | "parent">, RegExp][] = [
  ["currentCents", /^current$/i],
  ["days1to30Cents", /^1\s*-\s*30$/],
  ["days31to60Cents", /^31\s*-\s*60$/],
  ["days61to90Cents", /^61\s*-\s*90$/],
  ["over90Cents", /^91 and over$/i],
  ["totalCents", /^total$/i],
];

export function parseArAging(text: string): ArParse | { error: string } {
  const rows = parseCsvRows(text);
  if (!rows.slice(0, 4).some((r) => /a\/r aging summary/i.test(r[0] ?? ""))) return { error: "This doesn't look like an A/R Aging Summary export." };
  const asOfRow = rows.slice(0, 5).find((r) => /^as of /i.test((r[0] ?? "").trim()));
  const asOf = asOfRow ? dateKeyFromText(asOfRow[0].replace(/^as of /i, "")) : null;
  if (!asOf) return { error: 'Couldn\'t find the "As of" date.' };
  const h = headerIndex(rows);
  if (h < 0) return { error: "Couldn't find the column headers." };
  const header = rows[h].map((c) => c.trim());
  const cols = AR_COLUMNS.map(([key, re]) => ({ key, i: header.findIndex((c) => re.test(c)) }));
  const missing = cols.filter((c) => c.i < 0);
  if (missing.length) return { error: "The aging columns aren't the standard ones (Current, 1 - 30, 31 - 60, 61 - 90, 91 and over, Total)." };

  type Item = ArRow & { name: string };
  const items: (Item | { totalFor: string })[] = [];
  let fileTotalCents: number | null = null;
  for (const r of rows.slice(h + 1)) {
    if (isBlank(r)) continue;
    const name = (r[0] ?? "").trim();
    if (/^total for /i.test(name)) {
      items.push({ totalFor: name.replace(/^total for /i, "").trim() });
      continue;
    }
    // Rows with no amounts at all (the timestamp line at the bottom) aren't customers.
    if (cols.every((c) => (r[c.i] ?? "").trim() === "")) continue;
    const values = cols.map((c) => parseAmountCents(r[c.i]));
    if (values.some((v) => v === null)) continue;
    const row = Object.fromEntries(cols.map((c, k) => [c.key, values[k]])) as Omit<ArRow, "customer" | "parent">;
    if (/^total$/i.test(name)) {
      fileTotalCents = row.totalCents;
      continue;
    }
    if (!name) continue;
    items.push({ ...row, name, customer: name, parent: "" });
  }
  const parsed = assignGroups(items).map(({ name: _name, ...row }) => row);
  return { asOf, rows: parsed, fileTotalCents, rowsTotalCents: parsed.reduce((s, r) => s + r.totalCents, 0) };
}
