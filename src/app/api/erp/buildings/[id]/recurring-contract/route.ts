import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canSeeFinancials } from "@/lib/erpAuth";
import { inputToCents } from "@/lib/erp/money";

type Ctx = { params: Promise<{ id: string }> };

function parseBillingDay(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 28 ? n : null;
}

export async function GET(_req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canSeeFinancials(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;

  const contract = await prisma.recurringContract.findUnique({
    where: { buildingId: id },
    include: { units: { orderBy: { unitNumber: "asc" } } },
  });
  return NextResponse.json(contract);
}

export async function POST(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canSeeFinancials(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;

  const building = await prisma.building.findUnique({ where: { id }, select: { id: true } });
  if (!building) return NextResponse.json({ error: "Building not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const monthlyRateCents = inputToCents(body.monthlyRate);
  const billingDayOfMonth = parseBillingDay(body.billingDayOfMonth);
  const startDate = new Date(String(body.startDate ?? ""));

  if (monthlyRateCents === null || monthlyRateCents <= 0) {
    return NextResponse.json({ error: "monthlyRate must be a positive number" }, { status: 400 });
  }
  if (billingDayOfMonth === null) {
    return NextResponse.json({ error: "billingDayOfMonth must be an integer between 1 and 28" }, { status: 400 });
  }
  if (Number.isNaN(startDate.getTime())) {
    return NextResponse.json({ error: "Invalid startDate" }, { status: 400 });
  }

  try {
    const contract = await prisma.recurringContract.create({
      data: { buildingId: id, monthlyRateCents, billingDayOfMonth, startDate },
      include: { units: true },
    });
    return NextResponse.json(contract);
  } catch (e) {
    console.error("POST /api/erp/buildings/[id]/recurring-contract", e);
    return NextResponse.json({ error: "This building already has a recurring contract" }, { status: 409 });
  }
}

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

  const data: Record<string, unknown> = {};

  if (body.monthlyRate !== undefined) {
    const cents = inputToCents(body.monthlyRate);
    if (cents === null || cents <= 0) return NextResponse.json({ error: "monthlyRate must be a positive number" }, { status: 400 });
    data.monthlyRateCents = cents;
  }
  if (body.billingDayOfMonth !== undefined) {
    const day = parseBillingDay(body.billingDayOfMonth);
    if (day === null) return NextResponse.json({ error: "billingDayOfMonth must be an integer between 1 and 28" }, { status: 400 });
    data.billingDayOfMonth = day;
  }
  if (body.status !== undefined) {
    const status = String(body.status).toUpperCase();
    if (!["ACTIVE", "PAUSED", "ENDED"].includes(status)) {
      return NextResponse.json({ error: "status must be ACTIVE, PAUSED, or ENDED" }, { status: 400 });
    }
    data.status = status;
  }
  if (body.endDate !== undefined) {
    if (body.endDate === null || body.endDate === "") {
      data.endDate = null;
    } else {
      const d = new Date(String(body.endDate));
      if (Number.isNaN(d.getTime())) return NextResponse.json({ error: "Invalid endDate" }, { status: 400 });
      data.endDate = d;
    }
  }
  if (body.notes !== undefined) {
    data.notes = body.notes ? String(body.notes).trim() : null;
  }

  try {
    const contract = await prisma.recurringContract.update({
      where: { buildingId: id },
      data,
      include: { units: true },
    });
    return NextResponse.json(contract);
  } catch (e) {
    console.error("PATCH /api/erp/buildings/[id]/recurring-contract", e);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
