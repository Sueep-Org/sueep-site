import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageJanitorial } from "@/lib/erpAuth";

type Ctx = { params: Promise<{ id: string }> };

/** Manually adds a billing month (body: { month: "YYYY-MM" }), for months
 * the daily cron didn't generate, e.g. backfilling a contract entered late
 * or billing the current month before its billing day. */
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

  const match = /^(\d{4})-(\d{2})$/.exec(String(body.month ?? ""));
  const monthIndex = match ? Number(match[2]) - 1 : -1;
  if (!match || monthIndex < 0 || monthIndex > 11) {
    return NextResponse.json({ error: "Month must look like 2026-09" }, { status: 400 });
  }
  const periodStart = new Date(Date.UTC(Number(match[1]), monthIndex, 1));

  const contract = await prisma.recurringContract.findUnique({ where: { id }, select: { id: true, monthlyRateCents: true } });
  if (!contract) return NextResponse.json({ error: "Contract not found" }, { status: 404 });

  try {
    const period = await prisma.recurringContractPeriod.create({
      data: { recurringContractId: contract.id, periodStart, amountCents: contract.monthlyRateCents },
    });
    return NextResponse.json(period);
  } catch {
    return NextResponse.json({ error: "That month already exists on this contract" }, { status: 409 });
  }
}
