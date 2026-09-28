import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageJanitorial, canSeeFinancials } from "@/lib/erpAuth";
import { inputToCents } from "@/lib/erp/money";
import { PERIOD_BILLING_STATUSES } from "@/lib/erp/recurringContracts";

type Ctx = { params: Promise<{ id: string }> };

/** billingStatus is editable by anyone who sees Billing (the Billing page's
 * Recurring tab uses this too); the amount only from the Janitorial page. */
export async function PATCH(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canSeeFinancials(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const data: { billingStatus?: string; amountCents?: number } = {};

  if (body.billingStatus !== undefined) {
    const status = String(body.billingStatus).toUpperCase();
    if (!(PERIOD_BILLING_STATUSES as readonly string[]).includes(status)) {
      return NextResponse.json({ error: "Invalid billing status" }, { status: 400 });
    }
    data.billingStatus = status;
  }
  if (body.amount !== undefined) {
    if (!canManageJanitorial(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const cents = inputToCents(body.amount);
    if (cents === null || cents < 0) return NextResponse.json({ error: "Amount must be zero or more" }, { status: 400 });
    data.amountCents = cents;
  }

  try {
    const period = await prisma.recurringContractPeriod.update({ where: { id }, data });
    return NextResponse.json(period);
  } catch (e) {
    console.error("PATCH /api/erp/janitorial/periods/[id]", e);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

/** Removes a month that shouldn't be billed at all (e.g. generated while the
 * contract was on hold). Refused once it's billed or its commission is paid. */
export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canManageJanitorial(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;

  const period = await prisma.recurringContractPeriod.findUnique({ where: { id } });
  if (!period) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (period.billingStatus !== "NOT_BILLED" || period.commissionPaidAt) {
    return NextResponse.json({ error: "Only unbilled months with no commission paid can be removed" }, { status: 409 });
  }

  await prisma.recurringContractPeriod.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
