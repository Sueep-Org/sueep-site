import { prisma } from "@/lib/prisma";
import type { RecurringContract } from "@prisma/client";

function firstOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export type GeneratePeriodResult =
  | { created: true; periodId: string }
  | { created: false; reason: "already_generated" };

/**
 * Generates the current month's billing period for a recurring contract:
 * a single RecurringContractPeriod holding the flat monthly amount and its
 * billing status. No Projects or TurnoverRequests are created. Idempotent
 * via the (recurringContractId, periodStart) unique constraint: a duplicate
 * call for the same month is a no-op.
 */
export async function generatePeriodForContract(contract: RecurringContract): Promise<GeneratePeriodResult> {
  const periodStart = firstOfMonth(new Date());
  try {
    const period = await prisma.recurringContractPeriod.create({
      data: {
        recurringContractId: contract.id,
        periodStart,
        amountCents: contract.monthlyRateCents,
      },
    });
    return { created: true, periodId: period.id };
  } catch {
    // Unique constraint on (recurringContractId, periodStart) — already generated this month.
    return { created: false, reason: "already_generated" };
  }
}

export function parseBillingDay(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 28 ? n : null;
}

export const PERIOD_BILLING_STATUSES = ["NOT_BILLED", "BILLED", "PAID"] as const;

/** A period's full billed total: the flat amount plus any one-off extras. */
export function periodTotalCents(period: { amountCents: number; charges: { amountCents: number }[] }): number {
  return period.amountCents + period.charges.reduce((s, c) => s + c.amountCents, 0);
}
