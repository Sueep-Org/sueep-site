import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canSeeFinancials } from "@/lib/erpAuth";

type Ctx = { params: Promise<{ id: string; periodId: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canSeeFinancials(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { periodId } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.commissionPaid === undefined) {
    return NextResponse.json({ error: "commissionPaid is required" }, { status: 400 });
  }

  try {
    const period = await prisma.recurringContractPeriod.update({
      where: { id: periodId },
      data: { commissionPaidAt: body.commissionPaid ? new Date() : null },
      include: { recurringContract: { select: { commissionEmployeeId: true, building: { select: { name: true } } } } },
    });

    // Same payout-for-payroll mirroring as the Project PATCH route — see the
    // comment there. The owning employee for a recurring contract has no
    // fallback chain (unlike a one-time deal's HubSpot-owner matching): it's
    // just whoever is set as the contract's commissionEmployeeId.
    if (body.commissionPaid) {
      const commissionCents = Number(body.commissionCents);
      if (Number.isFinite(commissionCents) && commissionCents > 0 && period.recurringContract.commissionEmployeeId) {
        const monthLabel = period.periodStart.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
        await prisma.commissionPayout.upsert({
          where: { sourceType_sourceId: { sourceType: "RECURRING_PERIOD", sourceId: period.id } },
          create: {
            employeeId: period.recurringContract.commissionEmployeeId,
            amountCents: commissionCents,
            paidAt: period.commissionPaidAt ?? new Date(),
            sourceType: "RECURRING_PERIOD",
            sourceId: period.id,
            sourceLabel: `${period.recurringContract.building.name} — ${monthLabel}`,
          },
          update: {
            employeeId: period.recurringContract.commissionEmployeeId,
            amountCents: commissionCents,
            paidAt: period.commissionPaidAt ?? new Date(),
            sourceLabel: `${period.recurringContract.building.name} — ${monthLabel}`,
          },
        });
      }
    } else {
      await prisma.commissionPayout.deleteMany({ where: { sourceType: "RECURRING_PERIOD", sourceId: period.id } });
    }

    return NextResponse.json(period);
  } catch (e) {
    console.error("PATCH .../recurring-contract/periods/[periodId]", e);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
