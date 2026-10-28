import { parseAmountCents, type ArParse, type ArRow, type PnlCheck, type PnlLine, type PnlParse, type PnlSection } from "./qboCsv";

/**
 * Readers for the QuickBooks Reports API (JSON), giving the same shape as the
 * CSV readers in qboCsv.ts so the sync and the upload save the same way.
 *
 * Layout: Columns.Column (the first is the account or customer name), then
 * Rows.Row. A row is either Data (ColData) or a Section with a Header, its
 * own Rows and a Summary. An account or customer with sub-accounts is a
 * Section whose Header carries its own amounts, the same as the group row in
 * the CSV export.
 */

type Cell = { value?: string; id?: string };
type Row = {
  type?: string;
  group?: string;
  ColData?: Cell[];
  Header?: { ColData?: Cell[] };
  Rows?: { Row?: Row[] };
  Summary?: { ColData?: Cell[] };
};
type Column = { ColTitle?: string; ColType?: string; MetaData?: { Name: string; Value: string }[] };
export type QboReport = {
  Header?: { StartPeriod?: string; EndPeriod?: string; ReportBasis?: string; Option?: { Name: string; Value: string }[] };
  Columns?: { Column?: Column[] };
  Rows?: { Row?: Row[] };
};

const GROUP_SECTIONS: Record<string, PnlSection> = {
  Income: "INCOME",
  COGS: "COGS",
  Expenses: "EXPENSE",
  OtherIncome: "OTHER_INCOME",
  OtherExpenses: "OTHER_EXPENSE",
};

const meta = (c: Column, name: string) => c.MetaData?.find((m) => m.Name === name)?.Value;
const cents = (cells: Cell[] | undefined, i: number) => parseAmountCents(cells?.[i]?.value) ?? 0;

export function pnlFromReport(report: QboReport): PnlParse | { error: string } {
  const cols = report.Columns?.Column ?? [];
  const monthCols = cols
    .map((c, i) => {
      const start = meta(c, "StartDate");
      return start && c.ColType === "Money" ? { i, month: start.slice(0, 7) } : null;
    })
    .filter((c): c is { i: number; month: string } => !!c);
  if (!monthCols.length) return { error: "The QuickBooks report came back without month columns." };

  const lines: PnlLine[] = [];
  const checks: PnlCheck[] = [];
  const addLine = (section: PnlSection, account: string, parent: string, cells: Cell[] | undefined) => {
    for (const c of monthCols) {
      const amount = cents(cells, c.i);
      if (amount !== 0) lines.push({ month: c.month, account, parent, section, amountCents: amount });
    }
  };
  const walk = (rows: Row[], section: PnlSection, parent: string) => {
    for (const r of rows) {
      if (r.ColData) {
        addLine(section, r.ColData[0]?.value?.trim() ?? "", parent, r.ColData);
      } else if (r.Header?.ColData) {
        const name = r.Header.ColData[0]?.value?.trim() ?? "";
        addLine(section, name, parent, r.Header.ColData);
        walk(r.Rows?.Row ?? [], section, name);
      }
    }
  };
  for (const top of report.Rows?.Row ?? []) {
    const section = top.group ? GROUP_SECTIONS[top.group] : undefined;
    if (!section) continue;
    walk(top.Rows?.Row ?? [], section, "");
    for (const c of monthCols) {
      const linesCents = lines.filter((l) => l.month === c.month && l.section === section).reduce((s, l) => s + l.amountCents, 0);
      checks.push({ month: c.month, label: section, fileCents: cents(top.Summary?.ColData, c.i), linesCents });
    }
  }
  const basis = report.Header?.ReportBasis?.toLowerCase();
  return {
    periodFrom: report.Header?.StartPeriod ?? null,
    periodTo: report.Header?.EndPeriod ?? null,
    basis: basis === "cash" ? "CASH" : basis === "accrual" ? "ACCRUAL" : null,
    months: monthCols.map((c) => c.month),
    lines,
    checks,
  };
}

const AR_KEYS: Record<string, keyof Omit<ArRow, "customer" | "parent">> = {
  current: "currentCents",
  "0": "days1to30Cents",
  "1": "days31to60Cents",
  "2": "days61to90Cents",
  "3": "over90Cents",
  total: "totalCents",
};

export function arFromReport(report: QboReport, asOf: string): ArParse | { error: string } {
  const cols = (report.Columns?.Column ?? []).map((c, i) => ({ i, key: AR_KEYS[meta(c, "ColKey") ?? ""] })).filter((c) => !!c.key);
  if (cols.length !== 6) return { error: "The QuickBooks aging report didn't have the usual columns." };
  const rows: ArRow[] = [];
  let fileTotalCents: number | null = null;
  const add = (cells: Cell[], parent: string) => {
    const row = Object.fromEntries(cols.map((c) => [c.key, cents(cells, c.i)])) as Omit<ArRow, "customer" | "parent">;
    if (Object.values(row).every((v) => v === 0)) return;
    rows.push({ ...row, customer: cells[0]?.value?.trim() ?? "", parent });
  };
  const walk = (list: Row[], parent: string) => {
    for (const r of list) {
      if (r.group === "GrandTotal") {
        fileTotalCents = cents(r.Summary?.ColData, cols.find((c) => c.key === "totalCents")!.i);
        continue;
      }
      if (r.ColData) add(r.ColData, parent);
      else if (r.Header?.ColData) {
        add(r.Header.ColData, parent);
        walk(r.Rows?.Row ?? [], r.Header.ColData[0]?.value?.trim() ?? "");
      }
    }
  };
  walk(report.Rows?.Row ?? [], "");
  return { asOf, rows, fileTotalCents, rowsTotalCents: rows.reduce((s, r) => s + r.totalCents, 0) };
}
