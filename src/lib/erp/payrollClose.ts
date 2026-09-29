/**
 * Closing a pay period saves its payroll rows exactly as paid
 * (PayrollPeriodClose). A closed period keeps showing those saved numbers;
 * anything that changed afterward (an edited labor log, a late clock-in fix)
 * is listed as a difference instead of silently rewriting what was paid.
 */

import type { PayrollRow } from "@/lib/erp/payrollRows";

export type PayrollChange = {
  name: string;
  savedGrossCents: number | null;
  liveGrossCents: number | null;
  savedHours: number | null;
  liveHours: number | null;
};

function rowKey(r: PayrollRow): string {
  return r.employeeId ?? `${r.isContractor ? "contractor" : "worker"}:${r.name}`;
}

function totalPay(r: PayrollRow): number {
  return r.grossPayCents + (r.commissionCents ?? 0);
}

/** People whose pay or hours differ between what was saved and what the records say now. */
export function diffPayrollRows(saved: PayrollRow[], live: PayrollRow[]): PayrollChange[] {
  const liveByKey = new Map(live.map((r) => [rowKey(r), r]));
  const savedKeys = new Set(saved.map(rowKey));
  const changes: PayrollChange[] = [];
  for (const s of saved) {
    const l = liveByKey.get(rowKey(s));
    if (!l) {
      changes.push({ name: s.name, savedGrossCents: totalPay(s), liveGrossCents: null, savedHours: s.totalHours, liveHours: null });
      continue;
    }
    if (Math.abs(totalPay(s) - totalPay(l)) >= 1 || Math.abs(s.totalHours - l.totalHours) >= 0.01) {
      changes.push({ name: s.name, savedGrossCents: totalPay(s), liveGrossCents: totalPay(l), savedHours: s.totalHours, liveHours: l.totalHours });
    }
  }
  for (const l of live) {
    if (savedKeys.has(rowKey(l))) continue;
    if (totalPay(l) === 0 && l.totalHours === 0) continue;
    changes.push({ name: l.name, savedGrossCents: null, liveGrossCents: totalPay(l), savedHours: null, liveHours: l.totalHours });
  }
  return changes.sort((a, b) => a.name.localeCompare(b.name));
}

export function totalGrossCents(rows: PayrollRow[]): number {
  return rows.reduce((s, r) => s + totalPay(r), 0);
}
