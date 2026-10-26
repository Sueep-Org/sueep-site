import { prisma } from "@/lib/prisma";
import { utcDateKey } from "@/lib/erp/dates";
import { HEALTH_SHARE_SETTING_KEY, healthCompanyCostForDays, parseHealthSharePct, type CoverageSpan } from "@/lib/erp/healthCost";

export async function loadHealthCoverage(): Promise<{ spans: CoverageSpan[]; sharePct: number }> {
  const [rows, share] = await Promise.all([
    prisma.healthCoverage.findMany({ select: { employeeId: true, monthlyPremiumCents: true, startDate: true, endDate: true } }),
    prisma.appSetting.findUnique({ where: { key: HEALTH_SHARE_SETTING_KEY } }),
  ]);
  return {
    spans: rows.map((c) => ({
      employeeId: c.employeeId, monthlyPremiumCents: c.monthlyPremiumCents,
      startKey: utcDateKey(c.startDate), endKey: c.endDate ? utcDateKey(c.endDate) : null,
    })),
    sharePct: parseHealthSharePct(share?.value),
  };
}

/**
 * Payroll rows with Sueep's share of health insurance for the days of the
 * pay period (healthCents, 0 when the person isn't on the plan). Only
 * people linked to an employee profile show here; owners without one still
 * count on Finance.
 */
export async function withHealthCost<R extends { employeeId: string | null; isContractor: boolean }>(
  rows: R[],
  periodStart: Date,
  periodEnd: Date,
): Promise<(R & { healthCents: number })[]> {
  const { spans, sharePct } = await loadHealthCoverage();
  const dayKeys: string[] = [];
  for (let d = new Date(periodStart); d <= periodEnd; d.setUTCDate(d.getUTCDate() + 1)) dayKeys.push(utcDateKey(d));
  return rows.map((r) => {
    const mine = r.isContractor || !r.employeeId ? [] : spans.filter((s) => s.employeeId === r.employeeId);
    return { ...r, healthCents: mine.length ? Math.round(healthCompanyCostForDays(mine, dayKeys, sharePct)) : 0 };
  });
}
