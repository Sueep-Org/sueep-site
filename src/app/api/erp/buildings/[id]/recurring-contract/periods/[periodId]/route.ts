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
    });
    return NextResponse.json(period);
  } catch (e) {
    console.error("PATCH .../recurring-contract/periods/[periodId]", e);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
