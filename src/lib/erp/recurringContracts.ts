import { prisma } from "@/lib/prisma";
import { formatUnitDisplay } from "@/lib/erp/unitDisplay";
import type { RecurringContract, RecurringContractUnit } from "@prisma/client";

function monthLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function firstOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function endOfMonth(periodStart: Date): Date {
  return new Date(Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, 0));
}

export type GeneratePeriodResult =
  | { created: true; periodId: string }
  | { created: false; reason: "already_generated" };

/**
 * Generates the current month's billing + unit work for a recurring
 * contract: one revenue-only "billing" Project, plus one TurnoverRequest +
 * cost-only Project per active enrolled unit — no pricing-package lookup,
 * since these units are covered by the flat monthly rate. Idempotent via
 * the RecurringContractPeriod (recurringContractId, periodStart) unique
 * constraint: a duplicate call for the same month is a no-op.
 */
export async function generatePeriodForContract(
  contract: RecurringContract,
  units: RecurringContractUnit[]
): Promise<GeneratePeriodResult> {
  const periodStart = firstOfMonth(new Date());
  const periodEnd = endOfMonth(periodStart);

  const building = await prisma.building.findUniqueOrThrow({ where: { id: contract.buildingId } });

  let period;
  try {
    period = await prisma.recurringContractPeriod.create({
      data: {
        recurringContractId: contract.id,
        periodStart,
        // Placeholder — replaced right after the billing project is created.
        // A real value is required up front since billingProjectId is unique/non-null,
        // and we need the period's own id to link the billing project back to it.
        billingProjectId: "pending",
      },
    });
  } catch {
    // Unique constraint on (recurringContractId, periodStart) — already generated this month.
    return { created: false, reason: "already_generated" };
  }

  const billingProject = await prisma.project.create({
    data: {
      segment: "JANITORIAL_TURNOVER_REQUESTS",
      jobTitle: `${building.name} — Monthly Contract — ${monthLabel(periodStart)}`,
      buildingId: building.id,
      recurringContractPeriodId: period.id,
      contractValueCents: contract.monthlyRateCents,
      projectDate: periodStart,
      projectEndDate: periodEnd,
      percentDone: 0,
      percentInvoiced: 0,
    },
  });

  await prisma.recurringContractPeriod.update({
    where: { id: period.id },
    data: { billingProjectId: billingProject.id },
  });

  const activeUnits = units.filter((u) => u.active);
  await Promise.all(
    activeUnits.map(async (unit) => {
      const request = await prisma.turnoverRequest.create({
        data: {
          buildingId: building.id,
          requestType: "REGULAR",
          unitNumber: unit.unitNumber,
          bedrooms: unit.isCommonArea ? null : unit.bedrooms,
          bathrooms: unit.isCommonArea ? null : unit.bathrooms,
          fullClean: unit.fullClean,
          carpetCleaning: unit.carpetCleaning,
          // Covered by the flat monthly rate — no per-unit pricing-package lookup.
          priceCents: null,
          startDate: periodStart,
          endDate: periodEnd,
        },
      });

      await prisma.project.create({
        data: {
          segment: "JANITORIAL_TURNOVER_REQUESTS",
          jobTitle: `${building.name} - ${formatUnitDisplay(unit.unitNumber)}`,
          buildingId: building.id,
          turnoverRequestId: request.id,
          recurringContractPeriodId: period.id,
          projectDate: periodStart,
          projectEndDate: periodEnd,
          percentDone: 0,
          percentInvoiced: 0,
        },
      });
    })
  );

  return { created: true, periodId: period.id };
}
