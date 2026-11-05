/**
 * Payroll and commission rules set on the Settings page, as one object the
 * pay and commission math takes. Rules that change what someone is paid keep
 * a dated history (datedSettings.ts), so each pay week or deal uses the rule
 * in effect on its own day. Client-safe. Servers read it with
 * loadPayrollRules (payrollRulesServer.ts).
 */

import { valueOn, type Dated } from "./datedSettings";

export type MarginTier = { minMarginPercent: number; baseRate: number; acceleratorRate: number };

export type PayrollRules = {
  /** Weekly hours before overtime, by the week's Monday */
  otAfterHours: Dated<number>;
  /** Extra on top of straight pay for each overtime hour, 0.5 = time and a half */
  otPremium: Dated<number>;
  /** Hours in a work year, to turn a salary into an hourly cost, by work day */
  yearHours: Dated<number>;
  /** Janitorial shifts this long or longer lose an unpaid break, by shift day */
  breakAfterHours: Dated<number>;
  breakMinutes: Dated<number>;
  /** One-time deal commission by margin, highest first, by the deal's finished day. Below the last tier earns nothing. */
  commissionTiers: Dated<MarginTier[]>;
  /** A rep's yearly revenue after which the accelerator rate applies, by deal day */
  acceleratorCents: Dated<number>;
  /** Recurring contract commission, months 1-12 and 13-24, by the month's start */
  recurringYear1Rate: Dated<number>;
  recurringYear2Rate: Dated<number>;
  /** Flags only, not pay: apply right away */
  lateEarlyMinutes: number;
  farFromBuildingMeters: number;
  inactiveAfterMonths: number;
  safetyViolationLimit: number;
};

export const DEFAULT_COMMISSION_TIERS: MarginTier[] = [
  { minMarginPercent: 30, baseRate: 0.05, acceleratorRate: 0.1 },
  { minMarginPercent: 20, baseRate: 0.03, acceleratorRate: 0.07 },
  { minMarginPercent: 10, baseRate: 0.01, acceleratorRate: 0.03 },
];

const always = <T>(value: T): Dated<T> => [{ from: null, value }];

export const DEFAULT_PAYROLL_RULES: PayrollRules = {
  otAfterHours: always(40),
  otPremium: always(0.5),
  yearHours: always(2080),
  breakAfterHours: always(6),
  breakMinutes: always(30),
  commissionTiers: always(DEFAULT_COMMISSION_TIERS),
  acceleratorCents: always(1_500_000_00),
  recurringYear1Rate: always(0.05),
  recurringYear2Rate: always(0.02),
  lateEarlyMinutes: 15,
  farFromBuildingMeters: 400,
  inactiveAfterMonths: 6,
  safetyViolationLimit: 3,
};

/** The highest tier the margin reaches, or a zero tier below the last one. */
export function marginTierOn(rules: PayrollRules, dateKey: string, marginPercent: number): MarginTier {
  const tiers = valueOn(rules.commissionTiers, dateKey);
  return tiers.find((t) => marginPercent >= t.minMarginPercent) ?? { minMarginPercent: -Infinity, baseRate: 0, acceleratorRate: 0 };
}

/** 0-based month of a recurring contract: months 0-11 year 1, 12-23 year 2, then nothing. */
export function recurringRateOn(rules: PayrollRules, dateKey: string, monthIndex: number): number {
  if (monthIndex < 12) return valueOn(rules.recurringYear1Rate, dateKey);
  if (monthIndex < 24) return valueOn(rules.recurringYear2Rate, dateKey);
  return 0;
}

/** Checks a tiers list someone typed (percents as 0-100). Returns rates as fractions, highest margin first. */
export function readTiers(input: unknown): MarginTier[] | null {
  if (!Array.isArray(input) || input.length === 0 || input.length > 10) return null;
  const tiers: MarginTier[] = [];
  for (const t of input) {
    if (!t || typeof t !== "object") return null;
    const { minMarginPercent, baseRate, acceleratorRate } = t as Record<string, unknown>;
    const nums = [Number(minMarginPercent), Number(baseRate), Number(acceleratorRate)];
    if (nums.some((n) => !Number.isFinite(n))) return null;
    if (nums[0]! < -100 || nums[0]! > 100 || nums[1]! < 0 || nums[1]! > 1 || nums[2]! < 0 || nums[2]! > 1) return null;
    tiers.push({ minMarginPercent: nums[0]!, baseRate: nums[1]!, acceleratorRate: nums[2]! });
  }
  return tiers.sort((a, b) => b.minMarginPercent - a.minMarginPercent);
}
