import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageJanitorial } from "@/lib/erpAuth";
import { inputToCents } from "@/lib/erp/money";
import { parseBillingDay } from "@/lib/erp/recurringContracts";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canManageJanitorial(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};

  if (body.monthlyRate !== undefined) {
    const cents = inputToCents(body.monthlyRate);
    if (cents === null || cents <= 0) return NextResponse.json({ error: "Monthly rate must be a positive number" }, { status: 400 });
    data.monthlyRateCents = cents;
  }
  if (body.billingDayOfMonth !== undefined) {
    const day = parseBillingDay(body.billingDayOfMonth);
    if (day === null) return NextResponse.json({ error: "Billing day must be between 1 and 28" }, { status: 400 });
    data.billingDayOfMonth = day;
  }
  if (body.status !== undefined) {
    const status = String(body.status).toUpperCase();
    if (!["ACTIVE", "PAUSED", "ENDED"].includes(status)) {
      return NextResponse.json({ error: "Status must be ACTIVE, PAUSED, or ENDED" }, { status: 400 });
    }
    data.status = status;
  }
  if (body.startDate !== undefined) {
    const d = new Date(String(body.startDate));
    if (Number.isNaN(d.getTime())) return NextResponse.json({ error: "Invalid start date" }, { status: 400 });
    data.startDate = d;
  }
  if (body.endDate !== undefined) {
    if (body.endDate === null || body.endDate === "") {
      data.endDate = null;
    } else {
      const d = new Date(String(body.endDate));
      if (Number.isNaN(d.getTime())) return NextResponse.json({ error: "Invalid end date" }, { status: 400 });
      data.endDate = d;
    }
  }
  if (body.serviceAreas !== undefined) {
    data.serviceAreas = body.serviceAreas ? String(body.serviceAreas).trim() : null;
  }
  if (body.notes !== undefined) {
    data.notes = body.notes ? String(body.notes).trim() : null;
  }
  if (body.commissionEmployeeId !== undefined) {
    data.commissionEmployeeId = body.commissionEmployeeId ? String(body.commissionEmployeeId).trim() : null;
  }

  try {
    const contract = await prisma.recurringContract.update({ where: { id }, data });
    return NextResponse.json(contract);
  } catch (e) {
    console.error("PATCH /api/erp/janitorial/contracts/[id]", e);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
