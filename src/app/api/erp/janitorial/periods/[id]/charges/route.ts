import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageJanitorial } from "@/lib/erpAuth";
import { inputToCents } from "@/lib/erp/money";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
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

  const description = String(body.description ?? "").trim();
  const amountCents = inputToCents(body.amount);
  if (!description) return NextResponse.json({ error: "Description is required" }, { status: 400 });
  if (amountCents === null || amountCents <= 0) {
    return NextResponse.json({ error: "Amount must be a positive number" }, { status: 400 });
  }

  const period = await prisma.recurringContractPeriod.findUnique({ where: { id }, select: { id: true } });
  if (!period) return NextResponse.json({ error: "Month not found" }, { status: 404 });

  const charge = await prisma.recurringContractCharge.create({ data: { periodId: id, description, amountCents } });
  return NextResponse.json(charge);
}
